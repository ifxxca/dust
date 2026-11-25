<?php

use App\Models\PickupRecord;
use App\Models\PickupTask;

ob_start();
require __DIR__.'/ui-ux-browser.php';
ob_end_clean();

foreach ([$staff, $retail] as $index => $operator) {
    $task = PickupTask::factory()->create(['reference' => 'MOBILE-HANDOVER-'.($index + 1), 'status' => 'PICKED_UP', 'assigned_staff_id' => $operator->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $operator->id, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
}

echo json_encode(['fixture' => 'isolated mobile handover', 'candidates' => 2], JSON_THROW_ON_ERROR);
