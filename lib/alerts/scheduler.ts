// The alert checker for self-hosted instances that have no Inngest: the Next.js server itself
// runs the five-minute loop. Inngest still owns the cron wherever INNGEST_SIGNING_KEY is set
// (Cloud, or a self-hosted Inngest server), so the two never run side by side.
import { runStockAlertCheck } from './check';

export const ALERT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

declare global {
    // One timer per server process, even if instrumentation is registered more than once.
    var openstockAlertTimer: ReturnType<typeof setTimeout> | undefined;
}

export function startAlertScheduler() {
    if (global.openstockAlertTimer) return;

    const tick = async () => {
        try {
            const { triggered } = await runStockAlertCheck();
            if (triggered > 0) console.log(`✅ Alert check: ${triggered} alert${triggered === 1 ? '' : 's'} fired`);
        } catch (error) {
            // A failed run must not stop the loop: the next tick retries it.
            console.error('❌ Alert check failed; retrying in five minutes', error);
        }
        // A chain of timeouts, not setInterval: a slow check delays the next one instead of overlapping it.
        global.openstockAlertTimer = setTimeout(tick, ALERT_CHECK_INTERVAL_MS);
    };

    // Let the server finish booting (and connect to MongoDB) before the first check.
    global.openstockAlertTimer = setTimeout(tick, 30_000);
    console.log('⏰ Price alerts: checking every 5 minutes in this process (no Inngest configured)');
}
