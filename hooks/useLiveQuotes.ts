'use client';

import { useEffect, useState } from "react";
import { isRealtime } from "@/lib/market-data";
import { isHkSymbol } from "@/lib/futu/symbols";
import { withBasePath } from "@/lib/base-path";

export type LiveQuote = { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };

// Realtime mode only: polls the shared /api/quotes cache while the tab is visible.
// In cached mode prices come from the server render and refresh hourly for everyone.
// Hong Kong prices are the exception: they come from this machine's own Futu OpenD link,
// so they are as fresh as the poll makes them.
export function useLiveQuotes(symbols: string[], intervalMs = 15_000) {
    const [quotes, setQuotes] = useState<Record<string, LiveQuote | null>>({});
    const key = symbols.join(",");
    const ownFeed = symbols.some(isHkSymbol);

    useEffect(() => {
        if (!key || (!isRealtime && !ownFeed)) return;
        let cancelled = false;

        const load = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const res = await fetch(`${withBasePath('/api/quotes')}?symbols=${encodeURIComponent(key)}`);
                if (res.ok && !cancelled) setQuotes(await res.json());
            } catch { /* keep the last good prices */ }
        };
        const onVisibility = () => { if (document.visibilityState === "visible") load(); };

        const interval = setInterval(load, intervalMs);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            cancelled = true;
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [key, intervalMs, ownFeed]);

    return quotes;
}
