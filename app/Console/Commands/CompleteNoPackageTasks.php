<?php

namespace App\Console\Commands;

use App\Models\PickupTask;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

#[Signature('pickup:complete-no-packages {--apply : Apply the approved terminal outcome to legacy tasks}')]
#[Description('Audit and complete legacy tasks whose latest recorded visit had no packages; defaults to dry-run')]
class CompleteNoPackageTasks extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $count = 0;
        PickupTask::where('status', 'ASSIGNED')
            ->whereDoesntHave('proof')->whereHas('latestVisit', fn ($query) => $query->where('outcome', 'NO_PACKAGES')->whereNotNull('recorded_at'))
            ->orderBy('id')->chunkById(100, function ($tasks) use (&$count): void {
                foreach ($tasks as $candidate) {
                    $count += DB::transaction(function () use ($candidate): int {
                        $task = PickupTask::whereKey($candidate->id)->lockForUpdate()->firstOrFail();
                        $visit = $task->visits()->latest('id')->first();
                        if ($task->status !== 'ASSIGNED' || $visit?->outcome !== 'NO_PACKAGES' || ! $visit->recorded_at || $task->proof()->exists()) {
                            return 0;
                        }
                        if ($this->option('apply')) {
                            $task->update(['status' => 'NO_PACKAGES', 'version' => $task->version + 1]);
                            $task->events()->create(['action' => 'no_packages_completed', 'actor_id' => $visit->staff_id, 'task_version' => $task->version,
                                'reason' => 'Backfill approved no-packages policy via pickup:complete-no-packages; original visit preserved.', 'occurred_at' => now()]);
                        }

                        return 1;
                    }, 3);
                }
            });
        $this->info(($this->option('apply') ? 'Completed: ' : 'Eligible (dry-run): ').$count);

        return self::SUCCESS;
    }
}
