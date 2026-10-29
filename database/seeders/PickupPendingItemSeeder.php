<?php

namespace Database\Seeders;

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Models\PickupPendingItem;
use App\Models\PickupTask;
use Illuminate\Database\Seeder;

class PickupPendingItemSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $task = PickupTask::where('reference', 'like', 'SIM-AUTO-%')->where('customer_name_snapshot', '[SIM AUTO] Belum ada tarikan')->first();
        if (! $task) {
            return;
        }
        PickupPendingItem::firstOrCreate(['reference' => 'SIM-PENDING-DEST-001'], ['pickup_task_id' => $task->id, 'category' => 'manual_hybrid', 'label' => '[SIM] Order pending destinasi', 'reason' => 'Simulasi: customer belum melengkapi destinasi.', 'created_by' => $task->created_by, 'updated_by' => $task->created_by]);
        app(ReconcilePickupProcessing::class)->handle($task->id);
    }
}
