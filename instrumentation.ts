// Runs once when a Next.js server starts. Background jobs normally come from Inngest; on a
// self-hosted instance without it, the price-alert check runs in this process instead.
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    const { alertsEnabled } = await import('@/lib/market-data');
    // Inngest owns the five-minute cron wherever it is configured, so do not run a second loop there.
    if (!alertsEnabled || process.env.INNGEST_SIGNING_KEY) return;

    const { startAlertScheduler } = await import('@/lib/alerts/scheduler');
    startAlertScheduler();
}
