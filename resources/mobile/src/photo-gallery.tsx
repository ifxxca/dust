import { useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@/components/ui/dialog';
import { evidencePreview, type LocalEvidence } from './local-store';
import { OperationalFeedback } from './feedback';
import type { Session } from './types';

export default function PhotoGallery({
    session,
    photos,
    disabled,
    onCapture,
    onDelete,
    onBackChange,
}: {
    session: Session;
    photos: LocalEvidence[];
    disabled: boolean;
    onCapture: (source: 'camera' | 'gallery') => Promise<void>;
    onDelete: (photo: LocalEvidence) => Promise<void>;
    onBackChange: (close: (() => void) | null) => void;
}) {
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<LocalEvidence | null>(null);
    const [preview, setPreview] = useState<LocalEvidence | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const back = () => {
            if (deleting) return;
            setAdding(false);
            setRemoving(null);
            setPreview(null);
        };
        onBackChange(adding || removing || preview ? back : null);
        return () => onBackChange(null);
    }, [adding, removing, preview, deleting, onBackChange]);
    return (
        <>
            <div className="proof-photo-grid" aria-label="Foto bukti opsional">
                {photos.map((photo, index) => (
                    <div key={photo.name} className="proof-photo-tile">
                        <button
                            type="button"
                            className="proof-photo-open"
                            aria-label={`Preview Foto ${index + 1}`}
                            onClick={() => setPreview(photo)}
                        >
                            <PhotoImage
                                session={session}
                                photo={photo}
                                size="thumbnail"
                                alt={`Foto bukti ${index + 1}`}
                            />
                            <span className="proof-photo-number">
                                Foto {index + 1}
                            </span>
                        </button>
                        <button
                            type="button"
                            className="proof-photo-delete"
                            aria-label={`Hapus Foto ${index + 1}`}
                            disabled={disabled}
                            onClick={() => {
                                setError('');
                                setRemoving(photo);
                            }}
                        >
                            <Trash2 size={18} aria-hidden="true" />
                        </button>
                    </div>
                ))}
                {photos.length < 4 && (
                    <button
                        type="button"
                        className="proof-photo-add"
                        aria-label="Tambah Foto"
                        disabled={disabled}
                        onClick={() => setAdding(true)}
                    >
                        <ImagePlus size={26} aria-hidden="true" />
                        <span>Tambah Foto</span>
                        <small>{photos.length}/4 · opsional</small>
                    </button>
                )}
            </div>
            <Dialog open={adding} onOpenChange={setAdding}>
                <DialogContent className="mobile-dialog">
                    <DialogTitle>Tambah Foto</DialogTitle>
                    <DialogDescription>
                        Opsional · maksimal 4 foto. JPEG, PNG, atau WebP,
                        masing-masing maksimal 5 MiB.
                    </DialogDescription>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={disabled}
                            onClick={() => {
                                setAdding(false);
                                void onCapture('camera');
                            }}
                        >
                            Ambil Foto
                        </Button>
                        <Button
                            variant="outline"
                            disabled={disabled}
                            onClick={() => {
                                setAdding(false);
                                void onCapture('gallery');
                            }}
                        >
                            Pilih dari Galeri
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog
                open={!!removing}
                onOpenChange={(open) => {
                    if (!open && !deleting) setRemoving(null);
                }}
            >
                <DialogContent
                    className="mobile-dialog"
                    onEscapeKeyDown={(event) => {
                        if (deleting) event.preventDefault();
                    }}
                    onInteractOutside={(event) => {
                        if (deleting) event.preventDefault();
                    }}
                >
                    <DialogTitle>Hapus foto dari draft?</DialogTitle>
                    <DialogDescription>
                        Foto ini akan dikeluarkan dari bukti pickup. File sumber
                        di galeri perangkat tetap ada.
                    </DialogDescription>
                    {error && (
                        <OperationalFeedback title={error} tone="error" />
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={deleting}
                            onClick={() => setRemoving(null)}
                        >
                            Pertahankan Foto
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={disabled || deleting}
                            onClick={() => {
                                if (!removing || deleting) return;
                                setDeleting(true);
                                void onDelete(removing)
                                    .then(() => setRemoving(null))
                                    .catch(() =>
                                        setError(
                                            'Foto belum dapat dihapus. Coba lagi; draft tetap disimpan.',
                                        ),
                                    )
                                    .finally(() => setDeleting(false));
                            }}
                        >
                            {deleting ? 'Menghapus…' : 'Ya, Hapus Foto'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog
                open={!!preview}
                onOpenChange={(open) => {
                    if (!open) setPreview(null);
                }}
            >
                <DialogContent className="mobile-photo-viewer">
                    <DialogTitle>
                        Foto{' '}
                        {photos.findIndex(
                            (photo) => photo.name === preview?.name,
                        ) + 1}{' '}
                        dari {photos.length}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Pratinjau bukti pickup. Ukuran gambar disesuaikan tanpa
                        memotong isinya.
                    </DialogDescription>
                    <div className="proof-photo-fullscreen">
                        {preview && (
                            <PhotoImage
                                key={preview.name}
                                session={session}
                                photo={preview}
                                size="fullscreen"
                                alt="Preview foto draft"
                            />
                        )}
                    </div>
                    <div>
                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={() => setPreview(null)}
                        >
                            Tutup Preview
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function PhotoImage({
    session,
    photo,
    size,
    alt,
}: {
    session: Session;
    photo: LocalEvidence;
    size: 'thumbnail' | 'fullscreen';
    alt: string;
}) {
    const [url, setUrl] = useState('');
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let disposed = false;
        setUrl('');
        setFailed(false);
        void evidencePreview(session, photo, size)
            .then((image) => {
                if (!disposed) setUrl(image);
            })
            .catch(() => {
                if (!disposed) setFailed(true);
            });
        return () => {
            disposed = true;
        };
    }, [
        session.token,
        session.environment,
        session.user.id,
        photo.name,
        photo.sha256,
        size,
        attempt,
    ]);
    if (failed)
        return (
            <span className="proof-photo-placeholder" role="status">
                <span>Pratinjau belum tersedia.</span>
                <small>Bukti asli tetap tersimpan.</small>
                {size === 'fullscreen' && (
                    <Button
                        variant="secondary"
                        onClick={() => setAttempt((value) => value + 1)}
                    >
                        Coba Buka Lagi
                    </Button>
                )}
            </span>
        );
    if (!url)
        return (
            <span className="proof-photo-placeholder" role="status">
                <LoaderCircle
                    size={24}
                    className="animate-spin"
                    aria-hidden="true"
                />
                <span>Membuka foto…</span>
            </span>
        );
    return (
        <img
            src={url}
            alt={alt}
            decoding="async"
            onError={() => setFailed(true)}
        />
    );
}
