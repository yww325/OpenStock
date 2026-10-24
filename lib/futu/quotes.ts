// Reads Hong Kong quotes from Futu OpenD. This runs on the server only: it opens a socket to
// the gateway Futu runs on the same machine.

import { getFutuSocket } from '@/lib/futu/opend';
import { hkName } from '@/lib/futu/hk-universe';
import {
    snapshotToQuote,
    snapshotToSecurityInfo,
    type FutuQuote,
    type FutuSecurityInfo,
    type FutuSnapshot,
} from '@/lib/futu/quote';
import { FUTU_HK_MARKET, toFutuCode } from '@/lib/futu/symbols';

// OpenD is our own link, so quotes are cheap to refresh. A page asks for the same names a
// few times over; a short cache collapses that into one round trip.
const SNAPSHOT_TTL_MS = 10_000;

const snapshotCache = new Map<string, { snapshot: FutuSnapshot; until: number }>();

async function getSnapshots(codes: string[]): Promise<Map<string, FutuSnapshot>> {
    const now = Date.now();
    const found = new Map<string, FutuSnapshot>();
    const missing: string[] = [];

    for (const code of codes) {
        const hit = snapshotCache.get(code);
        if (hit && hit.until > now) found.set(code, hit.snapshot);
        else missing.push(code);
    }

    if (missing.length) {
        const socket = await getFutuSocket();
        if (socket) {
            try {
                const response = await socket.GetSecuritySnapshot({
                    c2s: { securityList: missing.map((code) => ({ market: FUTU_HK_MARKET, code })) },
                });
                const list = (response.s2c?.snapshotList as FutuSnapshot[] | undefined) ?? [];
                for (const snapshot of list) {
                    const code = snapshot.basic?.security?.code;
                    if (!code) continue;
                    snapshotCache.set(code, { snapshot, until: Date.now() + SNAPSHOT_TTL_MS });
                    found.set(code, snapshot);
                }
            } catch (error) {
                console.error('[futu] GetSecuritySnapshot failed:', error);
            }
        }
    }

    return found;
}

// Prices for Hong Kong symbols, keyed by the symbol the app uses ("0700.HK").
export async function getFutuQuotes(symbols: string[]): Promise<Record<string, FutuQuote | null>> {
    const wanted = symbols
        .map((symbol) => ({ symbol, code: toFutuCode(symbol) }))
        .filter((entry): entry is { symbol: string; code: string } => entry.code !== null);
    if (!wanted.length) return {};

    const snapshots = await getSnapshots(wanted.map((entry) => entry.code));

    return Object.fromEntries(
        wanted.map(({ symbol, code }) => {
            const snapshot = snapshots.get(code);
            return [symbol, snapshot ? snapshotToQuote(snapshot) : null];
        }),
    );
}

// Names and market data for Hong Kong symbols. Futu answers in Chinese, so the English name
// from the app's own list is used whenever there is one.
export async function getFutuSecurityInfo(symbols: string[]): Promise<Record<string, FutuSecurityInfo | null>> {
    const wanted = symbols
        .map((symbol) => ({ symbol, code: toFutuCode(symbol) }))
        .filter((entry): entry is { symbol: string; code: string } => entry.code !== null);
    if (!wanted.length) return {};

    const snapshots = await getSnapshots(wanted.map((entry) => entry.code));

    return Object.fromEntries(
        wanted.map(({ symbol, code }) => {
            const snapshot = snapshots.get(code);
            if (!snapshot) return [symbol, null];
            const info = snapshotToSecurityInfo(snapshot, hkName(symbol) || '');
            return [symbol, { ...info, name: info.name || symbol }];
        }),
    );
}
