// Turns a Futu snapshot into the shapes the app already uses. The app quotes Finnhub, whose
// quote object has c/d/dp/h/l/o/pc/t, so a Futu snapshot is mapped onto the same fields and
// every screen keeps working unchanged.
//
// The types are structural on purpose: they describe the parts of the Futu protocol this
// file reads, not the SDK's generated types (the SDK ships no type definitions).

export type FutuQuote = {
    c?: number;  // last price
    d?: number;  // change against the previous close
    dp?: number; // change, in percent
    h?: number;  // day high
    l?: number;  // day low
    o?: number;  // open
    pc?: number; // previous close
    t?: number;  // unix seconds of the last update
};

export type FutuSnapshot = {
    basic?: {
        security?: { market?: number; code?: string };
        name?: string;
        curPrice?: number;
        lastClosePrice?: number;
        openPrice?: number;
        highPrice?: number;
        lowPrice?: number;
        volume?: number;
        turnover?: number;
        updateTimestamp?: number;
        lotSize?: number;
        isSuspend?: boolean;
    };
    equityExData?: {
        issuedMarketVal?: number;
        peRate?: number;
        pbRate?: number;
        netAssetPershare?: number;
        earningsPershare?: number;
        dividendRatioTTM?: number;
    };
};

export type FutuSecurityInfo = {
    name: string;
    // In millions, the way Finnhub reports market capitalisation, so the same formatter works.
    marketCap?: number;
    peRatio?: number;
    pbRatio?: number;
    dividendYield?: number;
    lotSize?: number;
    suspended?: boolean;
};

const num = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function snapshotToQuote(snapshot: FutuSnapshot): FutuQuote {
    const b = snapshot.basic ?? {};
    const last = num(b.curPrice);
    const prev = num(b.lastClosePrice);
    const change = last !== undefined && prev !== undefined ? last - prev : undefined;

    return {
        c: last,
        d: change,
        dp: change !== undefined && prev ? (change / prev) * 100 : undefined,
        h: num(b.highPrice),
        l: num(b.lowPrice),
        o: num(b.openPrice),
        pc: prev,
        t: b.updateTimestamp ? Math.floor(b.updateTimestamp) : undefined,
    };
}

export function snapshotToSecurityInfo(snapshot: FutuSnapshot, preferredName: string): FutuSecurityInfo {
    const b = snapshot.basic ?? {};
    const ex = snapshot.equityExData ?? {};
    const marketCap = num(ex.issuedMarketVal);

    return {
        // Futu names Hong Kong listings in Chinese, so the app's own name comes first
        name: preferredName || b.name?.trim() || '',
        marketCap: marketCap !== undefined ? marketCap / 1e6 : undefined,
        peRatio: num(ex.peRate),
        pbRatio: num(ex.pbRate),
        dividendYield: num(ex.dividendRatioTTM),
        lotSize: num(b.lotSize),
        suspended: b.isSuspend || undefined,
    };
}
