<?php

use App\Mail\PickupSmtpTestMail;
use Illuminate\Mail\PendingMail;
use Illuminate\Mail\SentMessage;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mailer\SentMessage as SymfonySentMessage;
use Symfony\Component\Mime\Email;

test('preview writes 20 manual and 30 cashless examples without sending or creating operational records', function () {
    Mail::fake();
    Storage::fake('local');

    $this->artisan('pickup:mail-test', ['recipient' => 'receiver@example.test'])->expectsOutputToContain('PREVIEW_ONLY')->assertSuccessful();

    Mail::assertNothingOutgoing();
    $csvPath = collect(Storage::disk('local')->allFiles('mail-tests'))->first(fn (string $path): bool => str_ends_with($path, '.csv'));
    $rows = array_map(fn (string $line): array => str_getcsv($line, ',', '"', ''), array_filter(explode("\n", trim(Storage::disk('local')->get($csvPath)))));
    expect($rows)->toHaveCount(51);
    expect(array_count_values(array_column(array_slice($rows, 1), 1)))->toBe(['Manual Hybrid' => 20, 'Cashless Hybrid' => 30]);
    expect($rows[1][0])->toBe('TEST-MANUAL-0001');
    expect($rows[50][0])->toBe('TEST-CASHLESS-0030');
    $this->assertDatabaseCount('pickup_tasks', 0);
    $this->assertDatabaseCount('jne_shipments', 0);
    $this->assertDatabaseCount('customers', 0);
});

test('sample content is labelled as fictitious and attaches the same CSV it previews', function () {
    $mail = new PickupSmtpTestMail('Irfan <script>alert(1)</script>', 1, 1, 'TEST-DEMO', '31/10/2026 17:00', [
        ['awb' => 'TEST-MANUAL-0001', 'category' => 'Manual Hybrid'],
        ['awb' => 'TEST-CASHLESS-0001', 'category' => 'Cashless Hybrid'],
    ]);

    $mail->assertHasSubject('[UJI COBA] Pickup Irfan <script>alert(1)</script> — 2 paket');
    $mail->assertSeeInHtml('UJI COBA EMAIL');
    $mail->assertSeeInHtml('Irfan &lt;script&gt;alert(1)&lt;/script&gt;', false);
    $mail->assertDontSeeInHtml('<script>', false);
    $mail->assertSeeInHtml('TEST-CASHLESS-0001');
    $mail->assertHasAttachedData($mail->csv(), 'resi-contoh-TEST-DEMO.csv', ['mime' => 'text/csv']);
});

test('CSV customer values cannot become spreadsheet formulas', function () {
    $mail = new PickupSmtpTestMail('=1+1', 1, 0, 'TEST-DEMO', '31/10/2026 17:00', [['awb' => 'TEST-MANUAL-0001', 'category' => 'Manual Hybrid']]);

    expect($mail->csv())->toContain("'=1+1");
});

test('invalid sample input sends nothing', function (array $options) {
    Mail::fake();
    Storage::fake('local');

    $this->artisan('pickup:mail-test', ['recipient' => 'receiver@example.test', '--send' => true, ...$options])->assertFailed();

    Mail::assertNothingOutgoing();
    expect(Storage::disk('local')->allFiles())->toBe([]);
})->with([
    'invalid email' => [['recipient' => 'invalid-address']],
    'negative quantity' => [['--manual' => -1]],
    'empty shipment' => [['--manual' => 0, '--cashless' => 0]],
    'oversized sample' => [['--cashless' => 501]],
    'header injection' => [['--customer' => "Irfan\r\nBcc:other@example.test"]],
]);

test('sample refuses log transport instead of claiming an email was sent', function () {
    Mail::fake();
    Storage::fake('local');
    config(['mail.default' => 'log']);

    $this->artisan('pickup:mail-test', ['recipient' => 'receiver@example.test', '--send' => true])->expectsOutputToContain('SMTP_NOT_CONFIGURED')->assertFailed();

    Mail::assertNothingOutgoing();
});

test('sample sends exactly once to the explicit recipient and reports provider acceptance', function () {
    Storage::fake('local');
    config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => 'smtp.example.test', 'mail.mailers.smtp.username' => 'sender@example.test', 'mail.mailers.smtp.password' => 'test-only']);
    $email = (new Email)->from('sender@example.test')->to('receiver@example.test')->text('Sample');
    $sent = new SentMessage(new SymfonySentMessage($email, Envelope::create($email)));
    $renderer = app('mailer');
    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')->once()->with(Mockery::on(fn (PickupSmtpTestMail $mail): bool => $mail->manual === 20 && $mail->cashless === 30 && count($mail->awbs) === 50))->andReturn($sent);
    Mail::shouldReceive('mailer')->once()->with('smtp')->andReturnSelf();
    Mail::shouldReceive('mailer')->withNoArgs()->andReturn($renderer);
    Mail::shouldReceive('to')->once()->with('receiver@example.test')->andReturn($pending);

    $this->artisan('pickup:mail-test', ['recipient' => 'receiver@example.test', '--send' => true])->expectsOutputToContain('SMTP_ACCEPTED')->expectsOutputToContain('message_id=')->assertSuccessful();

    $this->assertDatabaseCount('pickup_tasks', 0);
});

test('SMTP rejection is reported without leaking server responses or retrying the message', function () {
    Storage::fake('local');
    config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => 'smtp.example.test', 'mail.mailers.smtp.username' => 'sender@example.test', 'mail.mailers.smtp.password' => 'test-only']);
    $renderer = app('mailer');
    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')->once()->andThrow(new RuntimeException('535 Authentication failed; sensitive-provider-response'));
    Mail::shouldReceive('mailer')->once()->with('smtp')->andReturnSelf();
    Mail::shouldReceive('mailer')->withNoArgs()->andReturn($renderer);
    Mail::shouldReceive('to')->once()->with('receiver@example.test')->andReturn($pending);

    $this->artisan('pickup:mail-test', ['recipient' => 'receiver@example.test', '--send' => true])->expectsOutputToContain('SMTP_AUTHENTICATION_FAILED')->doesntExpectOutputToContain('sensitive-provider-response')->doesntExpectOutputToContain('SMTP_ACCEPTED')->assertFailed();
});
