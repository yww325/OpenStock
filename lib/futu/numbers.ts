// Futu sends some numbers as strings, and the SDK decodes 64-bit integers as Long objects
// (protobufjs does that for every int64 field). Everything the app reads goes through here,
// so a Long never turns into a NaN or a silent zero.

type LongLike = { toNumber?: () => number };

// A number, or zero when there is none to read.
export const toNumber = (value: number | string | LongLike | null | undefined): number => {
    if (value === null || value === undefined) return 0;

    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'object' && typeof value.toNumber === 'function') {
        const parsed = value.toNumber();
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

// The same, for fields that may be missing: a field that is not there has no number, while a
// field that really is zero keeps its zero.
export const toOptionalNumber = (value: number | string | LongLike | null | undefined): number | undefined => {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    if (typeof value === 'object' && typeof value.toNumber === 'function') {
        const parsed = value.toNumber();
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};
