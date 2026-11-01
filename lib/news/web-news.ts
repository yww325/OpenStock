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

// Corporate forms that carry no meaning in a news search: "MINISO GROUP HOLDING LTD" is written
// "Miniso" by publishers. Only trailing forms are removed, and never the last word, so a fund
// name such as "PIMCO Corporate & Income Opportunity Fund" is searched as it is.
const LEGAL_FORM =
    /(?:[\s,&-]+(?:LTD|LIMITED|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|PLC|HOLDINGS?|GROUP|ADRs?|UNSPONSORED|CLASS\s+[A-Z]|N\.?V\.?|S\.?A\.?|AG|SE|L\.?P\.?))$/i;

export function newsQueryFor(name: string): string {
    let query = name.replace(/\s+/g, ' ').trim();
    for (;;) {
        const stripped = query.replace(LEGAL_FORM, '').trim();
        if (stripped === query || !stripped) return query;
        query = stripped;
    }
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

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

// A search hit is not company news: Bing returned a Singapore hiring story under "Chagee"
// because the brand appears somewhere on the page. The story has to name the company the query
// names. Very short queries ("F") say nothing, so they are not gated.
export function mentionsCompany(article: RawNewsArticle, query: string): boolean {
    const needle = normalized(query);
    if (needle.length < 3) return true;
    return normalized(`${article.headline || ''} ${article.summary || ''}`).includes(needle);
}

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

// Best effort by design: a missing feed costs the page its stories, not the whole watchlist.
export async function fetchCompanyNews(query: string): Promise<RawNewsArticle[]> {
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
            return parseBingNewsRss(await response.text()).filter((article) => mentionsCompany(article, query));
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
