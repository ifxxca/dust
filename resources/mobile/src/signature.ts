export function signaturePixelsHaveInk(pixels: Uint8ClampedArray): boolean {
    for (let index = 0; index < pixels.length; index += 4) {
        if (
            pixels[index + 3] > 14 &&
            pixels[index] + pixels[index + 1] + pixels[index + 2] < 600
        )
            return true;
    }
    return false;
}

export async function signatureHasInk(source: string): Promise<boolean> {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
            reject(
                new Error(
                    'Tanda tangan belum dapat dibaca. Gambar ulang sebelum mengirim.',
                ),
            );
        image.src = source;
    });
    if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth > 2000 ||
        image.naturalHeight > 1000
    )
        return false;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context)
        throw new Error(
            'Tanda tangan belum dapat diperiksa. Buka ulang langkah tanda tangan.',
        );
    context.drawImage(image, 0, 0);
    return signaturePixelsHaveInk(
        context.getImageData(0, 0, canvas.width, canvas.height).data,
    );
}
