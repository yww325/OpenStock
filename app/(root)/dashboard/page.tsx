import { Suspense } from "react";
import { cookies } from "next/headers";
import TradingViewWidget from "@/components/TradingViewWidget";
import Panel from "@/components/Panel";
import IndexPulse, { PulseSkeleton } from "@/components/IndexPulse";
import DataFreshness from "@/components/DataFreshness";
import MarketSwitcher from "@/components/MarketSwitcher";
import NativeMarketTable, { type NativeGroup } from "@/components/NativeMarketTable";
import {
    CRYPTO_HEATMAP_CONFIG,
    STOCK_HEATMAP_CONFIG,
    marketOverviewConfig,
    marketQuotesConfig,
    timelineConfig,
} from "@/lib/constants";
import { MARKETS, MARKET_COOKIE, getMarket, isMarketOpen, marketForCountry, type Market } from "@/lib/markets";
import { getLiveQuotes } from "@/lib/quotes";
import { fromTradingViewSymbol } from "@/lib/futu/symbols";
import { getSession } from "@/lib/better-auth/auth";

const scriptUrl = `https://s3.tradingview.com/external-embedding/embed-widget-`;

// TradingView has no Hong Kong data in free embeds, so a market we price ourselves lists its
// leaders in our own table instead.
async function buildNativeGroups(market: Market): Promise<NativeGroup[]> {
    const groups = market.groups.map((group) => ({
        title: group.title,
        rows: group.symbols.map(([symbol, name]) => ({ symbol: fromTradingViewSymbol(symbol), name })),
    }));
    const quotes = await getLiveQuotes(groups.flatMap((group) => group.rows.map((row) => row.symbol)));

    return groups.map((group) => ({
        title: group.title,
        rows: group.rows.map((row) => ({ ...row, quote: quotes[row.symbol] ?? null })),
    }));
}

// Widgets come from TradingView (live, no Finnhub quota) and render immediately; the tiles stream in.
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
    const { market: requested } = await searchParams;
    // Explicit choice, then the remembered one, then the market of the user's country
    const saved = (await cookies()).get(MARKET_COOKIE)?.value;
    const market = getMarket(requested ?? saved ?? marketForCountry((await getSession())?.user.country));
    const open = isMarketOpen(market);
    const viaFutu = market.pulse.some((p) => p.futu);
    const native = viaFutu || market.pulse.some((p) => p.finnhub);
    const heatmap = market.heatmap === 'stocks'
        ? { script: 'stock-heatmap.js', config: STOCK_HEATMAP_CONFIG, title: 'S&P 500 heatmap' }
        : market.heatmap === 'crypto'
            ? { script: 'crypto-coins-heatmap.js', config: CRYPTO_HEATMAP_CONFIG, title: 'Crypto heatmap' }
            : null;
    const nativeGroups = viaFutu ? await buildNativeGroups(market) : null;

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">Markets</h1>
                    <p className="page-sub">{market.name} · {open ? 'open now' : 'closed now'} · {market.feed.toLowerCase()} data</p>
                </div>
            </header>

            <MarketSwitcher active={market.id} openIds={MARKETS.filter((m) => isMarketOpen(m)).map((m) => m.id)} />

            <section className="hatch">
                <div className="section-head">
                    <div>
                        <h2 className="section-title">Pulse</h2>
                        <p className="section-sub">{viaFutu ? 'Live quotes via Futu OpenD' : native ? 'Our shared quotes via Finnhub' : `${market.feed} quotes via TradingView`}</p>
                    </div>
                    {native && <DataFreshness live={viaFutu} />}
                </div>
                {/* Keyed so switching markets swaps the tiles instead of reusing old widgets */}
                <Suspense key={market.id} fallback={<PulseSkeleton />}>
                    <IndexPulse market={market} />
                </Suspense>
            </section>

            {nativeGroups ? (
                <div key={market.id} className="flex flex-col gap-3">
                    <Panel title="Leaders" sub={`${market.name} leaders by group, priced live`}>
                        <NativeMarketTable groups={nativeGroups} />
                    </Panel>
                    <Panel title="Top stories" sub="Newest first">
                        <TradingViewWidget scriptUrl={`${scriptUrl}timeline.js`} config={timelineConfig(market.news)} height={560} />
                    </Panel>
                </div>
            ) : (
                <div key={market.id} className="flex flex-col gap-3">
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        <Panel title="Leaders" sub="12-month trend by group">
                            <TradingViewWidget scriptUrl={`${scriptUrl}market-overview.js`} config={marketOverviewConfig(market.groups)} height={560} />
                        </Panel>
                        {heatmap ? (
                            <Panel title={heatmap.title} sub="Sized by market cap, coloured by today’s move">
                                <TradingViewWidget scriptUrl={`${scriptUrl}${heatmap.script}`} config={heatmap.config} height={560} allowExpand />
                            </Panel>
                        ) : (
                            <Panel title="Quotes" sub={`${market.name} leaders by group`}>
                                <TradingViewWidget scriptUrl={`${scriptUrl}market-quotes.js`} config={marketQuotesConfig(market.groups)} height={560} />
                            </Panel>
                        )}
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        {heatmap && (
                            <Panel title="Quotes" sub={`${market.name} leaders by group`}>
                                <TradingViewWidget scriptUrl={`${scriptUrl}market-quotes.js`} config={marketQuotesConfig(market.groups)} height={560} />
                            </Panel>
                        )}
                        <Panel title="Top stories" sub="Newest first" className={heatmap ? '' : 'xl:col-span-2'}>
                            <TradingViewWidget scriptUrl={`${scriptUrl}timeline.js`} config={timelineConfig(market.news)} height={560} />
                        </Panel>
                    </div>
                </div>
            )}
        </>
    );
}
