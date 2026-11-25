<?php

use App\Actions\Pickup\ExtractPickupAwbDetails;
use App\Models\JneReportAwb;

test('recap amount uses verified category and COD flag instead of treating credit as cashless', function (?string $category, ?string $cod, ?string $payment, ?string $amount, ?int $expected) {
    $source = JneReportAwb::factory()->make(['amount_cents' => null, 'raw_data' => ['COD_FLAG' => $cod, 'PAYMENT_TYPE' => $payment, 'AMOUNT' => $amount]]);

    $details = app(ExtractPickupAwbDetails::class)->handle($source, $category);

    expect($details['amount_cents'])->toBe($expected);
})->with([
    'manual non COD' => ['manual_hybrid', 'N', 'CASH', '18500.50', 1850050],
    'cashless non COD' => ['cashless_hybrid', 'N', 'CREDIT', '18500', 0],
    'cashless COD' => ['cashless_hybrid', 'Y', 'CREDIT', '18500', 0],
    'cashless missing flag' => ['cashless_hybrid', null, null, null, 0],
    'manual COD' => ['manual_hybrid', 'Y', 'CASH', '18500', 0],
    'orion COD' => ['css_orion', 'Y', 'CREDIT', '18500', 0],
    'credit orion is not cashless' => ['css_orion', 'N', 'CREDIT', '56000', 5600000],
    'unknown COD held' => ['manual_hybrid', null, 'CASH', '18500', null],
    'unknown category held' => [null, 'N', 'CREDIT', '18500', null],
    'missing amount held' => ['manual_hybrid', 'N', 'CASH', null, null],
    'malformed amount held' => ['manual_hybrid', 'N', 'CASH', 'invalid', null],
    'real zero retained' => ['manual_hybrid', 'N', 'CASH', '0', 0],
]);

test('district is resolved only from an exact unambiguous tariff code in the supplied reference', function (string $destination, ?string $district, string $status) {
    $source = JneReportAwb::factory()->make(['destination' => $destination]);

    $details = app(ExtractPickupAwbDetails::class)->handle($source, 'manual_hybrid');

    expect($details['consignee_district'])->toBe($district);
    expect($details['district_status'])->toBe($status);
})->with([
    'unique code' => ['DJJ21506', 'BONGGO TIMUR', 'MATCHED'],
    'normalized exact code' => [' djj21506 ', 'BONGGO TIMUR', 'MATCHED'],
    'conflicting districts' => ['MJK10022', null, 'AMBIGUOUS'],
    'unknown code' => ['NO_SUCH_DEST', null, 'UNKNOWN'],
    'prefix does not match' => ['DJJ215', null, 'UNKNOWN'],
]);

test('raw destination and amount support report rows that have not had metrics projected', function () {
    $source = JneReportAwb::factory()->make(['destination' => null, 'amount_cents' => null,
        'raw_data' => ['DEST' => 'DJJ21506', 'AMOUNT' => '12000', 'COD_FLAG' => 'N']]);

    $details = app(ExtractPickupAwbDetails::class)->handle($source, 'manual_hybrid');

    expect($details['consignee_district'])->toBe('BONGGO TIMUR');
    expect($details['amount_cents'])->toBe(1200000);
});
