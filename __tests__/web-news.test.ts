import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeEntities, fetchCompanyNews, mentionsCompany, newsQueryFor, parseBingNewsRss } from '@/lib/news/web-news';

const NOW = Date.parse('2026-10-30T04:00:00Z');

const item = ({ title, link, description, pubDate, source }: Record<string, string>) => `<item>
<title>${title}</title>
<link>${link}</link>
<description>${description}</description>
<pubDate>${pubDate}</pubDate>
<News:Source>${source}</News:Source>
</item>`;

const feed = (...items: string[]) => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;

const tracker = (url: string) =>
    `http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;tid=abc&amp;url=${encodeURIComponent(url)}&amp;mkt=en-us`;

describe('newsQueryFor', () => {
    it('searches the brand name publishers write, not the registered name', () => {
        expect(newsQueryFor('CHAGEE HOLDINGS LTD-ADR')).toBe('CHAGEE');
        expect(newsQueryFor('MINISO GROUP HOLDING LTD')).toBe('MINISO');
        expect(newsQueryFor('Miniso Group')).toBe('Miniso');
        expect(newsQueryFor('BYD Company')).toBe('BYD');
    });

    it('keeps a name that has no corporate form to strip', () => {
        expect(newsQueryFor('PIMCO Corporate & Income Opportunity Fund')).toBe('PIMCO Corporate & Income Opportunity Fund');
        expect(newsQueryFor('PIMCO CORPORATE & INCOME OPP')).toBe('PIMCO CORPORATE & INCOME OPP');
        expect(newsQueryFor('China Mobile')).toBe('China Mobile');
    });

    it('never strips a name down to nothing', () => {
        expect(newsQueryFor('Group')).toBe('Group');
        expect(newsQueryFor('  ')).toBe('');
    });
});

describe('decodeEntities', () => {
    it('decodes named and numeric entities, and leaves unknown ones alone', () => {
        expect(decodeEntities('Rappler &amp; Co &#39;tea&#x27; &bogus;')).toBe("Rappler & Co 'tea' &bogus;");
    });
});

describe('mentionsCompany', () => {
    const story = (headline: string, summary = '') => ({ id: 1, headline, summary });

    it('drops a search hit that never names the company', () => {
        expect(mentionsCompany(story(
            'Wider talent pools, smoother operations: What these S’pore firms gain',
            'Job redesign and targeted support help employees with disabilities.',
        ), 'Chagee')).toBe(false);
    });

    it('keeps a story that names the company only in the summary', () => {
        expect(mentionsCompany(story(
            'PTY: Rare Discount To NAV But Rate Hikes Change Outlook',
            'PIMCO Corporate & Income Opportunity Fund faces rate risk.',
        ), 'PIMCO Corporate & Income Opportunity')).toBe(true);
    });

    it('keeps a story whose name is punctuated differently from the query', () => {
        expect(mentionsCompany(story('Miniso Group reports a quarter of buybacks'), 'Chagee')).toBe(false);
        expect(mentionsCompany(story('MINISO Group Holding Limited (MNSO) slides'), 'Miniso')).toBe(true);
    });
});

describe('parseBingNewsRss', () => {
    it('links to the publisher and keeps the story as plain text', () => {
        const [article] = parseBingNewsRss(feed(item({
            title: 'Chagee&#39;s new drinks use espresso shots',
            link: tracker('https://www.rappler.com/culture-desk/chagee-teaspresso-new-drink/'),
            description: 'Chagee&#39;s new <b>Teaspresso</b> drinks &amp; more.',
            pubDate: 'Thu, 29 Oct 2026 04:18:00 GMT',
            source: 'Rappler',
        })), NOW);

        expect(article.url).toBe('https://www.rappler.com/culture-desk/chagee-teaspresso-new-drink/');
        expect(article.headline).toBe("Chagee's new drinks use espresso shots");
        expect(article.summary).toBe("Chagee's new Teaspresso drinks & more.");
        expect(article.source).toBe('Rappler');
        expect(article.datetime).toBe(Date.parse('2026-10-29T04:18:00Z') / 1000);
    });

    it('drops stories outside the window instead of showing them as recent news', () => {
        const articles = parseBingNewsRss(feed(
            item({
                title: 'Fresh', link: tracker('https://example.com/fresh'), description: 'd',
                pubDate: 'Thu, 29 Oct 2026 04:18:00 GMT', source: 'Example',
            }),
            item({
                title: 'Stale', link: tracker('https://example.com/stale'), description: 'd',
                pubDate: 'Mon, 01 Sep 2025 04:18:00 GMT', source: 'Example',
            }),
        ), NOW);

        expect(articles.map((a) => a.headline)).toEqual(['Fresh']);
    });

    it('drops items whose link is not an article on the web', () => {
        const articles = parseBingNewsRss(feed(
            item({
                title: 'Script', link: tracker('javascript:alert(1)'), description: 'd',
                pubDate: 'Thu, 29 Oct 2026 04:18:00 GMT', source: 'Example',
            }),
            item({
                title: 'No snippet', link: tracker('https://example.com/quote-page'), description: '',
                pubDate: 'Thu, 29 Oct 2026 04:18:00 GMT', source: 'Example',
            }),
        ), NOW);

        expect(articles).toEqual([]);
    });

    it('sorts newest first and names the publisher by host when the feed omits it', () => {
        const articles = parseBingNewsRss(feed(
            item({
                title: 'Older', link: tracker('https://www.example.com/older'), description: 'd',
                pubDate: 'Wed, 28 Oct 2026 04:18:00 GMT', source: '',
            }),
            item({
                title: 'Newer', link: tracker('https://news.example.com/newer'), description: 'd',
                pubDate: 'Thu, 29 Oct 2026 04:18:00 GMT', source: 'Example News',
            }),
        ), NOW);

        expect(articles.map((a) => a.headline)).toEqual(['Newer', 'Older']);
        expect(articles[1].source).toBe('example.com');
    });
});

describe('fetchCompanyNews', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('answers with no stories instead of throwing when the feed is unreachable', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

        await expect(fetchCompanyNews('Miniso')).resolves.toEqual([]);
    });

    it('reads the feed once for the same company while the answer is fresh', async () => {
        const fetchSpy = vi.fn().mockResolvedValue(new Response(feed(item({
            title: 'Chagee opens a store in Manila', link: tracker('https://example.com/story'), description: 'd',
            pubDate: new Date().toUTCString(), source: 'Example',
        }))));
        vi.stubGlobal('fetch', fetchSpy);

        const first = await fetchCompanyNews('Chagee');
        const second = await fetchCompanyNews('Chagee');

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(first.map((a) => a.headline)).toEqual(['Chagee opens a store in Manila']);
        expect(second).toBe(first);
    });
});
