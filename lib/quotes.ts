// One place that answers "what does this symbol trade at". Two providers cover the app:
// Finnhub for US stocks and crypto, Futu OpenD for Hong Kong listings. The rest of the app
// asks this module and never has to know which provider answered.
//
// This is a server-side module on purpose: it talks to OpenD and reads API keys, so it must
// not be reachable as a public server action.

import { getCompanyProfile, getQuote } from '@/lib/actions/finnhub.actions';
import { isFinnhubConfigured } from '@/lib/finnhub/keys';
import { getFutuQuotes, getFutuSecurityInfo } from '@/lib/futu/quotes';
import { HK_CURRENCY, isHkSymbol } from '@/lib/futu/symbols';
import { hasFinnhubQuotes } from '@/lib/markets';
import { QUOTE_TTL_SECONDS } from '@/lib/market-data';

export type LiveQuote = {
    c?: number;  // last price
    d?: number;  // change against the previous close
    dp?: number; // change, in percent
    h?: number;
    l?: number;
    o?: number;
    pc?: number;
    t?: number;  // unix seconds of the last trade
};

export type WatchlistRow = {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    name: string;
    logo?: string;
    marketCap?: number;
    peRatio: number;
};

// Quotes for anything shown live on screen (pages and /api/quotes), keyed by symbol.
export async function getLiveQuotes(symbols: string[]): Promise<Record<string, LiveQuote | null>> {
    const hongKong = symbols.filter(isHkSymbol);
    const rest = symbols.filter((symbol) => !isHkSymbol(symbol));

    const [futu, finnhub] = await Promise.all([
        getFutuQuotes(hongKong),
        getFinnhubQuotes(rest),
    ]);

    return { ...finnhub, ...futu };
}

// Finnhub prices the US listings and crypto pairs the free plan covers.
async function getFinnhubQuotes(symbols: string[]): Promise<Record<string, LiveQuote | null>> {
    // Without a key every symbol would cost one failed request, one cache entry and one log line.
    // The market page asks for two dozen symbols at a time, so check once and answer with nulls.
    if (!isFinnhubConfigured()) {
        return Object.fromEntries(symbols.map((s) => [s, null]));
    }
    // Symbols the free plan can't price are skipped instead of spending a request on a 403
    const quotes = await Promise.all(symbols.map((s) => (hasFinnhubQuotes(s) ? getQuote(s, QUOTE_TTL_SECONDS) : null)));
    return Object.fromEntries(symbols.map((s, i) => [s, quotes[i]?.c ? quotes[i] : null]));
}

// The rows the watchlist table shows, one per symbol, in the order they were asked for.
export async function getWatchlistData(symbols: string[]): Promise<WatchlistRow[]> {
    if (!symbols?.length) return [];

    const rows = await Promise.all(symbols.map((symbol) => (
        isHkSymbol(symbol) ? getHongKongRow(symbol) : getFinnhubRow(symbol)
    )));

    return rows;
}

async function getFinnhubRow(symbol: string): Promise<WatchlistRow> {
    const covered = hasFinnhubQuotes(symbol);
    const [quote, profile] = covered
        ? await Promise.all([getQuote(symbol, QUOTE_TTL_SECONDS), getCompanyProfile(symbol)])
        : [null, null];

    return {
        symbol,
        price: quote?.c || 0,
        change: quote?.d || 0,
        changePercent: quote?.dp || 0,
        currency: profile?.currency || 'USD',
        name: profile?.name || symbol,
        logo: profile?.logo,
        marketCap: profile?.marketCapitalization,
        peRatio: 0, // Finnhub's quote and profile endpoints don't give a real-time PE.
    };
}

async function getHongKongRow(symbol: string): Promise<WatchlistRow> {
    const [quotes, info] = await Promise.all([
        getFutuQuotes([symbol]),
        getFutuSecurityInfo([symbol]),
    ]);
    const quote = quotes[symbol];
    const security = info[symbol];

    return {
        symbol,
        price: quote?.c || 0,
        change: quote?.d || 0,
        changePercent: quote?.dp || 0,
        currency: HK_CURRENCY,
        name: security?.name || symbol,
        marketCap: security?.marketCap,
        peRatio: security?.peRatio || 0,
    };
}
