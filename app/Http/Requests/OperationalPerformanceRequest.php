<?php

namespace App\Http\Requests;

use App\Actions\Pickup\PickupResultPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class OperationalPerformanceRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->is_active && $this->user()->role === 'admin_supervisor';
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        return [
            'period' => ['nullable', Rule::in(['daily', 'weekly', 'monthly', 'custom'])],
            'date_from' => ['required', 'date_format:Y-m-d'],
            'date_thru' => ['required', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'outlet' => ['nullable', 'string', 'max:255'],
            'customer_page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $today = PickupResultPeriod::today();
        $period = $this->input('period', $this->filled('date_from') || $this->filled('date_thru') ? 'custom' : 'weekly');
        $from = match ($period) {
            'daily' => $today,
            'monthly' => $today->startOfMonth(),
            default => $today->subDays(6),
        };
        $this->merge([
            'period' => $period,
            'date_from' => $period === 'custom' ? $this->input('date_from', $from->toDateString()) : $from->toDateString(),
            'date_thru' => $period === 'custom' ? $this->input('date_thru', $today->toDateString()) : $today->toDateString(),
        ]);
    }

    /** @return list<\Closure> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['date_from', 'date_thru'])) {
                return;
            }
            if (CarbonImmutable::parse($this->input('date_from'))->diffInDays(CarbonImmutable::parse($this->input('date_thru'))) > 91) {
                $validator->errors()->add('date_thru', 'Pilih maksimal 92 hari operasional.');
            }
        }];
    }
}
