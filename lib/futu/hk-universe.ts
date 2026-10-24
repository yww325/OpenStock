// A hand-kept list of Hong Kong listings: the ones the market page shows and the ones the
// search palette offers. Futu quotes anything, but a name has to come from somewhere, and
// Futu answers in Chinese, so the English names live here.
//
// Symbols are the app's own spelling ("0700.HK"); lib/futu/symbols.ts turns them into Futu codes.

export type HkStock = { symbol: string; name: string; sector: string };

export const HK_UNIVERSE: HkStock[] = [
    { symbol: '0700.HK', name: 'Tencent Holdings', sector: 'Technology' },
    { symbol: '9988.HK', name: 'Alibaba Group', sector: 'Technology' },
    { symbol: '3690.HK', name: 'Meituan', sector: 'Consumer' },
    { symbol: '1810.HK', name: 'Xiaomi Corp', sector: 'Technology' },
    { symbol: '0941.HK', name: 'China Mobile', sector: 'Telecom' },
    { symbol: '1211.HK', name: 'BYD Company', sector: 'Consumer' },
    { symbol: '1398.HK', name: 'ICBC', sector: 'Banks' },
    { symbol: '0939.HK', name: 'China Construction Bank', sector: 'Banks' },
    { symbol: '3988.HK', name: 'Bank of China', sector: 'Banks' },
    { symbol: '0005.HK', name: 'HSBC Holdings', sector: 'Banks' },
    { symbol: '9618.HK', name: 'JD.com', sector: 'Consumer' },
    { symbol: '9999.HK', name: 'NetEase', sector: 'Technology' },
    { symbol: '1024.HK', name: 'Kuaishou Technology', sector: 'Technology' },
    { symbol: '0981.HK', name: 'SMIC', sector: 'Technology' },
    { symbol: '2015.HK', name: 'Li Auto', sector: 'Consumer' },
    { symbol: '9868.HK', name: 'XPeng', sector: 'Consumer' },
    { symbol: '9888.HK', name: 'Baidu', sector: 'Technology' },
    { symbol: '9898.HK', name: 'Weibo Corp', sector: 'Technology' },
    { symbol: '9626.HK', name: 'Bilibili', sector: 'Consumer' },
    { symbol: '9992.HK', name: 'Pop Mart International', sector: 'Consumer' },
    { symbol: '9896.HK', name: 'Miniso Group', sector: 'Consumer' },
    { symbol: '6862.HK', name: 'Haidilao', sector: 'Consumer' },
    { symbol: '9633.HK', name: 'Nongfu Spring', sector: 'Consumer' },
    { symbol: '2020.HK', name: 'Anta Sports', sector: 'Consumer' },
    { symbol: '2331.HK', name: 'Li Ning', sector: 'Consumer' },
    { symbol: '992.HK', name: 'Lenovo Group', sector: 'Technology' },
    { symbol: '2382.HK', name: 'Sunny Optical', sector: 'Technology' },
    { symbol: '2269.HK', name: 'WuXi Biologics', sector: 'Healthcare' },
    { symbol: '1299.HK', name: 'AIA Group', sector: 'Insurance' },
    { symbol: '2318.HK', name: 'Ping An Insurance', sector: 'Insurance' },
    { symbol: '0388.HK', name: 'Hong Kong Exchanges', sector: 'Financials' },
    { symbol: '0857.HK', name: 'PetroChina', sector: 'Energy' },
    { symbol: '0883.HK', name: 'CNOOC', sector: 'Energy' },
    { symbol: '1088.HK', name: 'China Shenhua Energy', sector: 'Energy' },
    { symbol: '2899.HK', name: 'Zijin Mining', sector: 'Materials' },
    { symbol: '0175.HK', name: 'Geely Auto', sector: 'Consumer' },
    { symbol: '0291.HK', name: 'China Resources Beer', sector: 'Consumer' },
    { symbol: '1929.HK', name: 'Chow Tai Fook Jewellery', sector: 'Consumer' },
];

export const HK_UNIVERSE_BY_SYMBOL = new Map(HK_UNIVERSE.map((stock) => [stock.symbol, stock]));

export const hkName = (symbol: string) => HK_UNIVERSE_BY_SYMBOL.get(symbol.toUpperCase())?.name;

// The names the search palette offers before anything is typed.
export const HK_POPULAR = HK_UNIVERSE.slice(0, 5);

// Matches the app's own Hong Kong list by code or name, so searching works without an API key.
export function searchHongKong(query: string): HkStock[] {
    const needle = query.trim().toUpperCase();
    if (!needle) return HK_POPULAR;

    const digits = needle.replace(/^0+/, '');
    return HK_UNIVERSE.filter((stock) => {
        const code = stock.symbol.replace('.HK', '');
        return stock.symbol.includes(needle)
            || stock.name.toUpperCase().includes(needle)
            || (digits.length > 0 && code.replace(/^0+/, '') === digits);
    });
}

// The stocks the market page groups together, in TradingView's spelling so its widgets can use them.
export const HK_MARKET_GROUPS: { title: string; symbols: [symbol: string, name: string][] }[] = [
    {
        title: 'Tech & internet',
        symbols: [
            ['HKEX:700', 'Tencent Holdings'],
            ['HKEX:9988', 'Alibaba Group'],
            ['HKEX:3690', 'Meituan'],
            ['HKEX:1810', 'Xiaomi Corp'],
            ['HKEX:9999', 'NetEase'],
            ['HKEX:9618', 'JD.com'],
            ['HKEX:1024', 'Kuaishou Technology'],
            ['HKEX:9888', 'Baidu'],
            ['HKEX:981', 'SMIC'],
            ['HKEX:992', 'Lenovo Group'],
        ],
    },
    {
        title: 'Banks & financials',
        symbols: [
            ['HKEX:5', 'HSBC Holdings'],
            ['HKEX:1398', 'ICBC'],
            ['HKEX:939', 'China Construction Bank'],
            ['HKEX:3988', 'Bank of China'],
            ['HKEX:388', 'Hong Kong Exchanges'],
            ['HKEX:2318', 'Ping An Insurance'],
            ['HKEX:1299', 'AIA Group'],
        ],
    },
    {
        title: 'Consumer & energy',
        symbols: [
            ['HKEX:1211', 'BYD Company'],
            ['HKEX:2015', 'Li Auto'],
            ['HKEX:9868', 'XPeng'],
            ['HKEX:9992', 'Pop Mart International'],
            ['HKEX:9896', 'Miniso Group'],
            ['HKEX:9633', 'Nongfu Spring'],
            ['HKEX:2020', 'Anta Sports'],
            ['HKEX:175', 'Geely Auto'],
            ['HKEX:291', 'China Resources Beer'],
            ['HKEX:857', 'PetroChina'],
            ['HKEX:883', 'CNOOC'],
            ['HKEX:1088', 'China Shenhua Energy'],
            ['HKEX:2899', 'Zijin Mining'],
            ['HKEX:941', 'China Mobile'],
            ['HKEX:2382', 'Sunny Optical'],
            ['HKEX:2269', 'WuXi Biologics'],
            ['HKEX:1929', 'Chow Tai Fook Jewellery'],
            ['HKEX:6862', 'Haidilao'],
            ['HKEX:2331', 'Li Ning'],
            ['HKEX:9626', 'Bilibili'],
            ['HKEX:9898', 'Weibo Corp'],
        ],
    },
];
