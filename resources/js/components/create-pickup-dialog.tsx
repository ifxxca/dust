import { useState } from 'react';
import CreatePickup from '@/components/create-pickup';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export default function CreatePickupDialog({
    open,
    onOpenChange,
    timezone,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    timezone: string;
    onCreated: () => void;
}) {
    const [busy, setBusy] = useState(false);
    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!busy) onOpenChange(value);
            }}
        >
            <DialogContent
                className="max-h-[90dvh] overflow-y-auto bg-card sm:max-w-xl"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Buat Pickup On-Demand</DialogTitle>
                    <DialogDescription>
                        Pilih customer, periksa alamat pickup, dan tentukan
                        jadwal kunjungan.
                    </DialogDescription>
                </DialogHeader>
                <CreatePickup
                    timezone={timezone}
                    onCancel={() => onOpenChange(false)}
                    onBusyChange={setBusy}
                    onCreated={() => {
                        onOpenChange(false);
                        onCreated();
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
