import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/better-auth/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { getKlines } from "@/lib/futu/klines";
import { KLINE_RANGES, type KlineRange } from "@/lib/futu/kline-map";
import { isHkSymbol } from "@/lib/futu/symbols";

// Daily candles for a Hong Kong listing. Signed-in only: pulling the history of a stock we
// have never pulled before costs one of the account's history units, so the number of requests
// per user stays small.
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
    const range = (req.nextUrl.searchParams.get("range") ?? "1y").trim().toLowerCase() as KlineRange;

    if (!isHkSymbol(symbol)) return NextResponse.json({ error: "Not a Hong Kong symbol" }, { status: 400 });
    if (!KLINE_RANGES[range]) return NextResponse.json({ error: "Unknown range" }, { status: 400 });

    if (await isRateLimited(`klines:user:${session.user.id}`, 60, 60, 1)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const result = await getKlines(symbol, range);
    if (!result?.bars.length) return NextResponse.json({ error: "No chart data" }, { status: 503 });

    return NextResponse.json({ symbol, range, bars: result.bars, cached: result.cached }, {
        headers: { "Cache-Control": "private, max-age=60" },
    });
}
