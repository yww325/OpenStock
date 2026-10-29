import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Self-hosted instances have no Inngest, so the server process itself has to run the alert check.
// Without this loop nothing prices an alert and no email is ever sent.

const runStockAlertCheck = vi.fn();
vi.mock('@/lib/alerts/check', () => ({ runStockAlertCheck: () => runStockAlertCheck() }));

import { startAlertScheduler } from '@/lib/alerts/scheduler';

const MINUTE = 60_000;

describe('built-in alert scheduler', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        runStockAlertCheck.mockReset().mockResolvedValue({ processed: 0, triggered: 0 });
        delete (globalThis as { openstockAlertTimer?: unknown }).openstockAlertTimer;
    });

    afterEach(() => {
        vi.useRealTimers();
        delete (globalThis as { openstockAlertTimer?: unknown }).openstockAlertTimer;
    });

    it('runs the check at startup and then every five minutes', async () => {
        startAlertScheduler();
        expect(runStockAlertCheck).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(30_000);
        expect(runStockAlertCheck).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5 * MINUTE);
        expect(runStockAlertCheck).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(5 * MINUTE);
        expect(runStockAlertCheck).toHaveBeenCalledTimes(3);
    });

    it('starts one loop, not one per registration', async () => {
        startAlertScheduler();
        startAlertScheduler();

        await vi.advanceTimersByTimeAsync(30_000);
        expect(runStockAlertCheck).toHaveBeenCalledTimes(1);
    });

    it('keeps checking after a failed run', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        runStockAlertCheck.mockRejectedValueOnce(new Error('MongoDB unreachable'));

        startAlertScheduler();
        await vi.advanceTimersByTimeAsync(30_000);
        expect(runStockAlertCheck).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5 * MINUTE);
        expect(runStockAlertCheck).toHaveBeenCalledTimes(2);
    });
});
