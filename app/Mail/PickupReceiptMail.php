<?php

namespace App\Mail;

use App\Models\PickupRecord;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PickupReceiptMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @param array<string, mixed> $values */
    public function __construct(public PickupRecord $record, public array $values, public int $revision) {}

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Receipt Pickup #'.$this->record->pickup_task_id.' — versi '.$this->revision,
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'mail.pickup-receipt',
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        return $this->record->attachments->map(fn ($file) => Attachment::fromStorageDisk('local', $file->path)->as($file->kind.'-'.$file->id.'.'.pathinfo($file->path, PATHINFO_EXTENSION))->withMime($file->mime_type))->all();
    }
}
