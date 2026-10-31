<?php

namespace App\Console\Commands;

use App\Mail\PickupSmtpTestMail;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;

#[Signature('pickup:mail-test {recipient : Explicit test recipient email} {--customer=Irfan} {--manual=20} {--cashless=30} {--send : Send one sample email using SMTP; otherwise only save a private preview}')]
#[Description('Preview or send a labelled pickup and AWB sample without creating operational data')]
class SendPickupTestEmail extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $validator = Validator::make([
            'recipient' => $this->argument('recipient'),
            'customer' => $this->option('customer'),
            'manual' => $this->option('manual'),
            'cashless' => $this->option('cashless'),
        ], [
            'recipient' => ['required', 'email:rfc', 'max:254'],
            'customer' => ['required', 'string', 'max:100', 'not_regex:/[\r\n]/'],
            'manual' => ['required', 'integer', 'min:0', 'max:500'],
            'cashless' => ['required', 'integer', 'min:0', 'max:500'],
        ]);
        if ($validator->fails()) {
            $this->error('Penerima, nama customer, atau jumlah contoh tidak valid (0–500 per kategori).');

            return self::FAILURE;
        }
        $values = $validator->validated();
        $manual = (int) $values['manual'];
        $cashless = (int) $values['cashless'];
        if ($manual + $cashless === 0) {
            $this->error('Minimal satu resi contoh diperlukan.');

            return self::FAILURE;
        }
        $reference = 'TEST-'.Str::uuid();
        $awbs = [];
        foreach (['Manual Hybrid' => $manual, 'Cashless Hybrid' => $cashless] as $category => $quantity) {
            $prefix = $category === 'Manual Hybrid' ? 'TEST-MANUAL-' : 'TEST-CASHLESS-';
            for ($number = 1; $number <= $quantity; $number++) {
                $awbs[] = ['awb' => $prefix.str_pad((string) $number, 4, '0', STR_PAD_LEFT), 'category' => $category];
            }
        }
        $mail = new PickupSmtpTestMail($values['customer'], $manual, $cashless, $reference, now()->timezone(config('pickup.timezone'))->format('d/m/Y H:i'), $awbs);
        $base = 'mail-tests/'.$reference;
        $disk = Storage::disk('local');
        if (! $disk->put($base.'/email.html', $mail->render()) || ! $disk->put($base.'/resi-contoh.csv', $mail->csv())) {
            $this->error('Preview email tidak dapat disimpan. Email belum dikirim.');

            return self::FAILURE;
        }
        $this->line('preview='.$disk->path($base.'/email.html'));
        $this->line('csv='.$disk->path($base.'/resi-contoh.csv'));
        if (! $this->option('send')) {
            $this->info('PREVIEW_ONLY — belum ada email dikirim. Gunakan --send untuk uji SMTP.');

            return self::SUCCESS;
        }
        if (config('mail.default') !== 'smtp' || ! config('mail.mailers.smtp.host') || ! config('mail.mailers.smtp.username') || ! config('mail.mailers.smtp.password')) {
            $this->error('SMTP_NOT_CONFIGURED — atur mailer SMTP, host, username, dan password.');

            return self::FAILURE;
        }
        try {
            $sent = Mail::mailer('smtp')->to($values['recipient'])->send($mail);
        } catch (Throwable $exception) {
            $message = strtolower($exception->getMessage());
            $reason = match (true) {
                str_contains($message, 'authenticate'), str_contains($message, 'authentication'), str_contains($message, '535') => 'SMTP_AUTHENTICATION_FAILED',
                str_contains($message, 'certificate'), str_contains($message, 'ssl operation') => 'SMTP_TLS_FAILED',
                str_contains($message, 'connection'), str_contains($message, 'timed out'), str_contains($message, 'getaddrinfo') => 'SMTP_CONNECTION_FAILED',
                default => 'SMTP_RESULT_UNKNOWN',
            };
            $this->error($reason.' — pengiriman belum terkonfirmasi. Periksa konfigurasi/provider sebelum mencoba ulang.');

            return self::FAILURE;
        }
        if ($sent === null) {
            $this->error('SMTP_RESULT_UNKNOWN — provider tidak mengembalikan penerimaan pesan.');

            return self::FAILURE;
        }
        $this->info('SMTP_ACCEPTED — '.$values['recipient'].'; Manual '.$manual.', Cashless '.$cashless.', total '.count($awbs).'.');
        $this->line('message_id='.$sent->getMessageId());
        $this->line('Diterima server SMTP; penempatan di inbox belum terkonfirmasi.');

        return self::SUCCESS;
    }
}
