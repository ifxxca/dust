import { useState } from 'react';
import { Building2 } from 'lucide-react';
import CustomerForm, { type CustomerDetails } from '@/components/customer-form';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export default function CustomerDialog({
    open,
    customer = null,
    onOpenChange,
    onSaved,
}: {
    open: boolean;
    customer?: CustomerDetails | null;
    onOpenChange: (open: boolean) => void;
    onSaved: (customer: CustomerDetails) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const changeOpen = (value: boolean) => {
        if (busy) return;
        if (
            !value &&
            dirty &&
            !window.confirm(
                'Perubahan customer belum disimpan. Buang perubahan?',
            )
        ) {
            return;
        }
        onOpenChange(value);
    };
    return (
        <Dialog open={open} onOpenChange={changeOpen}>
            <DialogContent
                className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
                onInteractOutside={(event) => event.preventDefault()}
                onEscapeKeyDown={(event) => {
                    if (busy) event.preventDefault();
                }}
            >
                <DialogHeader className="shrink-0 border-b px-6 py-5 text-left">
                    <div className="mb-1 flex size-10 items-center justify-center rounded-lg border bg-muted/40">
                        <Building2 className="size-5 text-muted-foreground" />
                    </div>
                    <DialogTitle>
                        {customer ? 'Edit Customer' : 'Tambah Customer'}
                    </DialogTitle>
                    <DialogDescription>
                        {customer
                            ? 'Perbarui informasi dan status customer. Data pickup sebelumnya tetap tersimpan.'
                            : 'Lengkapi identitas, kontak, dan alamat customer untuk kebutuhan pickup.'}
                    </DialogDescription>
                </DialogHeader>
                <CustomerForm
                    key={customer?.id ?? 'new'}
                    customer={customer}
                    inDialog
                    onProcessingChange={setBusy}
                    onDirtyChange={setDirty}
                    onCancel={() => changeOpen(false)}
                    onSaved={onSaved}
                />
            </DialogContent>
        </Dialog>
    );
}
