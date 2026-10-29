// How an alert's price is written: Binance pairs in USDT, Hong Kong listings in HKD,
// everything else (Finnhub) in USD. Shared by the alert email and the watchlist panel.
import { formatPrice } from '@/lib/utils';
import { isHkSymbol } from '@/lib/futu/symbols';

export function formatAlertPrice(symbol: string, value: number) {
    if (symbol.startsWith('BINANCE:')) {
        return `${value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 })} USDT`;
    }
    return formatPrice(value, isHkSymbol(symbol) ? 'HKD' : 'USD');
}
