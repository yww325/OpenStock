// The Futu SDK talks to OpenD, the little gateway Futu runs on your own machine. OpenD holds
// the market-data login and serves the protocol.
//
// The Node SDK speaks WebSocket, so it needs OpenD's WebSocket port, which is off by default:
// start OpenD with `-websocket_ip=127.0.0.1 -websocket_port=33333`. (The Python SDK talks the
// raw protocol on 11111 instead; that port is no use here.)
//
// This module owns that connection: one socket per server process, opened on first use and
// kept for later calls. When OpenD is not running there is nothing to do about it, so the
// connection fails fast, cools down for a while and the app carries on without Hong Kong
// prices instead of throwing.

import ftWebsocket from 'futu-api';

const HOST = process.env.FUTU_OPEND_HOST || '127.0.0.1';
const PORT = Number(process.env.FUTU_OPEND_PORT || 33333);
const SSL = process.env.FUTU_OPEND_SSL === 'true';
const KEY = process.env.FUTU_OPEND_KEY || '';

const CONNECT_TIMEOUT_MS = 5000;
// After a failure, wait before trying again: OpenD may be restarting, and a retry every
// request would pile up sockets.
const RETRY_COOLDOWN_MS = 15_000;

type FutuSocket = InstanceType<typeof ftWebsocket>;

let socket: FutuSocket | null = null;
let loggedIn = false;
let connecting: Promise<FutuSocket | null> | null = null;
let retryAfter = 0;
let warned = false;

async function openSocket(): Promise<FutuSocket | null> {
    if (loggedIn && socket) return socket;
    if (Date.now() < retryAfter) return null;

    const ws = socket ?? (socket = new ftWebsocket());
    const ready = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), CONNECT_TIMEOUT_MS);
        ws.onlogin = (ok: boolean) => {
            clearTimeout(timer);
            loggedIn = ok;
            resolve(ok);
        };
        ws.start(HOST, PORT, SSL, KEY);
    });

    if (!(await ready)) {
        retryAfter = Date.now() + RETRY_COOLDOWN_MS;
        if (!warned) {
            console.error(`[futu] no OpenD at ${HOST}:${PORT}. Hong Kong prices are unavailable until it runs.`);
            warned = true;
        }
        return null;
    }

    warned = false;
    return ws;
}

// The socket to talk to, or null when OpenD can't be reached.
export async function getFutuSocket(): Promise<FutuSocket | null> {
    if (loggedIn && socket) return socket;
    if (!connecting) {
        connecting = openSocket().finally(() => {
            connecting = null;
        });
    }
    return connecting;
}

// True when OpenD answered, so callers can tell "no quote" from "no gateway".
export const futuIsConnected = () => loggedIn;
