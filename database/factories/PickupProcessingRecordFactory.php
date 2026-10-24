<?php

namespace Database\Factories;

use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<PickupProcessingRecord> */
class PickupProcessingRecordFactory extends Factory
{
    public function definition(): array
    {
        return ['pickup_task_id' => PickupTask::factory(), 'category' => 'manual_hybrid', 'system' => 'JNE_HYBRID', 'revision' => 1, 'submission_key' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'fixture'), 'successful_quantity' => 1, 'failed_quantity' => 0, 'pending_quantity' => 0, 'unknown_quantity' => 0, 'external_reference' => null, 'reason' => 'Catatan manual', 'pickup_revision' => 0, 'handover_revision' => 0, 'received_quantity' => 2, 'actor_id' => User::factory()->state(['role' => 'admin_supervisor'])];
    }
}
