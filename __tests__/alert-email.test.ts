import { describe, expect, it, vi } from 'vitest';

// Hong Kong prices are quoted in HKD; an alert email that says "$" for a HK$500 target is wrong.

const sendMail = vi.fn().mockResolvedValue({ messageId: 'msg-1' });
vi.mock('nodemailer', () => ({
    default: { createTransport: () => ({ sendMail, verify: () => {} }) },
}));

process.env.NODEMAILER_EMAIL = 'sender@example.com';
process.env.NODEMAILER_PASSWORD = 'secret';
const { sendStockAlertEmail } = await import('@/lib/nodemailer');

describe('sendStockAlertEmail', () => {
    it('formats a Hong Kong alert in HKD', async () => {
        await sendStockAlertEmail({
            email: 'owner@example.com',
            symbol: '0700.HK',
            currentPrice: 480.5,
            targetPrice: 500,
            condition: 'BELOW',
        });

        const mail = sendMail.mock.calls[0][0];
        expect(mail.subject).toContain('HK$500.00');
        expect(mail.text).toContain('HK$480.50');
        expect(mail.text).not.toContain('$480.50 USD');
    });

    it('keeps US alerts in dollars', async () => {
        await sendStockAlertEmail({
            email: 'owner@example.com',
            symbol: 'AAPL',
            currentPrice: 210,
            targetPrice: 200,
            condition: 'ABOVE',
        });

        const mail = sendMail.mock.calls[1][0];
        expect(mail.subject).toContain('$200.00');
        expect(mail.subject).not.toContain('HK$');
    });
});
