// The price-alert check: price every active alert's symbol, email the owner when a target is crossed.
// Shared by the Inngest cron and by the built-in scheduler self-hosted instances use (lib/alerts/scheduler).
// Server-only: it reads the database, spends Finnhub calls and sends email.
import mongoose from 'mongoose';
import { connectToDatabase } from '@/database/mongoose';
import { Alert } from '@/database/models/alert.model';
import { getQuote } from '@/lib/actions/finnhub.actions';
import { getFutuQuotes } from '@/lib/futu/quotes';
import { isHkSymbol } from '@/lib/futu/symbols';
import { sendStockAlertEmail } from '@/lib/nodemailer';

export type AlertCheckResult = { processed: number; triggered: number };

export async function runStockAlertCheck(): Promise<AlertCheckResult> {
    const connection = await connectToDatabase();
    const activeAlerts = await Alert.find({
        active: true,
        triggered: false,
        expiresAt: { $gt: new Date() },
    }).lean();

    if (activeAlerts.length === 0) return { processed: 0, triggered: 0 };

    // One fresh quote per symbol, shared by every alert on it. No cache: a five-minute check
    // that reads an hour-old price is worse than no check.
    const symbols = [...new Set(activeAlerts.map((alert) => alert.symbol))];
    const prices: Record<string, number> = {};

    // Hong Kong listings come from the machine's own Futu OpenD gateway, in HKD.
    const hongKong = symbols.filter(isHkSymbol);
    if (hongKong.length) {
        try {
            const quotes = await getFutuQuotes(hongKong);
            for (const symbol of hongKong) {
                const price = quotes[symbol]?.c;
                if (price) prices[symbol] = price;
            }
        } catch (error) {
            console.error('Failed to fetch Hong Kong prices', error);
        }
    }

    for (const symbol of symbols.filter((symbol) => !isHkSymbol(symbol))) {
        try {
            const quote = await getQuote(symbol);
            if (quote?.c) prices[symbol] = quote.c;
        } catch (error) {
            console.error(`Failed to fetch price for ${symbol}`, error);
        }
    }

    const triggeredAlerts = activeAlerts
        .map((alert) => ({ alert, currentPrice: prices[alert.symbol] }))
        .filter(({ alert, currentPrice }) => currentPrice !== undefined && (
            alert.condition === 'ABOVE' ? currentPrice >= alert.targetPrice : currentPrice <= alert.targetPrice
        ));

    if (triggeredAlerts.length === 0) return { processed: activeAlerts.length, triggered: 0 };

    const db = connection.connection.db;
    if (!db) throw new Error('No DB Connection');

    for (const { alert, currentPrice } of triggeredAlerts) {
        // Claim the alert atomically before emailing: two overlapping runs can both hold the same
        // alert in memory, and only one wins this update, so an alert is never emailed twice.
        const claimed = await Alert.findOneAndUpdate(
            { _id: alert._id, active: true, triggered: false },
            { $set: { triggered: true, active: false } },
        );
        if (!claimed) continue;
        const release = () => Alert.findByIdAndUpdate(alert._id, { triggered: false, active: true }).catch(() => {});

        console.log(`🚀 ALERT FIRED: ${alert.symbol} is ${currentPrice} (${alert.condition} ${alert.targetPrice})`);

        // Per-alert try/catch: a failure releases the claim so the next run retries it, and never
        // aborts the loop after emails have already gone out for the alerts before it.
        try {
            // Better Auth users may be keyed by `id` or `_id` (see getWatchlistSymbolsByEmail)
            const user = await db.collection('user').findOne<{ email?: string }>(
                mongoose.isValidObjectId(alert.userId)
                    ? { $or: [{ id: alert.userId }, { _id: new mongoose.Types.ObjectId(alert.userId) }] }
                    : { id: alert.userId }
            );

            if (user?.email) {
                const result = await sendStockAlertEmail({
                    email: user.email,
                    symbol: alert.symbol,
                    currentPrice,
                    targetPrice: alert.targetPrice,
                    condition: alert.condition,
                });
                // Email not configured: release so the alert fires once email works
                if (result.status === 'skipped') await release();
            } else {
                console.warn(`⚠️ No email for user ${alert.userId}; closing alert ${alert._id} without notifying`);
            }
        } catch (error) {
            await release();
            console.error(`❌ Failed to process alert ${alert._id} (${alert.symbol}); will retry next run`, error);
        }
    }

    return { processed: activeAlerts.length, triggered: triggeredAlerts.length };
}
