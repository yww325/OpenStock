import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { alertsEnabled } from "@/lib/market-data";
import { sendWeeklyNewsSummary, sendSignUpEmail, checkStockAlerts, checkInactiveUsers } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
    client: inngest,
    // Price alerts are checked by the Inngest cron where it is configured, and by the in-process
    // scheduler (instrumentation.ts) where it is not; the function is registered either way.
    functions: [sendSignUpEmail, sendWeeklyNewsSummary, checkInactiveUsers, ...(alertsEnabled ? [checkStockAlerts] : [])],
})