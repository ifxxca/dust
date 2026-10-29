<?php

namespace App\Mail;

use App\Models\PickupAwbManifest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Queue\SerializesModels;

class PickupAwbManifestMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * Create a new message instance.
     */
    public function __construct(public PickupAwbManifest $manifest, public string $submissionKey) {}

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Daftar resi pickup '.$this->manifest->snapshot['reference'].' - versi '.$this->manifest->revision,
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'mail.pickup-awb-manifest',
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        return [
            Attachment::fromStorageDisk('local', $this->manifest->xlsx_path)->as('resi-'.$this->manifest->snapshot['reference'].'-v'.$this->manifest->revision.'.xlsx')->withMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            Attachment::fromStorageDisk('local', $this->manifest->pdf_path)->as('resi-'.$this->manifest->snapshot['reference'].'-v'.$this->manifest->revision.'.pdf')->withMime('application/pdf'),
        ];
    }

    public function headers(): Headers
    {
        return new Headers(text: ['X-Pickup-Delivery-Key' => $this->submissionKey]);
    }
}
