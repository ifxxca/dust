<?php

use App\Actions\Handover\CompareQuantities;

test('comparison detects differences in each category even when totals match', function () {
    $action = new CompareQuantities;
    $pickup = ['manual_hybrid' => 3, 'cashless_hybrid' => 2, 'css_orion' => 1];
    expect($action->handle($pickup, $pickup)['status'])->toBe('VERIFIED');
    $result = $action->handle($pickup, ['manual_hybrid' => 2, 'cashless_hybrid' => 3, 'css_orion' => 1]);
    expect($result['status'])->toBe('DISCREPANCY')->and($result['differences'])->toBe(['manual_hybrid' => -1, 'cashless_hybrid' => 1, 'css_orion' => 0]);
});
