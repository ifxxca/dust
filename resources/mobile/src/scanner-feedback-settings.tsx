import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import SecondaryDisclosure from '@/components/secondary-disclosure';
import {
    saveScannerFeedbackSettings,
    scannerFeedbackSettings,
    testScanSound,
    testScanVibration,
    type ScannerFeedbackSettings as Settings,
} from '@/lib/scan-feedback';

export default function ScannerFeedbackSettings() {
    const [settings, setSettings] = useState(scannerFeedbackSettings);
    const [notice, setNotice] = useState('');
    function change(key: keyof Settings, checked: boolean) {
        const next = { ...settings, [key]: checked };
        try {
            saveScannerFeedbackSettings(next);
            setSettings(next);
            setNotice('Pengaturan pemindai tersimpan.');
        } catch {
            setNotice('Pengaturan belum tersimpan. Coba lagi.');
        }
    }
    return (
        <SecondaryDisclosure title="Umpan balik pemindai">
            <fieldset className="flex flex-col gap-1">
                <legend className="sr-only">Suara dan getaran pemindai</legend>
                {(
                    [
                        ['successSound', 'Suara berhasil'],
                        ['failureSound', 'Suara gagal dan duplikat'],
                        ['vibration', 'Getaran'],
                    ] as const
                ).map(([key, label]) => (
                    <Label key={key} className="min-h-12 gap-3">
                        <Checkbox
                            checked={settings[key]}
                            onCheckedChange={(checked) =>
                                change(key, checked === true)
                            }
                        />
                        {label}
                    </Label>
                ))}
            </fieldset>
            <div className="my-2 flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="min-h-12"
                    disabled={!settings.successSound}
                    onClick={() => {
                        testScanSound('success');
                        setNotice(
                            'Tes suara berhasil diputar jika diizinkan perangkat.',
                        );
                    }}
                >
                    Tes suara berhasil
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="min-h-12"
                    disabled={!settings.failureSound}
                    onClick={() => {
                        testScanSound('error');
                        setNotice(
                            'Tes suara gagal diputar jika diizinkan perangkat.',
                        );
                    }}
                >
                    Tes suara gagal
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="min-h-12"
                    disabled={!settings.vibration}
                    onClick={() => {
                        testScanVibration();
                        setNotice(
                            'Tes getaran dikirim. Jika tidak terasa, periksa dukungan dan pengaturan getaran perangkat.',
                        );
                    }}
                >
                    Tes getaran
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">
                Gunakan volume media dan periksa keluaran Bluetooth. Mode
                senyap, Jangan Ganggu, izin, dan kemampuan perangkat dapat
                membatasi suara atau getaran. Konfirmasi visual tetap tersedia.
            </p>
            <p role="status" className="mt-2 text-sm">
                {notice}
            </p>
        </SecondaryDisclosure>
    );
}
