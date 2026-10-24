<?php

namespace App\Actions\Pickup;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;

class PickupResultPeriod
{
    public const TIMEZONE = 'Asia/Jakarta';

    public const START_HOUR = 5;

    public static function today(): CarbonImmutable
    {
        return self::date(CarbonImmutable::now(self::TIMEZONE));
    }

    public static function date(CarbonImmutable $timestamp): CarbonImmutable
    {
        return $timestamp->setTimezone(self::TIMEZONE)->subHours(self::START_HOUR)->startOfDay();
    }

    public static function start(string $date): CarbonImmutable
    {
        return CarbonImmutable::parse($date, self::TIMEZONE)->startOfDay()->addHours(self::START_HOUR);
    }

    /** @param array<string, mixed> $filters */
    public static function apply(Builder $query, string $column, array $filters): Builder
    {
        foreach (['date_from' => '>=', 'date_to' => '<'] as $key => $operator) {
            if (! empty($filters[$key])) {
                $day = self::start($filters[$key]);
                $query->where($column, $operator, ($key === 'date_to' ? $day->addDay() : $day)->utc());
            }
        }

        return $query;
    }

    /** @return array<string, array{date_from: string, date_to: string}> */
    public static function presets(): array
    {
        $today = self::today();

        return [
            'today' => ['date_from' => $today->toDateString(), 'date_to' => $today->toDateString()],
            'yesterday' => ['date_from' => $today->subDay()->toDateString(), 'date_to' => $today->subDay()->toDateString()],
            'week' => ['date_from' => $today->subDays(6)->toDateString(), 'date_to' => $today->toDateString()],
        ];
    }
}
