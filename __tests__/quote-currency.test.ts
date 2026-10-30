import { beforeEach, describe, expect, it, vi } from 'vitest';

// A US-listed ADR trades in USD even when its company reports in another currency. Finnhub's
// profile `currency` is the reporting currency, so using it turned CHA's $11.98 into CNY11.98.

const getQuote = vi.fn();
const getCompanyProfile = vi.fn();
const getFutuQuotes = vi.fn();
const getFutuSecurityInfo = vi.fn();

vi.mock('@/lib/actions/finnhub.actions', () => ({
    getQuote: (...args: unknown[]) => getQuote(...args),
    getCompanyProfile: (...args: unknown[]) => getCompanyProfile(...args),
}));
vi.mock('@/lib/futu/quotes', () => ({
    getFutuQuotes: (...args: unknown[]) => getFutuQuotes(...args),
    getFutuSecurityInfo: (...args: unknown[]) => getFutuSecurityInfo(...args),
}));
vi.mock('@/lib/finnhub/keys', () => ({ isFinnhubConfigured: () => true }));

import { getWatchlistData } from '@/lib/quotes';

describe('watchlist row currency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getQuote.mockResolvedValue({ c: 11.98, d: 0.29, dp: 2.48 });
        getCompanyProfile.mockResolvedValue({ name: 'Chagee Holdings', currency: 'CNY', marketCapitalization: 2340 });
        getFutuQuotes.mockResolvedValue({});
        getFutuSecurityInfo.mockResolvedValue({});
    });

    it('prices a US ADR in USD, not the company’s reporting currency', async () => {
        const [row] = await getWatchlistData(['CHA']);
        expect(getCompanyProfile).toHaveBeenCalledWith('CHA');
        expect(row.currency).toBe('USD');
        expect(row.price).toBe(11.98);
    });

    it('keeps Hong Kong listings in HKD', async () => {
        getFutuQuotes.mockResolvedValue({ '0700.HK': { c: 381.8, d: 1, dp: 0.3 } });
        getFutuSecurityInfo.mockResolvedValue({ '0700.HK': { name: 'Tencent Holdings', marketCap: 3.47e12, peRatio: 20 } });

        const [row] = await getWatchlistData(['0700.HK']);
        expect(row.currency).toBe('HKD');
        expect(getCompanyProfile).not.toHaveBeenCalled();
    });
});
