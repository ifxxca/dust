<?php

namespace App\Console\Commands;

use App\Actions\Reports\ResolveJneCategories;
use App\Models\JneShipment;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ClassifyJneShipmentCategories extends Command
{
    protected $signature = 'jne-monitoring:classify';

    protected $description = 'Classify stored AWBs from source evidence without requesting reports or changing pickup quantities';

    public function handle(ResolveJneCategories $resolver): int
    {
        if (! ResolveJneCategories::markersEnabled()) {
            $this->error('Category markers are disabled.');

            return self::FAILURE;
        }
        $count = 0;
        JneShipment::select('id')->chunkById(250, function ($rows) use ($resolver, &$count): void {
            DB::transaction(function () use ($rows, $resolver): void {
                $resolver->handle(JneShipment::whereIn('id', $rows->modelKeys())->orderBy('id')->lockForUpdate()->get());
            }, 5);
            $count += $rows->count();
        });
        $this->info($count.' AWB(s) checked from stored source evidence.');

        return self::SUCCESS;
    }
}
