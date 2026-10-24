import { describe, expect, it } from 'vitest';

import { fromFutuCode, isHkSymbol, toFutuCode } from '@/lib/futu/symbols';
import { snapshotToQuote, snapshotToSecurityInfo } from '@/lib/futu/quote';
import { searchHongKong } from '@/lib/futu/hk-universe';
import { getMarket, isMarketOpen, quoteSource } from '@/lib/markets';

// A real Hong Kong snapshot: Tencent on 23 October 2026, as Futu reported it.
const TENCENT = {
    basic: {
        security: { market: 1, code: '00700' },
        name: '腾讯控股',
        curPrice: 386,
        lastClosePrice: 382.4,
        openPrice: 381.8,
        highPrice: 388.8,
        lowPrice: 378,
        volume: 33161473,
        turnover: 12729500000,
        updateTimestamp: 1792000000,
        lotSize: 100,
    },
    equityExData: {
        issuedMarketVal: 3_690_000_000_000,
        peRate: 14.099,
        pbRate: 3.4,
        dividendRatioTTM: 0.83,
    },
};

describe('Hong Kong symbols', () => {
    it('reads every spelling of a Hong Kong ticker as the same security', () => {
        expect(toFutuCode('0700.HK')).toBe('00700');
        expect(toFutuCode('700.HK')).toBe('00700');
        expect(toFutuCode('HKEX:700')).toBe('00700');
        expect(toFutuCode('HK.00700')).toBe('00700');
        expect(toFutuCode(' 0700.hk ')).toBe('00700');
    });

    it('pads Hong Kong codes to the five digits Futu expects', () => {
        expect(toFutuCode('0005.HK')).toBe('00005');
        expect(toFutuCode('9988.HK')).toBe('09988');
        expect(toFutuCode('3690.HK')).toBe('03690');
    });

    it('leaves symbols that are not Hong Kong listings alone', () => {
        expect(toFutuCode('AAPL')).toBeNull();
        expect(toFutuCode('RELIANCE.NS')).toBeNull();
        expect(toFutuCode('BINANCE:BTCUSDT')).toBeNull();
        expect(toFutuCode('123456.HK')).toBeNull();
        expect(toFutuCode('0700.XX')).toBeNull();
        expect(isHkSymbol('AAPL')).toBe(false);
        expect(isHkSymbol('0700.HK')).toBe(true);
    });

    it('writes Hong Kong tickers the way the app stores them', () => {
        expect(fromFutuCode('00700')).toBe('0700.HK');
        expect(fromFutuCode('00005')).toBe('0005.HK');
        expect(fromFutuCode('09988')).toBe('9988.HK');
        // The round trip has to keep the same ticker
        expect(fromFutuCode(toFutuCode('0700.HK')!)).toBe('0700.HK');
        expect(fromFutuCode(toFutuCode('0005.HK')!)).toBe('0005.HK');
    });
});

describe('Futu snapshots', () => {
    it('maps a snapshot onto the quote shape the app uses', () => {
        const quote = snapshotToQuote(TENCENT);

        expect(quote.c).toBe(386);
        expect(quote.d).toBeCloseTo(3.6, 6);
        expect(quote.dp).toBeCloseTo(0.9414, 3);
        expect(quote.o).toBe(381.8);
        expect(quote.h).toBe(388.8);
        expect(quote.l).toBe(378);
        expect(quote.pc).toBe(382.4);
        expect(quote.t).toBe(1792000000);
    });

    it('does not divide by a missing previous close', () => {
        const quote = snapshotToQuote({ basic: { curPrice: 386, lastClosePrice: 0 } });

        expect(quote.c).toBe(386);
        expect(quote.dp).toBeUndefined();
    });

    it('reports market capitalisation in millions, like Finnhub', () => {
        const info = snapshotToSecurityInfo(TENCENT, 'Tencent Holdings');

        expect(info.marketCap).toBe(3_690_000);
        expect(info.peRatio).toBe(14.099);
        expect(info.lotSize).toBe(100);
        // Futu answers in Chinese, so the app's own English name wins
        expect(info.name).toBe('Tencent Holdings');
    });

    it('falls back to the Futu name when the app has none', () => {
        const info = snapshotToSecurityInfo(TENCENT, '');

        expect(info.name).toBe('腾讯控股');
    });
});

describe('Hong Kong search', () => {
    it('finds a listing by code and by name', () => {
        expect(searchHongKong('0700').map((s) => s.symbol)).toContain('0700.HK');
        expect(searchHongKong('700').map((s) => s.symbol)).toContain('0700.HK');
        expect(searchHongKong('tencent').map((s) => s.symbol)).toContain('0700.HK');
        expect(searchHongKong('9988').map((s) => s.symbol)).toContain('9988.HK');
    });

    it('offers popular listings when nothing is typed, and nothing for a US ticker', () => {
        expect(searchHongKong('').length).toBeGreaterThan(0);
        expect(searchHongKong('AAPL')).toEqual([]);
    });
});

describe('the Hong Kong market', () => {
    it('is priced by Futu rather than Finnhub', () => {
        expect(quoteSource('0700.HK')).toBe('futu');
        expect(quoteSource('AAPL')).toBe('finnhub');
        expect(quoteSource('XETR:SAP')).toBe('tradingview');
    });

    it('is closed for the lunch break and at the weekend', () => {
        const market = getMarket('hk');
        const at = (utc: string) => isMarketOpen(market, new Date(utc));

        expect(at('2026-10-26T02:00:00Z')).toBe(true);   // 10:00 in Hong Kong
        expect(at('2026-10-26T04:30:00Z')).toBe(false);  // 12:30, lunch
        expect(at('2026-10-26T07:00:00Z')).toBe(true);   // 15:00, afternoon session
        expect(at('2026-10-26T09:00:00Z')).toBe(false);  // 17:00, closed
        expect(at('2026-10-24T02:00:00Z')).toBe(false);  // Saturday
    });
});
