import { beforeEach, describe, expect, it, vi } from 'vitest';

// The alert check is the part that decides whether an email goes out. These tests pin the two
// ways it can go wrong: emailing an alert twice, and closing an alert that was never delivered.

const find = vi.fn();
const findOneAndUpdate = vi.fn();
const findByIdAndUpdate = vi.fn();
const getQuote = vi.fn();
const getFutuQuotes = vi.fn();
const sendStockAlertEmail = vi.fn();
const findUser = vi.fn();

vi.mock('@/database/mongoose', () => ({
    connectToDatabase: vi.fn(async () => ({
        connection: { db: { collection: () => ({ findOne: (...args: unknown[]) => findUser(...args) }) } },
    })),
}));
vi.mock('@/database/models/alert.model', () => ({
    Alert: {
        find: (...args: unknown[]) => find(...args),
        findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
        findByIdAndUpdate: (...args: unknown[]) => findByIdAndUpdate(...args),
    },
}));
vi.mock('@/lib/actions/finnhub.actions', () => ({ getQuote: (...args: unknown[]) => getQuote(...args) }));
vi.mock('@/lib/futu/quotes', () => ({ getFutuQuotes: (...args: unknown[]) => getFutuQuotes(...args) }));
vi.mock('@/lib/nodemailer', () => ({ sendStockAlertEmail: (...args: unknown[]) => sendStockAlertEmail(...args) }));

import { runStockAlertCheck } from '@/lib/alerts/check';

const alert = (overrides: Record<string, unknown> = {}) => ({
    _id: 'alert-1',
    userId: 'user-1',
    symbol: 'AAPL',
    targetPrice: 200,
    condition: 'ABOVE',
    ...overrides,
});

const withAlerts = (alerts: unknown[]) => find.mockReturnValue({ lean: async () => alerts });

describe('runStockAlertCheck', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        findUser.mockResolvedValue({ email: 'owner@example.com' });
        findOneAndUpdate.mockResolvedValue({ _id: 'alert-1' });
        findByIdAndUpdate.mockResolvedValue({});
        sendStockAlertEmail.mockResolvedValue({ status: 'sent', messageId: 'm1' });
        getFutuQuotes.mockResolvedValue({});
    });

    it('emails the owner and closes the alert when the price crosses the target', async () => {
        withAlerts([alert()]);
        getQuote.mockResolvedValue({ c: 210 });

        await expect(runStockAlertCheck()).resolves.toEqual({ processed: 1, triggered: 1 });

        expect(find).toHaveBeenCalledWith({
            active: true,
            triggered: false,
            expiresAt: { $gt: expect.any(Date) },
        });
        expect(sendStockAlertEmail).toHaveBeenCalledWith({
            email: 'owner@example.com',
            symbol: 'AAPL',
            currentPrice: 210,
            targetPrice: 200,
            condition: 'ABOVE',
        });
        // Claimed before the email: only this run can send it.
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'alert-1', active: true, triggered: false },
            { $set: { triggered: true, active: false } },
        );
    });

    it('applies each condition on its own side of the target', async () => {
        withAlerts([
            alert({ _id: 'above', condition: 'ABOVE', targetPrice: 200 }), // price 190: not yet
            alert({ _id: 'below', condition: 'BELOW', targetPrice: 100 }), // price 90: crossed
        ]);
        getQuote.mockResolvedValue({ c: 90 });

        await expect(runStockAlertCheck()).resolves.toEqual({ processed: 2, triggered: 1 });
        expect(sendStockAlertEmail).toHaveBeenCalledTimes(1);
        expect(sendStockAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ condition: 'BELOW', currentPrice: 90 }));
    });

    it('prices a Hong Kong listing through Futu, not Finnhub', async () => {
        withAlerts([alert({ symbol: '0700.HK', condition: 'BELOW', targetPrice: 500 })]);
        getFutuQuotes.mockResolvedValue({ '0700.HK': { c: 480.5 } });

        await expect(runStockAlertCheck()).resolves.toEqual({ processed: 1, triggered: 1 });

        expect(getFutuQuotes).toHaveBeenCalledWith(['0700.HK']);
        expect(getQuote).not.toHaveBeenCalled();
        expect(sendStockAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
            symbol: '0700.HK',
            currentPrice: 480.5,
        }));
    });

    it('does not email an alert another run already claimed', async () => {
        withAlerts([alert()]);
        getQuote.mockResolvedValue({ c: 210 });
        findOneAndUpdate.mockResolvedValue(null);

        await expect(runStockAlertCheck()).resolves.toEqual({ processed: 1, triggered: 1 });
        expect(sendStockAlertEmail).not.toHaveBeenCalled();
    });

    it('reopens an alert whose email was skipped, so it fires once email works', async () => {
        withAlerts([alert()]);
        getQuote.mockResolvedValue({ c: 210 });
        sendStockAlertEmail.mockResolvedValue({ status: 'skipped' });

        await runStockAlertCheck();
        expect(findByIdAndUpdate).toHaveBeenCalledWith('alert-1', { triggered: false, active: true });
    });

    it('skips symbols the quote source could not price', async () => {
        withAlerts([alert()]);
        getQuote.mockResolvedValue(null);

        await expect(runStockAlertCheck()).resolves.toEqual({ processed: 1, triggered: 0 });
        expect(sendStockAlertEmail).not.toHaveBeenCalled();
    });
});
