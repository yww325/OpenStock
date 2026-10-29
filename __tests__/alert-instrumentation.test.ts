import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The scheduler is only right for instances without Inngest: a Cloud deployment must keep a single
// cron, or every alert is checked twice.

const flags = { alertsEnabled: true };
vi.mock('@/lib/market-data', () => ({ get alertsEnabled() { return flags.alertsEnabled; } }));

const startAlertScheduler = vi.fn();
vi.mock('@/lib/alerts/scheduler', () => ({ startAlertScheduler: () => startAlertScheduler() }));

import { register } from '@/instrumentation';

describe('instrumentation', () => {
    const env = { ...process.env };

    beforeEach(() => {
        startAlertScheduler.mockClear();
        flags.alertsEnabled = true;
        process.env.NEXT_RUNTIME = 'nodejs';
        delete process.env.INNGEST_SIGNING_KEY;
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it('starts the loop when alerts are on and Inngest is not configured', async () => {
        await register();
        expect(startAlertScheduler).toHaveBeenCalledTimes(1);
    });

    it('leaves the cron to Inngest when a signing key is set', async () => {
        process.env.INNGEST_SIGNING_KEY = 'signkey-test';
        await register();
        expect(startAlertScheduler).not.toHaveBeenCalled();
    });

    it('does nothing when alerts are off', async () => {
        flags.alertsEnabled = false;
        await register();
        expect(startAlertScheduler).not.toHaveBeenCalled();
    });

    it('does not start a Node timer in the edge runtime', async () => {
        process.env.NEXT_RUNTIME = 'edge';
        await register();
        expect(startAlertScheduler).not.toHaveBeenCalled();
    });
});
