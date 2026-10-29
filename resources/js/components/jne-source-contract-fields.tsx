import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import InputError from '@/components/input-error';

const categories = [
    ['manual_hybrid', 'Manual'],
    ['cashless_hybrid', 'Cashless'],
    ['css_orion', 'CSS / Orion'],
] as const;
const hybridProcesses = [
    'roberto:cashless',
    'roberto:manual',
    'nuralamt:cashless',
    'nuralamt:manual',
];

function CategoryMappings({
    initial,
    onChange,
}: {
    initial: Record<string, string>;
    onChange: (value: Record<string, string>) => void;
}) {
    const [rows, setRows] = useState(() =>
        Object.entries(initial).map(([source, category], id) => ({
            id,
            source,
            category,
        })),
    );
    const update = (next: typeof rows) => {
        setRows(next);
        if (
            next.every((row) => row.source && row.category) &&
            new Set(next.map((row) => row.source)).size === next.length
        ) {
            onChange(
                Object.fromEntries(
                    next.map((row) => [row.source, row.category]),
                ),
            );
        }
    };
    const isDuplicate = (source: string) =>
        rows.filter((row) => row.source === source).length > 1;
    return (
        <div className="flex flex-col gap-2">
            {rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-start gap-2">
                    <div className="min-w-32 flex-1">
                        <Input
                            className="min-w-32 flex-1"
                            aria-label={'Nilai kategori sumber ' + (row.id + 1)}
                            required
                            aria-invalid={isDuplicate(row.source)}
                            aria-describedby={
                                isDuplicate(row.source)
                                    ? 'category-mapping-error-' + row.id
                                    : undefined
                            }
                            ref={(input) => {
                                input?.setCustomValidity(
                                    rows.filter(
                                        (other) => other.source === row.source,
                                    ).length > 1
                                        ? 'Nilai sumber sudah terdaftar.'
                                        : '',
                                );
                            }}
                            value={row.source}
                            onChange={(event) => {
                                const duplicate = rows.some(
                                    (other) =>
                                        other.id !== row.id &&
                                        other.source === event.target.value,
                                );
                                event.target.setCustomValidity(
                                    duplicate
                                        ? 'Nilai sumber sudah terdaftar.'
                                        : '',
                                );
                                update(
                                    rows.map((item) =>
                                        item.id === row.id
                                            ? {
                                                  ...item,
                                                  source: event.target.value,
                                              }
                                            : item,
                                    ),
                                );
                            }}
                        />
                        <InputError
                            id={'category-mapping-error-' + row.id}
                            message={
                                isDuplicate(row.source)
                                    ? 'Nilai sumber sudah terdaftar.'
                                    : undefined
                            }
                        />
                    </div>
                    <select
                        required
                        aria-label={'Kategori POP ' + (row.id + 1)}
                        className="h-10 rounded-md border bg-background px-2 text-sm"
                        value={row.category}
                        onChange={(event) =>
                            update(
                                rows.map((item) =>
                                    item.id === row.id
                                        ? {
                                              ...item,
                                              category: event.target.value,
                                          }
                                        : item,
                                ),
                            )
                        }
                    >
                        <option value="">Pilih kategori</option>
                        {categories.map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={'Hapus pemetaan ' + (row.id + 1)}
                        onClick={() =>
                            update(rows.filter((item) => item.id !== row.id))
                        }
                    >
                        Hapus
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                    setRows([
                        ...rows,
                        {
                            id: Math.max(-1, ...rows.map((row) => row.id)) + 1,
                            source: '',
                            category: '',
                        },
                    ])
                }
            >
                Tambah nilai sumber
            </Button>
        </div>
    );
}

export default function JneSourceContractFields({
    value,
    onChange,
    error,
}: {
    value: string;
    onChange: (value: string) => void;
    error?: string;
}) {
    const [advancedRevision, setAdvancedRevision] = useState(0);
    const advancedDetails = useRef<HTMLDetailsElement>(null);
    let definition: Record<string, unknown> | null = null;
    try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            definition = parsed as Record<string, unknown>;
    } catch {
        /* Invalid JSON stays editable in the advanced section. */
    }
    const validDefinition = definition !== null;
    useEffect(() => {
        if ((error || !validDefinition) && advancedDetails.current) {
            advancedDetails.current.open = true;
        }
    }, [error, validDefinition]);
    const update = (key: string, next: unknown) =>
        onChange(JSON.stringify({ ...definition, [key]: next }, null, 2));
    const hybrid = (definition?.hybrid_categories ?? {}) as Record<
        string,
        string
    >;
    return (
        <div className="flex flex-col gap-4">
            {definition && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {[
                            ['customer_code_column', 'Kolom kode customer'],
                            ['category_column', 'Kolom kategori'],
                        ].map(([key, label]) => (
                            <div key={key} className="flex flex-col gap-2">
                                <Label htmlFor={'contract-' + key}>
                                    {label}
                                </Label>
                                <Input
                                    id={'contract-' + key}
                                    maxLength={120}
                                    placeholder="Belum ditetapkan"
                                    spellCheck={false}
                                    value={
                                        typeof definition[key] === 'string'
                                            ? definition[key]
                                            : ''
                                    }
                                    onChange={(event) =>
                                        update(key, event.target.value || null)
                                    }
                                />
                            </div>
                        ))}
                    </div>
                    <details className="rounded-lg border p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                            Otomatisasi pickup
                        </summary>
                        <div className="mt-3 flex flex-col gap-3">
                            <label className="flex min-h-11 items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={
                                        definition.automatic_reconciliation ===
                                        true
                                    }
                                    onChange={(event) =>
                                        onChange(
                                            JSON.stringify(
                                                {
                                                    ...definition,
                                                    automatic_reconciliation:
                                                        event.target.checked,
                                                    pickup_date_column: event
                                                        .target.checked
                                                        ? 'TGL_ENTRY'
                                                        : null,
                                                },
                                                null,
                                                2,
                                            ),
                                        )
                                    }
                                />
                                Cocokkan kode customer dan tanggal entry dengan
                                tanggal pickup
                            </label>
                            <label className="flex min-h-11 items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={
                                        definition.collection_mode ===
                                        'complete_date_report'
                                    }
                                    onChange={(event) =>
                                        update(
                                            'collection_mode',
                                            event.target.checked
                                                ? 'complete_date_report'
                                                : null,
                                        )
                                    }
                                />
                                Report harian mencakup seluruh resi sesuai
                                persyaratan sumber
                            </label>
                            <p className="text-sm text-muted-foreground">
                                Aktifkan setelah kolom kode, tanggal, kategori
                                dan cakupan report diverifikasi. Dua pickup
                                customer pada hari yang sama tetap memerlukan
                                pemeriksaan.
                            </p>
                        </div>
                    </details>
                    <details className="rounded-lg border p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                            Pemetaan kategori
                        </summary>
                        <div className="mt-3 flex flex-col gap-4">
                            <CategoryMappings
                                key={advancedRevision}
                                initial={
                                    (definition.category_values ??
                                        {}) as Record<string, string>
                                }
                                onChange={(next) =>
                                    update('category_values', next)
                                }
                            />
                            <fieldset className="flex flex-col gap-2">
                                <legend className="mb-2 text-sm font-medium">
                                    Berdasarkan proses Hybrid
                                </legend>
                                {hybridProcesses.map((process) => (
                                    <div
                                        className="flex flex-wrap items-center justify-between gap-2"
                                        key={process}
                                    >
                                        <Label htmlFor={'contract-' + process}>
                                            {process}
                                        </Label>
                                        <select
                                            id={'contract-' + process}
                                            className="h-10 rounded border bg-background px-2 text-sm"
                                            value={hybrid[process] ?? ''}
                                            onChange={(event) => {
                                                const next = { ...hybrid };
                                                if (event.target.value)
                                                    next[process] =
                                                        event.target.value;
                                                else delete next[process];
                                                update(
                                                    'hybrid_categories',
                                                    next,
                                                );
                                            }}
                                        >
                                            <option value="">
                                                Belum ditetapkan
                                            </option>
                                            {categories.map(
                                                ([category, label]) => (
                                                    <option
                                                        key={category}
                                                        value={category}
                                                    >
                                                        {label}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    </div>
                                ))}
                            </fieldset>
                        </div>
                    </details>
                    <details className="rounded-lg border p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                            Sumber wajib untuk pengesahan
                        </summary>
                        <div className="mt-3 flex flex-col gap-2">
                            <Label htmlFor="contract-requirements">
                                Sumber:jenis report[:account] · satu per baris
                            </Label>
                            <Textarea
                                id="contract-requirements"
                                key={advancedRevision}
                                spellCheck={false}
                                defaultValue={
                                    Array.isArray(
                                        definition.collection_requirements,
                                    )
                                        ? definition.collection_requirements.join(
                                              '\n',
                                          )
                                        : ''
                                }
                                onChange={(event) =>
                                    update(
                                        'collection_requirements',
                                        event.target.value
                                            .split('\n')
                                            .filter((line) => line !== ''),
                                    )
                                }
                            />
                        </div>
                    </details>
                </>
            )}
            <details ref={advancedDetails} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                    Definisi JSON lanjutan
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                    <Label htmlFor="evidence-definition">
                        Definisi kolom dan aturan terverifikasi
                    </Label>
                    <Textarea
                        id="evidence-definition"
                        className="min-h-52 font-mono text-xs"
                        value={value}
                        spellCheck={false}
                        aria-invalid={!!error}
                        aria-describedby={
                            error ? 'evidence-definition-error' : undefined
                        }
                        onChange={(event) => {
                            onChange(event.target.value);
                            setAdvancedRevision((current) => current + 1);
                        }}
                    />
                    {error && (
                        <p
                            id="evidence-definition-error"
                            className="text-sm text-destructive"
                        >
                            {error}
                        </p>
                    )}
                </div>
            </details>
        </div>
    );
}
