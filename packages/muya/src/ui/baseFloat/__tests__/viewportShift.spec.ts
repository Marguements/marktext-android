// @vitest-environment happy-dom

import type { Muya } from '../../../index';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import BaseFloat from '../index';

// REGRESSION GUARD: floats cut off at the viewport edge on narrow screens.
//
// A float centred on a reference near the left edge (the table column toolbar
// over the first column, the paragraph menu under the front button) used to be
// positioned partly off-screen on phones: `flip()` only changes side on the
// main axis, so nothing pulled the float back inside the viewport horizontally.

class TestFloat extends BaseFloat {}

// happy-dom has no layout, so give the float box the size floating-ui measures.
function makeFloat(width: number, height: number): TestFloat {
    const muya = { eventCenter: { emit: vi.fn() } } as unknown as Muya;
    const float = new TestFloat(muya, 'mu-test-float', { placement: 'bottom' });
    const box = float.floatBox!;
    Object.assign(box.style, { width: `${width}px`, height: `${height}px` });
    Object.defineProperty(box, 'offsetWidth', { value: width });
    Object.defineProperty(box, 'offsetHeight', { value: height });
    return float;
}

function referenceAt(left: number) {
    return {
        getBoundingClientRect: () => ({
            x: left,
            y: 100,
            top: 100,
            left,
            right: left + 20,
            bottom: 120,
            width: 20,
            height: 20,
            toJSON() {},
        }),
    };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

describe('baseFloat keeps floats inside the viewport', () => {
    beforeAll(() => {
        // floating-ui reads the viewport size from the root element, which
        // happy-dom reports as 0×0.
        Object.defineProperty(document.documentElement, 'clientWidth', { value: 1024, configurable: true });
        Object.defineProperty(document.documentElement, 'clientHeight', { value: 768, configurable: true });
    });

    it('shifts a float that would overflow the left edge back on screen', async () => {
        const float = makeFloat(200, 40);

        // Centred under a 20px reference at x=2, a 200px float would start at x=-88.
        float.show(referenceAt(2));
        await tick();

        // Shifted right to the 8px viewport padding.
        expect(Number.parseFloat(float.floatBox!.style.left)).toBe(8);
    });

    it('keeps the centred position when the float already fits', async () => {
        const float = makeFloat(200, 40);

        float.show(referenceAt(400));
        await tick();

        expect(Number.parseFloat(float.floatBox!.style.left)).toBe(310);
    });
});
