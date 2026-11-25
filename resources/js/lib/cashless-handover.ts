import { matchedAwbSignatures, normalizeAwb } from './awb-signatures';

export function prepareCashlessAwb(
    raw: string,
    queued: string[],
    saved: string[],
) {
    const awb = normalizeAwb(raw);
    if (awb.length < 6) {
        return {
            error: 'Nomor resi minimal 6 karakter. Kode barang/SKU pendek tidak dapat digunakan.',
        };
    }
    const matchedPatterns = matchedAwbSignatures(awb);
    if (!matchedPatterns.length)
        return {
            error: 'Format resi tidak dikenali.',
            kind: 'invalid' as const,
        };
    if (/^(0101|0166)[0-9]+$/.test(awb)) {
        return { error: 'Resi ini termasuk Manual. Gunakan resi Cashless.' };
    }
    if (queued.includes(awb) || saved.includes(awb)) {
        return {
            error: `Resi ${awb} sudah dipindai.`,
            kind: 'duplicate' as const,
        };
    }
    if (queued.length >= 500) {
        return {
            error: 'Simpan 500 resi ini dahulu sebelum menambah resi berikutnya.',
        };
    }
    return { awb, matchedPatterns };
}
