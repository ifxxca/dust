import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { trackingLabels } from '@/lib/jne-monitoring';
import InputError from '@/components/input-error';

export default function JneRefreshPolicyFields({
    value,
    onChange,
    error,
    activationAllowed,
    errors = {},
}: {
    value: string;
    onChange: (value: string) => void;
    error?: string;
    activationAllowed: boolean;
    errors?: Record<string, string | undefined>;
}) {
    let definition: Record<string, unknown> | null = null;
    const advancedDetails = useRef<HTMLDetailsElement>(null);
    try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            definition = parsed as Record<string, unknown>;
        }
    } catch {
        /* The advanced editor keeps invalid input available for correction. */
    }
    const validDefinition = definition !== null;
    useEffect(() => {
        if ((error || !validDefinition) && advancedDetails.current) {
            advancedDetails.current.open = true;
        }
    }, [error, validDefinition]);
    const update = (key: string, next: unknown) =>
        onChange(JSON.stringify({ ...definition, [key]: next }, null, 2));
    const numberField = (
        key: string,
        label: string,
        min: number,
        max: number,
    ) => (
        <div className="flex flex-col gap-2" key={key}>
            <Label htmlFor={'refresh-' + key}>{label}</Label>
            <Input
                id={'refresh-' + key}
                type="number"
                min={min}
                max={max}
                required={
                    [
                        'failure_backoff_minutes',
                        'max_failure_backoff_minutes',
                    ].includes(key) ||
                    (key === 'terminal_confirmations' &&
                        Array.isArray(definition?.terminal_statuses) &&
                        definition.terminal_statuses.length > 0) ||
                    (key === 'sla_interval_minutes' &&
                        !!definition?.sla_after_days)
                }
                aria-invalid={!!errors['definition.' + key]}
                aria-describedby={
                    errors['definition.' + key]
                        ? 'refresh-error-' + key
                        : undefined
                }
                value={
                    typeof definition?.[key] === 'number' ? definition[key] : ''
                }
                onChange={(event) =>
                    update(
                        key,
                        event.target.value === ''
                            ? null
                            : event.target.valueAsNumber,
                    )
                }
            />
            <InputError
                id={'refresh-error-' + key}
                message={errors['definition.' + key]}
            />
        </div>
    );
    const toggleList = (key: string, status: string, checked: boolean) => {
        const current = Array.isArray(definition?.[key])
            ? (definition[key] as string[])
            : [];
        update(
            key,
            checked
                ? [...current, status]
                : current.filter((item) => item !== status),
        );
    };
    const intervals =
        definition?.intervals && typeof definition.intervals === 'object'
            ? (definition.intervals as Record<string, number>)
            : {};
    return (
        <div className="flex flex-col gap-4">
            {definition && (
                <>
                    <Label className="flex min-h-10 items-center gap-2">
                        <input
                            type="checkbox"
                            disabled={
                                !activationAllowed &&
                                definition.enabled !== true
                            }
                            checked={definition.enabled === true}
                            onChange={(event) =>
                                update('enabled', event.target.checked)
                            }
                        />
                        Gunakan kebijakan terverifikasi
                    </Label>
                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-sm font-medium">
                            Interval per status · menit
                        </legend>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {Object.entries(trackingLabels).map(
                                ([status, label]) => (
                                    <div
                                        key={status}
                                        className="flex items-center justify-between gap-3"
                                    >
                                        <Label
                                            htmlFor={
                                                'refresh-interval-' + status
                                            }
                                        >
                                            {label}
                                        </Label>
                                        <Input
                                            id={'refresh-interval-' + status}
                                            aria-invalid={
                                                !!errors[
                                                    'definition.intervals.' +
                                                        status
                                                ]
                                            }
                                            aria-describedby={
                                                errors[
                                                    'definition.intervals.' +
                                                        status
                                                ]
                                                    ? 'refresh-interval-error-' +
                                                      status
                                                    : undefined
                                            }
                                            className="w-24"
                                            type="number"
                                            min={5}
                                            max={10080}
                                            placeholder="Default"
                                            value={intervals[status] ?? ''}
                                            onChange={(event) => {
                                                const next = { ...intervals };
                                                if (event.target.value === '')
                                                    delete next[status];
                                                else
                                                    next[status] =
                                                        event.target.valueAsNumber;
                                                update('intervals', next);
                                            }}
                                        />
                                        <InputError
                                            id={
                                                'refresh-interval-error-' +
                                                status
                                            }
                                            message={
                                                errors[
                                                    'definition.intervals.' +
                                                        status
                                                ]
                                            }
                                        />
                                    </div>
                                ),
                            )}
                        </div>
                    </fieldset>
                    <details className="rounded-lg border p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                            Status terminal & prioritas
                        </summary>
                        <div className="mt-3 flex flex-col gap-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr>
                                            <th className="text-left font-medium">
                                                Status
                                            </th>
                                            <th className="p-2 font-medium">
                                                Terminal
                                            </th>
                                            <th className="p-2 font-medium">
                                                Prioritas
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(trackingLabels).map(
                                            ([status, label]) => (
                                                <tr
                                                    key={status}
                                                    className="border-t"
                                                >
                                                    <th className="py-2 text-left font-normal">
                                                        {label}
                                                    </th>
                                                    {[
                                                        'terminal_statuses',
                                                        'priority_statuses',
                                                    ].map((key) => (
                                                        <td
                                                            key={key}
                                                            className="text-center"
                                                        >
                                                            <label className="inline-flex min-h-10 min-w-10 items-center justify-center">
                                                                <span className="sr-only">
                                                                    {(key ===
                                                                    'terminal_statuses'
                                                                        ? 'Terminal '
                                                                        : 'Prioritas ') +
                                                                        label}
                                                                </span>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={
                                                                        Array.isArray(
                                                                            definition[
                                                                                key
                                                                            ],
                                                                        ) &&
                                                                        definition[
                                                                            key
                                                                        ].includes(
                                                                            status,
                                                                        )
                                                                    }
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        toggleList(
                                                                            key,
                                                                            status,
                                                                            event
                                                                                .target
                                                                                .checked,
                                                                        )
                                                                    }
                                                                />
                                                            </label>
                                                        </td>
                                                    ))}
                                                </tr>
                                            ),
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {numberField(
                                'terminal_confirmations',
                                'Jumlah konfirmasi terminal',
                                2,
                                10,
                            )}
                        </div>
                    </details>
                    <details className="rounded-lg border p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                            SLA, jam sumber & retry
                        </summary>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            {numberField(
                                'sla_after_days',
                                'Ambang SLA · hari',
                                1,
                                366,
                            )}
                            {numberField(
                                'sla_interval_minutes',
                                'Interval SLA · menit',
                                5,
                                10080,
                            )}
                            {numberField(
                                'failure_backoff_minutes',
                                'Retry awal · menit',
                                5,
                                1440,
                            )}
                            {numberField(
                                'max_failure_backoff_minutes',
                                'Retry maksimum · menit',
                                5,
                                10080,
                            )}
                            <fieldset className="sm:col-span-2">
                                <legend className="mb-2 text-sm font-medium">
                                    Jam tersedia · Asia/Jakarta
                                </legend>
                                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                                    {Array.from({ length: 24 }, (_, hour) => (
                                        <label
                                            key={hour}
                                            className="flex min-h-10 items-center gap-2 rounded border px-2 text-sm"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={
                                                    Array.isArray(
                                                        definition.availability_hours,
                                                    ) &&
                                                    definition.availability_hours.includes(
                                                        hour,
                                                    )
                                                }
                                                onChange={(event) => {
                                                    const current =
                                                        Array.isArray(
                                                            definition.availability_hours,
                                                        )
                                                            ? (definition.availability_hours as number[])
                                                            : [];
                                                    update(
                                                        'availability_hours',
                                                        event.target.checked
                                                            ? [...current, hour]
                                                            : current.filter(
                                                                  (item) =>
                                                                      item !==
                                                                      hour,
                                                              ),
                                                    );
                                                }}
                                            />
                                            {String(hour).padStart(2, '0')}
                                        </label>
                                    ))}
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Kosong: tidak membatasi jam sumber.
                                </p>
                            </fieldset>
                        </div>
                    </details>
                </>
            )}
            <details ref={advancedDetails} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                    Definisi JSON lanjutan
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                    <Label htmlFor="refresh-definition">
                        Definisi kebijakan
                    </Label>
                    <Textarea
                        id="refresh-definition"
                        className="min-h-64 font-mono text-xs"
                        value={value}
                        spellCheck={false}
                        aria-invalid={!!error}
                        aria-describedby={
                            error ? 'refresh-definition-error' : undefined
                        }
                        onChange={(event) => onChange(event.target.value)}
                    />
                    {error && (
                        <p
                            id="refresh-definition-error"
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
