import source from '../../../config/awb-signatures.json?raw';

export const awbSignatures: readonly string[] = JSON.parse(source);

/** Normalisasi lama: huruf ASCII menjadi kapital dan buang spasi/tab/CR/LF di tepi saja. */
export function normalizeAwb(raw: string): string {
    return raw
        .replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')
        .replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

export function matchedAwbSignatures(
    awb: string,
    patterns = awbSignatures,
): string[] {
    return patterns.filter(
        (pattern) =>
            awb.length === pattern.length &&
            pattern
                .split('')
                .every((character, index) =>
                    character === '#'
                        ? /^[0-9]$/.test(awb[index])
                        : character === awb[index],
                ),
    );
}

export function auditAwbSignatures(patterns = awbSignatures) {
    const duplicates = patterns.filter(
        (pattern, index) => patterns.indexOf(pattern) !== index,
    );
    const overlaps: [string, string][] = [];
    for (const [index, first] of patterns.entries()) {
        for (const second of patterns.slice(index + 1)) {
            if (
                first.length === second.length &&
                first
                    .split('')
                    .every(
                        (character, position) =>
                            character === second[position] ||
                            (character === '#' &&
                                /^[0-9]$/.test(second[position])) ||
                            (second[position] === '#' &&
                                /^[0-9]$/.test(character)),
                    )
            )
                overlaps.push([first, second]);
        }
    }
    return {
        duplicates,
        overlaps,
        literals: patterns.filter((pattern) => !pattern.includes('#')),
    };
}
