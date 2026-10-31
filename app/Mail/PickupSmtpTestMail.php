<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PickupSmtpTestMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @param list<array{awb: string, category: string}> $awbs */
    public function __construct(
        public string $customerName,
        public int $manual,
        public int $cashless,
        public string $reference,
        public string $pickupTime,
        public array $awbs,
    ) {}

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '[UJI COBA] Pickup '.$this->customerName.' — '.($this->manual + $this->cashless).' paket',
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'mail.pickup-smtp-test',
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        return [Attachment::fromData(fn (): string => $this->csv(), 'resi-contoh-'.$this->reference.'.csv')->withMime('text/csv')];
    }

    public function csv(): string
    {
        $stream = fopen('php://temp', 'w+');
        $customer = preg_match('/^[=+\-@\t\r]/u', $this->customerName) ? "'".$this->customerName : $this->customerName;
        fwrite($stream, "\xEF\xBB\xBF");
        fputcsv($stream, ['Resi contoh', 'Kategori', 'Customer', 'Referensi pickup', 'Waktu pickup (WIB)', 'Jenis data'], ',', '"', '');
        foreach ($this->awbs as $row) {
            fputcsv($stream, [$row['awb'], $row['category'], $customer, $this->reference, $this->pickupTime, 'UJI COBA - BUKAN RESI AKTUAL'], ',', '"', '');
        }
        rewind($stream);
        $csv = stream_get_contents($stream);
        fclose($stream);

        return $csv;
    }
}
