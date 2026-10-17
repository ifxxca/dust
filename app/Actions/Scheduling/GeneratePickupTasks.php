<?php

namespace App\Actions\Scheduling;

use App\Models\Customer;
use App\Models\PickupSchedule;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GeneratePickupTasks
{
    public function handle(int $scheduleId, CarbonImmutable $day): int
    {
        return DB::transaction(function () use ($scheduleId, $day) {
            $schedule = PickupSchedule::whereKey($scheduleId)->lockForUpdate()->firstOrFail();
            $date = $day->setTimezone($schedule->timezone)->startOfDay();
            if (! $schedule->is_active || $date->toDateString() < $schedule->starts_on->toDateString() || ($schedule->ends_on && $date->toDateString() > $schedule->ends_on->toDateString()) || ! in_array($date->dayOfWeekIso, $schedule->weekdays, true)) {
                return 0;
            }
            if ($schedule->tasks()->where('occurrence_date', $date->toDateString())->lockForUpdate()->first()) {
                return 0;
            }
            $customer = Customer::whereKey($schedule->customer_id)->lockForUpdate()->firstOrFail();
            if (! $customer->is_active) {
                return 0;
            }
            $scheduled = CarbonImmutable::parse($date->toDateString().' '.$schedule->pickup_time, $schedule->timezone)->utc();
            if (PickupTask::where('customer_id', $customer->id)->where('status', '!=', 'CANCELLED')->where('scheduled_at', '>=', $scheduled->startOfMinute())->where('scheduled_at', '<', $scheduled->startOfMinute()->addMinute())->lockForUpdate()->exists()) {
                return 0;
            }
            $task = PickupTask::create(['reference' => (string) Str::ulid(), 'customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'pickup_address' => $schedule->pickup_address, 'contact_snapshot' => $customer->contact, 'scheduled_at' => $scheduled, 'notes' => $schedule->notes, 'created_by' => $schedule->created_by, 'pickup_type' => 'regular', 'pickup_schedule_id' => $schedule->id, 'occurrence_date' => $date->toDateString()]);
            $task->events()->create(['action' => 'scheduled_generated', 'actor_id' => $schedule->created_by, 'task_version' => 1, 'reason' => 'Generasi otomatis dari jadwal #'.$schedule->id, 'occurred_at' => now()]);
            $schedule->update(['last_generated_at' => now()]);

            return 1;
        }, 3);
    }
}
