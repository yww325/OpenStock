// Company news for listings Finnhub's free plan does not cover. Finnhub answers 403 for every
// exchange outside the US, so a Hong Kong watchlist (9896.HK) had no company news at all, and a
// thinly covered ADR (CHA) had none either.
//
// Bing's news RSS is the source used here: free, no key, and — measured from this host — it
// returns Hong Kong listings and US ADRs by company name with a direct link to the publisher.
// Google News RSS also answers, but every link is a news.google.com redirect that needs
// JavaScript to reach the article, so the reader would land on Google instead of the story.
//
// A plain module rather than part of the 'use server' actions file: those may only export async
// actions, and the parsing below is worth testing on its own.

const RSS_ENDPOINT = 'https://www.bing.com/news/search';
const TIMEOUT_MS = 5000;
// One feed read per query per few minutes: a watchlist render must not hammer Bing.
const CACHE_TTL_MS = 5 * 60_000;
// A feed that just failed is not retried for a minute, so one outage costs one timeout.
const FAILURE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;
// Bing is a public search endpoint; keep a burst (a long watchlist) to a polite number of sockets.
const MAX_IN_FLIGHT = 3;

// Stories older than this are not news any more. The page shows relative times, so a stale item
// reads as "3 weeks ago" next to a price that moved today.
export const NEWS_WINDOW_DAYS = 5;

// Legal forms and share classes that say nothing about the company: "MINISO GROUP HOLDING LTD" is
// written "Miniso" by publishers, and "CHIFENG JILONG GOLD MINING-H" is its H-shares.
const LEGAL_FORM =
    /(?:[\s,&-]+(?:LTD|LIMITED|INC|INCORPORATED|CORP|CORPORATION|PLC|ADRs?|UNSPONSORED|CLASS\s+[A-Z]))$/i;
const SHARE_CLASS = /[- ](?:ADR|H|N|S|A|B|C)$/i;

// The same for a Chinese name, which carries its legal form inline: 江西铜业股份有限公司 is the
// company 江西铜业股份.
const HAN_LEGAL_FORM = /(?:股份有限公司|有限责任公司|有限公司)$/;

// Words that end a company's distinctive name: "MINISO GROUP HOLDING" is the company MINISO.
const BRAND_STOP_WORD =
    /^(?:group|holdings?|company|corporation|corporate|limited|ltd|inc|incorporated|plc|co|ag|sa|nv|lp|international|global|world|national|enterprise|ventures|capital|partners?|technologies|technology|industries|industry)$/i;

// Common product words. A name made only of these says nothing about a company: "GREEN TEA" is
// a drink, and every article about drinking it mentions it.
const GENERIC_WORD =
    /^(?:green|tea|coffee|food|foods|drink|drinks|beverage|bank|oil|gas|iron|steel|gold|silver|copper|mining|mine|media|health|care|energy|power|electric|retail|telecom|insurance|motor|auto|pharma|chemical|properties|real|estate|resources|materials|entertainment|sports|education|travel|hotel|hotels|fashion|beauty|logistics|shipping|airline|airlines|software|cloud|data|semi|semiconductor|mobile|internet|digital|new|world|global|national|international|universe|corporate|income|enterprise|ventures|capital|holdings?|group|company|corporation|limited|ltd|inc|plc|co)$/i;

// Chinese names have no spaces to split on, so they are matched as one phrase.
const hasHanCharacters = (value: string) => /[\u3400-\u9fff]/.test(value);

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const stripSuffixes = (name: string) => {
    let value = name.replace(/\s+/g, ' ').trim();
    for (;;) {
        const stripped = value.replace(SHARE_CLASS, '').replace(LEGAL_FORM, '').trim();
        if (stripped === value || !stripped) return value;
        value = stripped;
    }
};

// The registered name without its legal forms: "GREEN TEA GROUP LTD" is "GREEN TEA GROUP".
export function newsFullName(name: string): string {
    const trimmed = name.replace(/\s+/g, ' ').trim();
    if (hasHanCharacters(trimmed)) return trimmed.replace(HAN_LEGAL_FORM, '');
    return stripSuffixes(trimmed);
}

// The distinctive head of the name: "MINISO GROUP HOLDING LTD" is "MINISO", "CHINA HONGQIAO
// GROUP LTD" is "CHINA HONGQIAO". This is what publishers write, so it makes the best search.
function brandOf(full: string): string {
    const words = full.split(/\s+/).filter(Boolean);
    const stop = words.findIndex((word) => BRAND_STOP_WORD.test(word));
    return (stop === -1 ? words : words.slice(0, stop)).join(' ').trim() || full;
}

// The name a story has to use to be recognised as news about this company, and the query to
// find those stories.
//
// It is the brand publishers write ("Miniso", "Chagee", "Pimco"), because that is what a story
// carries. The exception is a brand made only of common words: "GREEN TEA GROUP" would otherwise
// be searched as "GREEN TEA", which is a drink, and every article about drinking it mentions it.
export function newsCompanyName(name: string): string {
    const full = newsFullName(name);
    if (hasHanCharacters(full)) return full;

    const brand = brandOf(full);
    const words = brand.split(/\s+/).filter(Boolean);
    const onlyGeneric = words.length > 0 && words.every((word) => GENERIC_WORD.test(word));
    return onlyGeneric ? full : brand;
}

// A search hit is not company news: Bing returned a Singapore hiring story under "Chagee"
// because the brand appears somewhere on the page, and a diet article under "GREEN TEA" because
// that is a drink. The story has to name the company.
//
// `companyName` is the registered name, never the shortened search query: the shortened form of
// "GREEN TEA GROUP LTD" is "GREEN TEA", which every article about tea mentions.
export function mentionsCompany(article: RawNewsArticle, companyName: string): boolean {
    const name = newsCompanyName(companyName);
    if (!name) return true;

    const text = `${article.headline || ''} ${article.summary || ''}`;

    // A Chinese name is one phrase: "绿茶集团" either appears or it does not. Splitting it into
    // words would match any article mentioning tea.
    if (hasHanCharacters(name)) return text.includes(name);

    // The whole name has to be there as a phrase, so "China Hongqiao" is not satisfied by a
    // story that only says "Hongqiao".
    return normalized(text).includes(normalized(name));
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

// Feed text is HTML-escaped, and a headline is not a place to render markup from someone else's
// server. Everything below ends up as plain text in a React node.
export function decodeEntities(value: string): string {
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
        if (entity.startsWith('#')) {
            const hex = entity[1] === 'x' || entity[1] === 'X';
            const code = Number.parseInt(hex ? entity.slice(2) : entity.slice(1), hex ? 16 : 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

const textOf = (value: string) =>
    decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();

const field = (block: string, tag: string) => {
    const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return match ? textOf(match[1]) : '';
};

// Bing wraps every result in its own click tracker; the publisher's URL is the `url` parameter.
// Anything that is not http(s) is dropped rather than handed to an anchor href.
function articleUrl(link: string): string | null {
    if (!link) return null;
    try {
        const tracker = new URL(link);
        const target = new URL(tracker.searchParams.get('url') || tracker.toString());
        return target.protocol === 'https:' || target.protocol === 'http:' ? target.toString() : null;
    } catch {
        return null;
    }
}

const idFrom = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
    return Math.abs(hash);
};

export function parseBingNewsRss(xml: string, now = Date.now()): RawNewsArticle[] {
    const cutoff = now - NEWS_WINDOW_DAYS * 86_400_000;
    const articles: RawNewsArticle[] = [];

    for (const item of xml.split(/<item>/i).slice(1)) {
        const block = item.split(/<\/item>/i)[0];
        const headline = field(block, 'title');
        const url = articleUrl(field(block, 'link'));
        const summary = field(block, 'description');
        const datetime = Math.floor(Date.parse(field(block, 'pubDate')) / 1000);
        if (!headline || !url || !summary) continue;
        if (!Number.isFinite(datetime) || datetime * 1000 < cutoff) continue;

        articles.push({
            id: idFrom(url),
            headline,
            summary,
            url,
            datetime,
            // Bing names the publisher separately; the hostname is the fallback for items that
            // omit it.
            source: field(block, 'News:Source') || new URL(url).hostname.replace(/^www\./, ''),
            category: 'company',
        });
    }

    return articles.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
}

type CacheEntry = { articles: RawNewsArticle[]; freshUntil: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RawNewsArticle[]>>();
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
    if (active >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
        return await run();
    } finally {
        active--;
        waiting.shift()?.();
    }
}

function remember(url: string, entry: CacheEntry) {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(url, entry);
}

// One feed read. Best effort by design: a missing feed costs the page its stories, not the
// whole watchlist.
async function readFeed(query: string): Promise<RawNewsArticle[]> {
    const url = `${RSS_ENDPOINT}?q=${encodeURIComponent(query)}&format=RSS&setmkt=en-US&setlang=en-US`;

    const hit = cache.get(url);
    if (hit && hit.freshUntil > Date.now()) return hit.articles;

    let pending = inFlight.get(url);
    if (!pending) {
        pending = withSlot(async () => {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenStock/1.0)' },
                signal: AbortSignal.timeout(TIMEOUT_MS),
                cache: 'no-store',
            });
            if (!response.ok) throw new Error(`Bing news RSS answered ${response.status}`);
            return parseBingNewsRss(await response.text());
        }).then(
            (articles) => {
                remember(url, { articles, freshUntil: Date.now() + CACHE_TTL_MS });
                return articles;
            },
            (error) => {
                remember(url, { articles: [], freshUntil: Date.now() + FAILURE_TTL_MS });
                console.error('Error fetching web news for', query, error);
                return [];
            },
        ).finally(() => inFlight.delete(url));
        inFlight.set(url, pending);
    }

    return pending;
}

// The names a company is known by, most specific first: its local name (绿茶集团), the name the
// app keeps (Miniso Group), the registered name (MINISO GROUP HOLDING LTD). Each is searched
// under its own brand spelling and checked against its own full name, so a listing written one
// way in English and another way in Chinese still finds its news without a broad query letting
// unrelated stories through.
export async function fetchCompanyNews(names: string[]): Promise<RawNewsArticle[]> {
    for (const name of names) {
        const query = newsCompanyName(name);
        if (!query) continue;
        const articles = (await readFeed(query)).filter((article) => mentionsCompany(article, name));
        if (articles.length > 0) return articles;
    }

    return [];
}
