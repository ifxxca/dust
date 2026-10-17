<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Database\Seeder;

class PickupTaskSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        if (app()->environment(['local', 'testing'])) {
            $actor = User::factory()->create(['role' => 'cs']);
            foreach (Customer::factory()->count(3)->create(['created_by' => $actor->id]) as $customer) {
                $task = PickupTask::factory()->create([
                    'customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name,
                    'pickup_address' => $customer->pickup_address, 'contact_snapshot' => $customer->contact,
                    'created_by' => $actor->id,
                ]);
                $task->events()->create(['action' => 'created', 'actor_id' => $actor->id, 'task_version' => 1, 'occurred_at' => now()]);
            }
        }
    }
}
