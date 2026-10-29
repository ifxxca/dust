import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

export default function SignaturePad({
    value,
    onChange,
    disabled,
    onDrawingStart,
}: {
    value: string | null;
    onChange: (value: string | null) => void;
    disabled?: boolean;
    onDrawingStart?: () => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const ink = useRef(false);
    const emitted = useRef<string | null>(null);
    const bounds = useRef<DOMRect | null>(null);
    useEffect(() => {
        const surface = canvas.current;
        const context = surface?.getContext('2d');
        if (!surface || !context) return;
        if (value === emitted.current) return;
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
        if (!drawing.current) return;
        drawing.current = false;
        if (ink.current && canvas.current) {
            emitted.current = canvas.current.toDataURL('image/png');
            onChange(emitted.current);
        } else {
            onChange(value);
        }
    };
    return (
        <div className="flex flex-col gap-3">
            <canvas
                ref={canvas}
                width={600}
                height={220}
                aria-label="Area tanda tangan customer"
                className="h-40 w-full touch-none rounded-lg border bg-white"
                style={{ touchAction: 'none', userSelect: 'none' }}
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => {
                    if (disabled) return;
                    event.preventDefault();
                    const context = event.currentTarget.getContext('2d');
                    if (!context) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const rect = event.currentTarget.getBoundingClientRect();
                    bounds.current = rect;
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
                    onDrawingStart?.();
                }}
                onPointerMove={(event) => {
                    if (!drawing.current || disabled) return;
                    const rect = bounds.current;
                    const context = event.currentTarget.getContext('2d');
                    if (!rect || !context) return;
                    const x = ((event.clientX - rect.left) * 600) / rect.width;
                    const y = ((event.clientY - rect.top) * 220) / rect.height;
                    context.lineTo(x, y);
                    context.stroke();
                    context.beginPath();
                    context.moveTo(x, y);
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
                onClick={() => {
                    emitted.current = null;
                    canvas.current?.getContext('2d')?.clearRect(0, 0, 600, 220);
                    onChange(null);
                }}
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
