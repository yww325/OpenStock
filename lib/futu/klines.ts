// Daily candles for Hong Kong listings, straight from Futu OpenD.
//
// Two things make this cheap. The first is the cache: a bar set is kept for half an hour, so
// opening the same stock again answers from memory instead of asking OpenD. The second is how
// Futu charges for history: one unit per *distinct* stock in a rolling seven-day window, and
// asking for a stock that is already on the list is free. So the only thing that costs a unit
// is a stock we have never pulled before, which is why the guard below keeps a reserve and
// leaves the decision for a stock we do not know yet to the caller.

import { getFutuSocket } from '@/lib/futu/opend';
import { klToBars, KLINE_RANGES, type ChartBar, type FutuKl, type KlineRange } from '@/lib/futu/kline-map';
import { FUTU_HK_MARKET, toFutuCode } from '@/lib/futu/symbols';

const KL_TYPE_DAY = 2;          // Qot_Common.KLType_KLType_Day
const REHAB_FORWARD = 1;        // forward adjusted
const MAX_PAGES = 12;           // a page holds 1000 bars
const CACHE_TTL_MS = 30 * 60_000;
const FAILURE_TTL_MS = 60_000;
const QUOTA_TTL_MS = 5 * 60_000;
// Keep this many units in hand, so a chart is never the reason the account runs out.
const QUOTA_RESERVE = 20;

type CacheEntry = { bars: ChartBar[] | null; until: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ChartBar[] | null>>();

let quota: { used: number; remain: number; charged: Set<string>; until: number } | null = null;

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

// How many history units are left, and which stocks have already used one.
async function getQuota() {
    if (quota && quota.until > Date.now()) return quota;

    const socket = await getFutuSocket();
    if (!socket) return null;

    try {
        const response = await socket.RequestHistoryKLQuota({ c2s: { bGetDetail: true } });
        const used = Number(response.s2c?.usedQuota ?? 0);
        const remain = Number(response.s2c?.remainQuota ?? 0);
        const details = (response.s2c?.detailList as { security?: { code?: string } }[] | undefined) ?? [];
        quota = {
            used,
            remain,
            charged: new Set(details.map((entry) => entry.security?.code).filter((code): code is string => Boolean(code))),
            until: Date.now() + QUOTA_TTL_MS,
        };
        return quota;
    } catch (error) {
        console.error('[futu] history K-line quota lookup failed:', error);
        return null;
    }
}

// True when pulling this stock costs nothing: it is either already paid for, or there is
// enough quota left to spend one unit.
async function mayPull(code: string): Promise<boolean> {
    const state = await getQuota();
    if (!state) return true;             // cannot tell, let OpenD decide
    if (state.charged.has(code)) return true;
    if (state.remain > QUOTA_RESERVE) return true;

    console.warn(`[futu] history K-line quota nearly spent (${state.remain} left), not pulling ${code}`);
    return false;
}

async function pullBars(code: string, days: number): Promise<ChartBar[] | null> {
    if (!(await mayPull(code))) return null;

    const socket = await getFutuSocket();
    if (!socket) return null;

    const end = new Date();
    const begin = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const bars: FutuKl[] = [];
    let nextReqKey: Uint8Array | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
        const response = await socket.RequestHistoryKL({
            c2s: {
                rehabType: REHAB_FORWARD,
                klType: KL_TYPE_DAY,
                security: { market: FUTU_HK_MARKET, code },
                beginTime: formatDate(begin),
                endTime: formatDate(end),
                ...(nextReqKey ? { nextReqKey } : {}),
            },
        });

        const list = (response.s2c?.klList as FutuKl[] | undefined) ?? [];
        bars.push(...list);

        nextReqKey = response.s2c?.nextReqKey as Uint8Array | undefined;
        if (!nextReqKey || nextReqKey.length === 0) break;
    }

    return klToBars(bars);
}

// The daily candles for a Hong Kong listing, or null when there are none to show.
export async function getKlines(symbol: string, range: KlineRange): Promise<ChartBar[] | null> {
    const code = toFutuCode(symbol);
    if (!code) return null;

    const key = `${code}:${range}`;
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.bars;

    // One call per stock and range, however many pages ask for it at the same time
    let pending = inflight.get(key);
    if (!pending) {
        pending = pullBars(code, KLINE_RANGES[range].days)
            .then((bars) => {
                cache.set(key, { bars, until: Date.now() + (bars?.length ? CACHE_TTL_MS : FAILURE_TTL_MS) });
                return bars;
            })
            .catch((error) => {
                console.error('[futu] history K-line pull failed for', symbol, error);
                // Remember the failure for a minute, so a broken symbol is not asked for again
                // and again.
                cache.set(key, { bars: null, until: Date.now() + FAILURE_TTL_MS });
                return null;
            })
            .finally(() => { inflight.delete(key); });
        inflight.set(key, pending);
    }

    return pending;
}

// How much of the history quota is left, for the settings page and for tests.
export async function getKlineQuota() {
    const state = await getQuota();
    return state ? { used: state.used, remain: state.remain } : null;
}
