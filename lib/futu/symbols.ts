// Hong Kong tickers reach the app in several spellings: the Finnhub/TradingView style
// "0700.HK", the TradingView style "HKEX:700" and Futu's own "HK.00700". Futu's API wants a
// market id plus a zero-padded five-digit code, so every spelling is normalised here.

export const FUTU_HK_MARKET = 1;

// Hong Kong codes are five digits: 00700 (Tencent), 09988 (Alibaba), 00005 (HSBC).
const HK_CODE = /^(\d{1,5})$/;

// "0700.HK", "700.HK", "HKEX:700" and "HK.00700" all mean the same security.
export function toFutuCode(symbol: string): string | null {
    const raw = symbol.trim().toUpperCase();
    if (!raw) return null;

    let digits: string | null = null;
    if (raw.startsWith('HKEX:')) digits = raw.slice('HKEX:'.length);
    else if (raw.startsWith('HK.')) digits = raw.slice('HK.'.length);
    else if (raw.endsWith('.HK')) digits = raw.slice(0, -'.HK'.length);

    if (digits === null || !HK_CODE.test(digits)) return null;
    return digits.padStart(5, '0');
}

export const isHkSymbol = (symbol: string) => toFutuCode(symbol) !== null;

// The app stores Hong Kong tickers the way Finnhub writes them: four digits and ".HK".
export function fromFutuCode(code: string): string {
    const digits = code.padStart(5, '0');
    return `${digits.startsWith('0') ? digits.slice(1) : digits}.HK`;
}

// The currency a Hong Kong listing trades in. Futu reports prices in HKD, unlike the
// Finnhub symbols, which are always in USD.
export const HK_CURRENCY = 'HKD';
