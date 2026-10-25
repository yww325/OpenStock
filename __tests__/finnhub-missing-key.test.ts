import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Hong Kong side talks to Futu OpenD, which is not running in every environment. The test
// only cares that the Hong Kong half is still served, so the gateway is stubbed out.
vi.mock('@/lib/futu/quotes', () => ({
    getFutuQuotes: vi.fn(async (symbols: string[]) =>
        Object.fromEntries(symbols.map((symbol) => [symbol, { c: 1, t: 1 }])),
    ),
    getFutuSecurityInfo: vi.fn(async (symbols: string[]) =>
        Object.fromEntries(symbols.map((symbol) => [symbol, null])),
    ),
}));

// The key pool is read when the module loads, so the environment has to be cleared before the
// import, and the module registry has to be reset between the cases.
async function loadWithoutFinnhubKey() {
    vi.resetModules();
    delete process.env.FINNHUB_API_KEYS;
    delete process.env.FINNHUB_API_KEY;
    delete process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    return await import('@/lib/actions/finnhub.actions');
}

describe('Finnhub without an API key', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('the network must not be touched'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.FINNHUB_API_KEYS;
        delete process.env.FINNHUB_API_KEY;
        delete process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    });

    it('answers with null instead of throwing for every symbol', async () => {
        const { getQuote } = await loadWithoutFinnhubKey();

        await expect(getQuote('AAPL')).resolves.toBeNull();
        await expect(getQuote('MSFT')).resolves.toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('says once that the key is missing, and never with a stack trace', async () => {
        const { getQuote } = await loadWithoutFinnhubKey();

        await getQuote('AAPL');
        await getQuote('MSFT');
        await getQuote('SPY');

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const [message] = errorSpy.mock.calls[0];
        expect(String(message)).toContain('FINNHUB_API_KEYS');
        const logged = errorSpy.mock.calls[0] as unknown as unknown[];
        expect(logged.some((arg: unknown) => arg instanceof Error)).toBe(false);
    });

    it('keeps a whole watchlist off the network', async () => {
        vi.resetModules();
        delete process.env.FINNHUB_API_KEYS;
        delete process.env.FINNHUB_API_KEY;
        delete process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        const { getLiveQuotes } = await import('@/lib/quotes');

        const quotes = await getLiveQuotes(['AAPL', 'MSFT', 'SPY']);

        expect(quotes).toEqual({ AAPL: null, MSFT: null, SPY: null });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('still serves the Hong Kong side, which needs no key', async () => {
        vi.resetModules();
        delete process.env.FINNHUB_API_KEYS;
        delete process.env.FINNHUB_API_KEY;
        delete process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
        const { getLiveQuotes } = await import('@/lib/quotes');

        const quotes = await getLiveQuotes(['0700.HK']);

        expect(quotes).toHaveProperty('0700.HK');
    });
});
