export function prepareCashlessAwb(
    raw: string,
    queued: string[],
    saved: string[],
) {
    const awb = raw.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,100}$/.test(awb)) {
        return {
            error: 'Isi nomor resi yang valid tanpa spasi (maksimal 100 karakter).',
        };
    }
    if (/^(0101|0166)[0-9]+$/.test(awb)) {
        return { error: 'Resi ini termasuk Manual. Gunakan resi Cashless.' };
    }
    if (queued.includes(awb) || saved.includes(awb)) {
        return { error: `Resi ${awb} sudah ada pada buku atau daftar ini.` };
    }
    if (queued.length >= 500) {
        return {
            error: 'Simpan 500 resi ini dahulu sebelum menambah resi berikutnya.',
        };
    }
    return { awb };
}
