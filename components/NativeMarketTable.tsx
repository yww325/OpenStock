'use client';

import Link from 'next/link';
import { useLiveQuotes, type LiveQuote } from '@/hooks/useLiveQuotes';
import ChangePill from '@/components/ChangePill';
import PriceFlash from '@/components/PriceFlash';
import { formatPrice } from '@/lib/utils';
import { HK_CURRENCY } from '@/lib/futu/symbols';

export type NativeRow = { symbol: string; name: string; quote: LiveQuote | null };
export type NativeGroup = { title: string; rows: NativeRow[] };

// The market overview for a market we price ourselves. TradingView's free embeds have no
// Hong Kong data, so the leaders are listed here with our own quotes, refreshed on screen.
export default function NativeMarketTable({ groups }: { groups: NativeGroup[] }) {
    const symbols = groups.flatMap((group) => group.rows.map((row) => row.symbol));
    const live = useLiveQuotes(symbols);

    return (
        <div className="flex flex-col gap-4">
            {groups.map((group) => (
                <div key={group.title}>
                    <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">{group.title}</p>
                    <div className="overflow-x-auto rounded-[12px]">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Company</th>
                                    <th>Symbol</th>
                                    <th className="is-num">Price</th>
                                    <th className="is-num">Change</th>
                                    <th className="is-num">Chg%</th>
                                    <th className="is-num">Day range</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.rows.map((row) => {
                                    const quote = live[row.symbol] ?? row.quote;
                                    const price = quote?.c;
                                    return (
                                        <tr key={row.symbol}>
                                            <td className="max-w-[260px]">
                                                <Link href={`/stocks/${encodeURIComponent(row.symbol)}`} className="block truncate font-semibold text-foreground hover:text-brand-ink" title={row.name}>
                                                    {row.name}
                                                </Link>
                                            </td>
                                            <td className="mono text-muted-foreground">{row.symbol}</td>
                                            <td className="is-num font-semibold text-foreground">
                                                <PriceFlash value={price} className="px-1">
                                                    {price ? formatPrice(price, HK_CURRENCY) : '—'}
                                                </PriceFlash>
                                            </td>
                                            <td className="is-num text-muted-foreground">
                                                {price && quote?.d != null ? `${quote.d > 0 ? '+' : ''}${quote.d.toFixed(2)}` : '—'}
                                            </td>
                                            <td className="is-num"><ChangePill value={price ? quote?.dp : null} /></td>
                                            <td className="is-num text-muted-foreground">
                                                {quote?.l && quote?.h ? `${quote.l.toFixed(2)} – ${quote.h.toFixed(2)}` : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}
