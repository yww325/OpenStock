# Market support

What OpenStock can show depends on three free data sources. This table was tested against all of them on the free plans (September 2026). Paid Finnhub or TradingView plans unlock more.

| Market | Charts and widgets (TradingView embeds) | Our quotes, watchlist prices, alerts |
|---|---|---|
| 🇺🇸 United States (NYSE, Nasdaq, AMEX) | Live | Yes, via Finnhub |
| Crypto (Binance pairs, e.g. `BINANCE:BTCUSDT`) | Live | Yes, via Finnhub |
| Forex (e.g. `FX:EURUSD`) | Live | No |
| 🇭🇰 Hong Kong (e.g. `0700.HK`) | Candle chart blocked; financials, technicals and profile work | Yes, via Futu OpenD |
| 🇨🇦 Canada (TSX) | Delayed | No |
| 🇦🇺 Australia (ASX) | Delayed | No |
| 🇮🇳 India, through BSE (`.BO`; `.NS` symbols are charted on BSE) | End of day | No |
| 🇩🇪 Germany (Xetra) | End of day | No |
| India NSE (charted on BSE instead) | Blocked in embeds | No |
| London, Tokyo, Korea, Taiwan, Singapore, New Zealand, Thailand, Malaysia, Istanbul, TSX Venture, Mexico, Johannesburg | Candle chart blocked; financials, technicals and profile work | No |
| Index tickers such as NIFTY, FTSE 100, DAX, Nikkei 225, Hang Seng | Blocked in embeds | No |

## What that means in the app

- **Dashboard:** pick a market (US, India, Germany, Canada, Australia, Hong Kong, Crypto, Forex). US and crypto tiles use our own cached Finnhub quotes, Hong Kong tiles our own Futu OpenD link; the others use TradingView quote tiles.
- **Stock pages:** symbols Finnhub or Futu can price get the full header (live price, day range, market cap). Others get TradingView's quote panel.
- **Alerts:** an OpenStock Cloud feature, or self-hosted with `NEXT_PUBLIC_OPENSTOCK_ALERTS=enabled`. US stocks and crypto through Finnhub, Hong Kong listings through Futu OpenD: both are quote sources the checker can call every five minutes.
- **Search:** Finnhub search returns listings worldwide, and Hong Kong listings come from the app's own list (`lib/futu/hk-universe.ts`), so they are found without an API key. On exchanges whose chart is blocked, the stock page links to the chart on TradingView instead (the list is `CHART_BLOCKED_EXCHANGES` in `lib/utils.ts`, each confirmed with two tickers).

## Hong Kong and Futu OpenD

Hong Kong prices come from Futu OpenD, the gateway Futu runs on your own machine. OpenD holds the market-data login; the app talks to it with the `futu-api` Node SDK.

- Run OpenD before the app. On this deployment it is a systemd user unit, `futu-opend.service`.
- The Node SDK speaks WebSocket, so OpenD has to serve it: start it with `-websocket_ip=127.0.0.1 -websocket_port=33333`. The raw protocol port 11111 is what the Python SDK uses and is of no use to the app.
- Set `FUTU_OPEND_HOST` and `FUTU_OPEND_PORT` if it does not listen on `127.0.0.1:33333`.
- Without OpenD the app still runs: Hong Kong listings are shown without a price.
- OpenD serves one login at a time, so run exactly one instance per machine.
- TradingView has no Hong Kong data in free embeds, so the Hong Kong market page lists its leaders in the app's own table instead of the TradingView widgets.

## Adding a market

Add an entry to `lib/markets.ts` with symbols from an exchange that renders in TradingView embeds (open one symbol in a quote widget first). To price and alert on more exchanges, you need a data plan that covers them.
