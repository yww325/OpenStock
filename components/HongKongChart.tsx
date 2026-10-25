'use client';

import { useEffect, useRef, useState } from 'react';
import {
    createChart,
    CandlestickSeries,
    HistogramSeries,
    ColorType,
    CrosshairMode,
    type IChartApi,
    type ISeriesApi,
    type Time,
} from 'lightweight-charts';
import { withBasePath } from '@/lib/base-path';
import { useLiveQuotes } from '@/hooks/useLiveQuotes';
import { hongKongDay, KLINE_RANGE_LABELS, type ChartBar, type KlineRange } from '@/lib/futu/kline-map';
import { formatRgba } from '@/lib/chart-color';
import { cn } from '@/lib/utils';

// The chart library only reads plain rgb colours, and the browser keeps the modern colour
// spaces (oklch, lab) as they are, so a colour is painted on a one pixel canvas and read back
// as red, green and blue.
const toRgb = (color: string): string | null => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return formatRgba(r, g, b, a);
};

// The theme colour of a CSS variable, in a form the chart can read.
const cssColor = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return toRgb(value) || fallback;
};

type Status = 'loading' | 'ready' | 'unavailable';

// Daily candles for a Hong Kong listing, drawn from the app's own data. TradingView does not
// license Hong Kong charts for other sites, so the bars come from Futu OpenD instead.
export default function HongKongChart({ symbol }: { symbol: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const [range, setRange] = useState<KlineRange>('1y');
    const [bars, setBars] = useState<ChartBar[] | null>(null);
    const [status, setStatus] = useState<Status>('loading');
    const [undrawable, setUndrawable] = useState(false);
    const live = useLiveQuotes([symbol]);

    // The chart itself: one canvas, created once.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const up = cssColor('--up', '#2fce6e');
        const down = cssColor('--down', '#f2545b');

        let chart: IChartApi;
        try {
            chart = createChart(container, {
                autoSize: true,
                layout: {
                    background: { type: ColorType.Solid, color: 'transparent' },
                    textColor: cssColor('--muted-foreground', '#8b8b8b'),
                    attributionLogo: false,
                },
                grid: {
                    vertLines: { color: 'transparent' },
                    horzLines: { color: 'rgba(240, 243, 250, 0.04)' },
                },
                rightPriceScale: { borderColor: 'rgba(240, 243, 250, 0.08)', scaleMargins: { top: 0.12, bottom: 0.1 } },
                timeScale: { borderColor: 'rgba(240, 243, 250, 0.08)', rightOffset: 3, barSpacing: 8, minBarSpacing: 0.5 },
                crosshair: { mode: CrosshairMode.Normal },
            });
        } catch (error) {
            // A chart that cannot be drawn should not take the page down with it.
            console.error('[chart] could not be drawn:', error);
            setUndrawable(true);
            return;
        }

        const candles = chart.addSeries(CandlestickSeries, {
            upColor: up,
            downColor: down,
            borderVisible: false,
            wickUpColor: up,
            wickDownColor: down,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
        const volume = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            lastValueVisible: false,
            priceLineVisible: false,
        });
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

        chartRef.current = chart;
        candlesRef.current = candles;
        volumeRef.current = volume;

        return () => {
            chart.remove();
            chartRef.current = null;
            candlesRef.current = null;
            volumeRef.current = null;
        };
    }, []);

    // Bars for the chosen range. The server keeps them for half an hour, so switching back and
    // forth costs nothing.
    useEffect(() => {
        let cancelled = false;
        setStatus('loading');

        fetch(`${withBasePath('/api/klines')}?symbol=${encodeURIComponent(symbol)}&range=${range}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`Chart request failed: ${res.status}`);
                return res.json();
            })
            .then((data: { bars: ChartBar[] }) => {
                if (cancelled) return;
                setBars(data.bars);
                setStatus('ready');
            })
            .catch(() => {
                if (cancelled) return;
                setStatus('unavailable');
            });

        return () => { cancelled = true; };
    }, [symbol, range]);

    // Draw the bars.
    useEffect(() => {
        if (!bars?.length || !candlesRef.current || !volumeRef.current) return;

        candlesRef.current.setData(bars.map((bar) => ({
            time: bar.time as Time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
        })));
        volumeRef.current.setData(bars.map((bar) => ({
            time: bar.time as Time,
            value: bar.volume,
            color: bar.close >= bar.open ? 'rgba(71, 217, 187, 0.35)' : 'rgba(242, 84, 91, 0.35)',
        })));
        chartRef.current?.timeScale().fitContent();
    }, [bars]);

    // The last candle follows the live price while the market is open.
    useEffect(() => {
        const quote = live[symbol];
        const last = bars?.[bars.length - 1];
        if (!quote?.c || !last || !candlesRef.current) return;
        // Only the candle of today moves; an older one is history.
        if (hongKongDay(quote.t) !== last.time) return;

        candlesRef.current.update({
            time: last.time as Time,
            open: last.open,
            high: Math.max(last.high, quote.h ?? last.high),
            low: Math.min(last.low, quote.l ?? last.low),
            close: quote.c,
        });
    }, [live, bars, symbol]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1">
                {KLINE_RANGE_LABELS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setRange(id)}
                        aria-pressed={range === id}
                        className={cn(
                            'h-7 rounded-full px-3 text-[12.5px] font-semibold transition-colors',
                            range === id
                                ? 'bg-brand-soft text-brand-ink shadow-[inset_0_0_0_1px_oklch(0.8_0.13_176/0.45)]'
                                : 'text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:text-foreground',
                        )}
                    >
                        {label}
                    </button>
                ))}
                <span className="ml-auto text-[12px] text-faint">Daily candles · Futu OpenD</span>
            </div>

            {undrawable || status === 'unavailable' ? (
                <div className="empty-state py-14">
                    <h3>Chart not available for now</h3>
                    <p className="max-w-80 text-[13px]">
                        The history of this listing could not be loaded. The price and the rest of
                        the page still work.
                    </p>
                </div>
            ) : (
                <div ref={containerRef} className="h-[420px] w-full" aria-busy={status === 'loading'} />
            )}
        </div>
    );
}
