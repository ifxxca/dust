<?php

namespace App\Console\Commands;

use App\Actions\Scheduling\GeneratePickupTasks;
use App\Models\PickupSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('pickups:generate')]
#[Description('Generate occurrence jadwal yang disetujui tanpa duplikasi')]
class GenerateScheduledPickups extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(GeneratePickupTasks $generator): int
    {
        $policy = config('pickup.generation_policy');
        if (! in_array($policy, ['today', 'catchup_7_days'], true)) {
            $this->warn('Generasi belum aktif: kebijakan occurrence/libur/missed occurrence perlu disetujui.');

            return self::FAILURE;
        }
        $generated = 0;
        PickupSchedule::where('is_active', true)->chunkById(100, function ($schedules) use ($generator, $policy, &$generated) {
            foreach ($schedules as $schedule) {
                $today = CarbonImmutable::now($schedule->timezone)->startOfDay();
                for ($offset = $policy === 'catchup_7_days' ? 6 : 0; $offset >= 0; $offset--) {
                    $generated += $generator->handle($schedule->id, $today->subDays($offset));
                }
            }
        });
        $this->info("Generated: {$generated}");

        return self::SUCCESS;
    }
}
