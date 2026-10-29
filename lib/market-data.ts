// How fresh market numbers are. Safe to import from client components (no keys here).
//
//   cached   (default) Public instance: quotes refresh hourly, shared by every user via the data cache.
//   realtime           OpenStock Cloud or self-hosted with your own Finnhub keys: quotes refresh every 15s.
export type DataMode = 'cached' | 'realtime';

export const DATA_MODE: DataMode = process.env.NEXT_PUBLIC_OPENSTOCK_DATA_MODE === 'realtime' ? 'realtime' : 'cached';

export const QUOTE_TTL_SECONDS = DATA_MODE === 'realtime' ? 15 : 3600;

export const isRealtime = DATA_MODE === 'realtime';

// Email price alerts: on in realtime mode (Cloud or self-hosted), and on any instance that opts in
// with NEXT_PUBLIC_OPENSTOCK_ALERTS=enabled. A five-minute alert check costs one quote per symbol,
// so an hourly instance can send alerts without paying for realtime quotes. Fixed at build time.
export const alertsEnabled = isRealtime || process.env.NEXT_PUBLIC_OPENSTOCK_ALERTS === 'enabled';
