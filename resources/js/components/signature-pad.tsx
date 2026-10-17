import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

export default function SignaturePad({
    value,
    onChange,
    disabled,
}: {
    value: string | null;
    onChange: (value: string | null) => void;
    disabled?: boolean;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const ink = useRef(false);
    useEffect(() => {
        const surface = canvas.current;
        const context = surface?.getContext('2d');
        if (!surface || !context) return;
        context.clearRect(0, 0, surface.width, surface.height);
        if (value) {
            const image = new Image();
            image.onload = () => context.drawImage(image, 0, 0);
            image.src = value;
            return () => {
                image.onload = null;
            };
        }
    }, [value]);
    const finish = () => {
        if (drawing.current && ink.current && canvas.current)
            onChange(canvas.current.toDataURL('image/png'));
        drawing.current = false;
    };
    return (
        <div className="space-y-3">
            <canvas
                ref={canvas}
                width={600}
                height={220}
                aria-label="Area tanda tangan customer"
                className="h-40 w-full touch-none rounded-lg border bg-white"
                onPointerDown={(event) => {
                    if (disabled) return;
                    const context = event.currentTarget.getContext('2d');
                    if (!context) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const rect = event.currentTarget.getBoundingClientRect();
                    context.strokeStyle = '#111';
                    context.lineWidth = 3;
                    context.lineCap = 'round';
                    context.beginPath();
                    context.moveTo(
                        ((event.clientX - rect.left) * 600) / rect.width,
                        ((event.clientY - rect.top) * 220) / rect.height,
                    );
                    drawing.current = true;
                    ink.current = false;
                }}
                onPointerMove={(event) => {
                    if (!drawing.current || disabled) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const context = event.currentTarget.getContext('2d');
                    context?.lineTo(
                        ((event.clientX - rect.left) * 600) / rect.width,
                        ((event.clientY - rect.top) * 220) / rect.height,
                    );
                    context?.stroke();
                    ink.current = true;
                }}
                onPointerUp={finish}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
            />
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || !value}
                onClick={() => onChange(null)}
            >
                Hapus / Ganti Tanda Tangan
            </Button>
            <p className="text-xs text-muted-foreground">
                Minta customer/sender menandatangani area putih. Tanda tangan
                wajib untuk pickup berhasil.
            </p>
        </div>
    );
}
