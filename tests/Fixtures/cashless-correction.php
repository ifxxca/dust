<?php

use App\Models\CashlessEntryBatch;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;

ob_start();
require __DIR__.'/ui-ux-browser.php';
ob_end_clean();
$task = PickupTask::findOrFail($ids['proof']);
$task->proof()->update(['cashless_hybrid' => 5]);
foreach ([1440, 390] as $width) {
    $batch = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'created_by' => $staff->id,
        'source' => 'nuralamt', 'status' => 'PARTIAL', 'ho_number' => 'HO-666-BROWSER-'.$width, 'approved_at' => now()]);
    for ($index = 0; $index < 5; $index++) {
        $awb = $index === 4 ? 'WRONGSKU'.$width : 'CMGOOD'.$width.$index;
        $record = PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id,
            'created_by' => $staff->id, 'awb' => $awb, 'raw_awb' => $awb, 'original_awb' => $awb]);
        $batch->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $awb, 'status' => $index === 4 ? 'NOT_FOUND' : 'ACCEPTED',
            'message' => $index === 4 ? 'Connote '.$awb.' tidak ditemukan.' : 'Data connote berhasil disimpan']);
    }
    $ids['cashless_'.$width] = $batch->id;
}
file_put_contents($auditDb.'.ids.json', json_encode($ids, JSON_THROW_ON_ERROR));
echo json_encode(['fixture' => 'isolated cashless corrections', 'ids' => $ids], JSON_THROW_ON_ERROR);
