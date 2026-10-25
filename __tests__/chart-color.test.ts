import { describe, expect, it } from 'vitest';

import { formatRgba } from '@/lib/chart-color';

// The chart library reads a colour by setting it on an element and reading the computed value
// back, so it only understands "rgb(r, g, b)" and "rgba(r, g, b, a)". The app's palette is
// oklch, which the browser hands back untouched, so colours are painted on a canvas first and
// come back as these four numbers.

describe('formatRgba', () => {
    it('writes an opaque colour as rgb', () => {
        expect(formatRgba(62, 186, 101, 255)).toBe('rgb(62, 186, 101)');
    });

    it('writes a translucent colour as rgba with the alpha it was given', () => {
        expect(formatRgba(240, 243, 250, 10)).toBe('rgba(240, 243, 250, 0.039)');
    });

    it('treats a fully transparent colour as translucent', () => {
        expect(formatRgba(0, 0, 0, 0)).toBe('rgba(0, 0, 0, 0)');
    });
});
