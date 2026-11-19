import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    decodeEntities,
    fetchCompanyNews,
    mentionsCompany,
    newsCompanyName,
    newsFullName,
    parseBingNewsRss,
} from '@/lib/news/web-news';

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

describe('newsFullName', () => {
    it('drops legal forms and share classes', () => {
        expect(newsFullName('GREEN TEA GROUP LTD')).toBe('GREEN TEA GROUP');
        expect(newsFullName('CHIFENG JILONG GOLD MINING-H')).toBe('CHIFENG JILONG GOLD MINING');
        expect(newsFullName('JIANGXI COPPER CO LTD-H')).toBe('JIANGXI COPPER CO');
        expect(newsFullName('CHAGEE HOLDINGS LTD-ADR')).toBe('CHAGEE HOLDINGS');
    });

    it('leaves a Chinese name alone', () => {
        expect(newsFullName('绿茶集团')).toBe('绿茶集团');
    });
});

describe('newsCompanyName', () => {
    it('searches the brand publishers write, not the registered name', () => {
        expect(newsCompanyName('MINISO GROUP HOLDING LTD')).toBe('MINISO');
        expect(newsCompanyName('CHINA HONGQIAO GROUP LTD')).toBe('CHINA HONGQIAO');
        expect(newsCompanyName('CHAGEE HOLDINGS LTD-ADR')).toBe('CHAGEE');
    });

    it('keeps the whole name when it is only a product word', () => {
        // "GREEN TEA" names a drink, and searching it returns every article about tea.
        expect(newsCompanyName('GREEN TEA GROUP LTD')).toBe('GREEN TEA GROUP');
    });

    it('uses the fund brand, which is what stories about it carry', () => {
        // The full fund name matches no recent story; publishers write "Pimco".
        expect(newsCompanyName('Pimco Corporate & Income Opportunity Fund')).toBe('Pimco');
        expect(newsCompanyName('PIMCO CORPORATE & INCOME OPP')).toBe('PIMCO');
    });

    it('leaves a Chinese name alone', () => {
        expect(newsCompanyName('绿茶集团')).toBe('绿茶集团');
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
        ), 'Chagee Holdings Ltd')).toBe(false);
    });

    it('keeps a story that names the company only in the summary', () => {
        expect(mentionsCompany(story(
            'PTY: Rare Discount To NAV But Rate Hikes Change Outlook',
            'PIMCO Corporate & Income Opportunity Fund faces rate risk.',
        ), 'PIMCO CORPORATE & INCOME OPP')).toBe(true);
    });

    it('drops a diet article that only shares the words of a green tea company', () => {
        // The watchlist row for 绿茶集团 once filled up with articles about drinking green tea,
        // because its registered name strips down to "GREEN TEA".
        expect(mentionsCompany(story(
            'I’m a dietitian, and I drank green tea every day for a week—here’s what happened',
            'A dietitian’s week-long experiment with the superfood yields surprising results.',
        ), 'GREEN TEA GROUP LTD')).toBe(false);
    });

    it('keeps a story that names the company in full', () => {
        expect(mentionsCompany(story(
            'Green Tea Group Reports Director Resignation and Listing-Rule Non-Compliance',
            'The latest announcement is out from Green Tea Group Limited (6831).',
        ), 'GREEN TEA GROUP LTD')).toBe(true);
    });

    it('matches a Chinese name as one phrase, not as separate words', () => {
        expect(mentionsCompany(story('绿茶集团某独董被泰国司法部调查，退出董事会', ''), '绿茶集团')).toBe(true);
        expect(mentionsCompany(story('A diet story about drinking green tea every day', ''), '绿茶集团')).toBe(false);
    });

    it('requires every identifying word of a multi-word name', () => {
        expect(mentionsCompany(story('China Hongqiao Group price target raised', ''), 'CHINA HONGQIAO GROUP LTD')).toBe(true);
        expect(mentionsCompany(story('Hongqiao says China will build more roads', ''), 'CHINA HONGQIAO GROUP LTD')).toBe(false);
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

    const storyFor = (title: string, description = 'd') => item({
        title, link: tracker('https://example.com/story'), description,
        pubDate: new Date().toUTCString(), source: 'Example',
    });

    it('answers with no stories instead of throwing when the feed is unreachable', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

        await expect(fetchCompanyNews(['Chagee'])).resolves.toEqual([]);
    });

    it('reads the feed once for the same company while the answer is fresh', async () => {
        const fetchSpy = vi.fn().mockResolvedValue(new Response(feed(storyFor('Acme opens a store in Manila'))));
        vi.stubGlobal('fetch', fetchSpy);

        // Its own company, so the count is not the one an earlier test already cached.
        const first = await fetchCompanyNews(['Acme Holdings Ltd']);
        const second = await fetchCompanyNews(['Acme Holdings Ltd']);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(first.map((a) => a.headline)).toEqual(['Acme opens a store in Manila']);
        expect(second.map((a) => a.headline)).toEqual(['Acme opens a store in Manila']);
    });

    it('falls back to the next name when the first one has no matching stories', async () => {
        const fetchSpy = vi.fn()
            .mockResolvedValueOnce(new Response(feed(storyFor('A dietitian drank green tea every day'))))
            .mockResolvedValueOnce(new Response(feed(storyFor('绿茶集团某独董被泰国司法部调查'))));
        vi.stubGlobal('fetch', fetchSpy);

        const articles = await fetchCompanyNews(['GREEN TEA GROUP LTD', '绿茶集团']);

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(articles.map((a) => a.headline)).toEqual(['绿茶集团某独董被泰国司法部调查']);
    });

    it('does not fall through to a name that only shares generic words', async () => {
        const fetchSpy = vi.fn().mockResolvedValue(new Response(feed(storyFor('A dietitian drank green tea every day'))));
        vi.stubGlobal('fetch', fetchSpy);

        const articles = await fetchCompanyNews(['GREEN TEA GROUP LTD']);

        expect(articles).toEqual([]);
    });
});
