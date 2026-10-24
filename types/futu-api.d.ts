// The Futu SDK ships no type definitions, so this describes the part of it the app uses.

declare module 'futu-api' {
    export type FutuResponse = {
        retType: number;
        retMsg?: string;
        errCode?: number;
        s2c?: Record<string, unknown>;
    };

    export type FutuSecurityRequest = {
        c2s: { securityList: { market: number; code: string }[] };
    };

    export default class ftWebsocket {
        onlogin: ((ok: boolean, message?: unknown) => void) | null;
        onPush: ((cmd: number, response: unknown) => void) | null;
        start(ip: string, port: number, ssl?: boolean, key?: string): void;
        stop(): void;
        getConnID(): number;
        GetSecuritySnapshot(req: FutuSecurityRequest): Promise<FutuResponse>;
        GetStaticInfo(req: FutuSecurityRequest): Promise<FutuResponse>;
        GetKL(req: unknown): Promise<FutuResponse>;
        RequestHistoryKL(req: unknown): Promise<FutuResponse>;
        GetTradeDate(req: unknown): Promise<FutuResponse>;
        GetPlateSet(req: unknown): Promise<FutuResponse>;
    }
}
