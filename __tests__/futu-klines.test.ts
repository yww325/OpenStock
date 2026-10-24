import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hongKongDay, klToBars } from '@/lib/futu/kline-map';

// A real daily bar from Futu, as the protocol sends it.
const TENCENT_BAR = {
    time: '2026-10-23 00:00:00',
    isBlank: false,
    highPrice: 388.8,
    openPrice: 381.8,
    lowPrice: 378,
    closePrice: 386,
    lastClosePrice: 382.4,
    volume: '33161473',
    turnover: 12729501754,
    turnoverRate: 0.00365,
    pe: 14.099,
    changeRate: 0.9414225941422654,
    timestamp: 1792684800,
};

const { requestHistoryKL, requestHistoryKLQuota } = vi.hoisted(() => ({
    requestHistoryKL: vi.fn(),
    requestHistoryKLQuota: vi.fn(),
}));

vi.mock('@/lib/futu/opend', () => ({
    getFutuSocket: vi.fn(async () => ({
        RequestHistoryKL: requestHistoryKL,
        RequestHistoryKLQuota: requestHistoryKLQuota,
    })),
}));

const okQuota = (remain = 296, charged: string[] = []) => ({
    s2c: {
        usedQuota: 300 - remain,
        remainQuota: remain,
        detailList: charged.map((code) => ({ security: { code } })),
    },
});

describe('Futu bars', () => {
    it('turns a protocol bar into a chart bar', () => {
        const [bar] = klToBars([TENCENT_BAR]);

        expect(bar).toEqual({
            time: '2026-10-23',
            open: 381.8,
            high: 388.8,
            low: 378,
            close: 386,
            // Futu sends the volume as a string
            volume: 33161473,
            turnover: 12729501754,
        });
    });

    it('drops the blank bars a market holiday leaves behind', () => {
        const bars = klToBars([{ time: '2026-10-24 00:00:00', isBlank: true }, TENCENT_BAR]);

        expect(bars).toHaveLength(1);
        expect(bars[0].time).toBe('2026-10-23');
    });

    it('knows which trading day a timestamp falls on in Hong Kong time', () => {
        // 1792684800 is 2026-10-23 00:00 in Hong Kong, 2026-10-22 16:00 UTC
        expect(hongKongDay(1792684800)).toBe('2026-10-23');
        expect(hongKongDay(undefined)).toBeNull();
    });
});

describe('pulling Hong Kong candles', () => {
    beforeEach(() => {
        vi.resetModules();
        requestHistoryKL.mockReset();
        requestHistoryKLQuota.mockReset();
        requestHistoryKLQuota.mockResolvedValue(okQuota());
        requestHistoryKL.mockResolvedValue({ s2c: { klList: [TENCENT_BAR] } });
    });

    it('keeps the bars in memory, so opening the same stock again asks OpenD for nothing', async () => {
        const { getKlines } = await import('@/lib/futu/klines');

        const first = await getKlines('0700.HK', '1y');
        const second = await getKlines('0700.HK', '1y');

        expect(first?.[0].close).toBe(386);
        expect(second).toEqual(first);
        expect(requestHistoryKL).toHaveBeenCalledTimes(1);
    });

    it('joins two requests for the same stock into one call', async () => {
        const { getKlines } = await import('@/lib/futu/klines');

        const [a, b] = await Promise.all([getKlines('0700.HK', '1y'), getKlines('0700.HK', '1y')]);

        expect(a).toEqual(b);
        expect(requestHistoryKL).toHaveBeenCalledTimes(1);
    });

    it('asks for a different range separately', async () => {
        const { getKlines } = await import('@/lib/futu/klines');

        await getKlines('0700.HK', '1y');
        await getKlines('0700.HK', '1m');

        expect(requestHistoryKL).toHaveBeenCalledTimes(2);
    });

    it('does not spend a history unit on a listing the account has never pulled', async () => {
        requestHistoryKLQuota.mockResolvedValue(okQuota(10));
        const { getKlines } = await import('@/lib/futu/klines');

        const bars = await getKlines('0700.HK', '1y');

        expect(bars).toBeNull();
        expect(requestHistoryKL).not.toHaveBeenCalled();
    });

    it('still pulls a listing that has already used its unit', async () => {
        requestHistoryKLQuota.mockResolvedValue(okQuota(10, ['00700']));
        const { getKlines } = await import('@/lib/futu/klines');

        const bars = await getKlines('0700.HK', '1y');

        expect(bars?.[0].close).toBe(386);
        expect(requestHistoryKL).toHaveBeenCalledTimes(1);
    });

    it('remembers a failure, so a broken listing is not asked for again and again', async () => {
        requestHistoryKL.mockRejectedValue(new Error('OpenD said no'));
        const { getKlines } = await import('@/lib/futu/klines');

        await getKlines('0700.HK', '1y');
        await getKlines('0700.HK', '1y');

        expect(requestHistoryKL).toHaveBeenCalledTimes(1);
    });
});
