import { expect, test } from 'vitest';
import { signaturePixelsHaveInk } from './signature';

test('signature rejects transparent or white pixels and accepts visible dark strokes', () => {
    expect(
        signaturePixelsHaveInk(
            new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255]),
        ),
    ).toBe(false);
    expect(
        signaturePixelsHaveInk(new Uint8ClampedArray([17, 17, 17, 255])),
    ).toBe(true);
    expect(signaturePixelsHaveInk(new Uint8ClampedArray([0, 0, 0, 14]))).toBe(
        false,
    );
    expect(
        signaturePixelsHaveInk(new Uint8ClampedArray([190, 190, 190, 15])),
    ).toBe(true);
});
