<?php

use App\Models\JneReportAwb;
use App\Models\JneShipment;

require __DIR__.'/ui-ux-browser.php';

foreach (JneReportAwb::orderBy('id')->get() as $index => $source) {
    $source->update(['entry_at' => now('Asia/Jakarta')->setTime(12, 0)->utc(),
        'service' => ['REG23', 'YES23', 'CTC23', null][$index % 4],
        'raw_data' => ['ZONE_USER_ENTRI' => $index % 2 ? 'CGK945 JAKARTA PUMAN GRUP KEMBANGAN' : 'CGK537 JAKARTA AGEN PURI MANSION',
            'IREG_CODE' => $index % 2 ? '0' : 'R1', 'RECEIVED/REASON' => $index % 2 ? 'CONSIGNEE REFUSE TO RECEIVE SHIPMENT' : 'INCOMPLETE ADDRESS', 'SLA' => '-1'],
    ]);
}
JneShipment::orderBy('id')->limit(1)->update(['tracking_status' => 'RETURNED']);
echo PHP_EOL.'Performance fixture: exact source outlet labels, return/exception evidence, raw service codes.'.PHP_EOL;
