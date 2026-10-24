// The bars a chart draws. Futu sends one entry per trading day; the fields are the ones the
// chart needs, with the volume turned into a number (Futu sends it as a string).

export type ChartBar = {
    time: string;   // "2026-10-23", the trading day in Hong Kong time
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnover: number;
};

// One bar as Futu sends it.
export type FutuKl = {
    time?: string;
    isBlank?: boolean;
    highPrice?: number;
    openPrice?: number;
    lowPrice?: number;
    closePrice?: number;
    lastClosePrice?: number;
    volume?: string | number;
    turnover?: number;
    turnoverRate?: number;
    pe?: number;
    changeRate?: number;
    timestamp?: number;
};

// How far back each range reaches. The days are counted back from today, so a range always
// holds at least the trading days it promises.
export const KLINE_RANGES = {
    '1m': { days: 31, label: '1M' },
    '3m': { days: 93, label: '3M' },
    '6m': { days: 184, label: '6M' },
    '1y': { days: 367, label: '1Y' },
} as const;

export type KlineRange = keyof typeof KLINE_RANGES;

export const KLINE_RANGE_LABELS: { id: KlineRange; label: string }[] = (
    Object.keys(KLINE_RANGES) as KlineRange[]
).map((id) => ({ id, label: KLINE_RANGES[id].label }));

const toNumber = (value: number | string | undefined) => {
    const parsed = typeof value === 'string' ? Number(value) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
};

export function klToBars(list: FutuKl[]): ChartBar[] {
    return list
        .filter((bar) => bar?.time && !bar.isBlank)
        .map((bar) => ({
            time: bar.time!.slice(0, 10),
            open: toNumber(bar.openPrice),
            high: toNumber(bar.highPrice),
            low: toNumber(bar.lowPrice),
            close: toNumber(bar.closePrice),
            volume: toNumber(bar.volume),
            turnover: toNumber(bar.turnover),
        }))
        .filter((bar) => bar.close > 0);
}

// The trading day a unix timestamp falls on, in Hong Kong time. The exchange is UTC+8 all
// year round, so the offset is enough.
export function hongKongDay(timestampSeconds?: number): string | null {
    if (!timestampSeconds) return null;
    return new Date((timestampSeconds + 8 * 60 * 60) * 1000).toISOString().slice(0, 10);
}
