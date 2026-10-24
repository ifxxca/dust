<?php

namespace Database\Factories;

use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ReportJob> */
class ReportJobFactory extends Factory
{
    public function definition(): array
    {
        return [
            'customer_account' => 'TESTACCOUNT', 'date_from' => '2026-10-01', 'date_thru' => '2026-10-02',
            'report_mode' => 'P', 'status' => 'QUEUED', 'created_by' => User::factory(),
        ];
    }
}
