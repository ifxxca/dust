<?php

namespace App\Http\Requests;

use App\Models\JneShipment;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ShipmentMonitoringRequest extends FormRequest
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
            'q' => ['nullable', 'string', 'max:100'],
            'shipper' => ['nullable', 'string', 'max:255'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'customer_link' => ['nullable', Rule::in(['linked', 'unlinked'])],
            'attribution' => ['nullable', Rule::in(['matched', 'unresolved'])],
            'outlet' => ['nullable', 'string', 'max:255'],
            'source_service' => ['sometimes', 'nullable', 'string', 'max:100'],
            'source_code' => ['sometimes', 'nullable', 'string', 'max:500'],
            'source_reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'source_web' => ['sometimes', 'nullable', 'string', 'max:255'],
            'source_pod' => ['sometimes', 'nullable', 'string', 'max:255'],
            'attention' => ['nullable', Rule::in(['all', 'exception', 'return', 'over_sla', 'potential_overdue'])],
            'native_sla_grade' => ['nullable', Rule::in(JneShipment::NATIVE_SLA_GRADES)],
            'sla_status' => ['nullable', Rule::in(JneShipment::SLA_STATUSES)],
            'destination' => ['nullable', 'string', 'max:100'],
            'service' => ['nullable', 'string', 'max:100'],
            'overdue_min' => ['nullable', 'integer', 'min:1', 'max:999999'],
            'overdue_max' => ['nullable', 'integer', 'min:1', 'max:999999', Rule::when($this->filled('overdue_min'), ['gte:overdue_min'])],
            'status' => ['nullable', Rule::in(JneShipment::STATUSES)],
            'lifecycle' => ['nullable', Rule::in(['active', 'terminal'])],
            'date_from' => ['nullable', 'date_format:Y-m-d,Y-m-d\TH:i'],
            'date_thru' => ['nullable', 'date_format:Y-m-d,Y-m-d\TH:i'],
            'freshness_hours' => ['nullable', 'required_if:freshness,stale', 'integer', 'min:1', 'max:8760'],
            'freshness' => ['nullable', Rule::in(['stale', 'unobserved'])],
            'per_page' => ['nullable', 'integer', Rule::in([20, 50])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'history' => ['nullable', Rule::in(['changes', 'all'])],
            'back' => ['nullable', Rule::in(['shipments', 'attention'])],
            'return_page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['date_from', 'date_thru']) || ! $this->filled('date_from') || ! $this->filled('date_thru')) {
                return;
            }
            $fromValue = $this->string('date_from')->toString();
            $thruValue = $this->string('date_thru')->toString();
            $from = CarbonImmutable::parse($fromValue, 'Asia/Jakarta');
            $thru = CarbonImmutable::parse($thruValue, 'Asia/Jakarta');
            $from = str_contains($fromValue, 'T') ? $from : $from->setTime(5, 0);
            $thru = str_contains($thruValue, 'T') ? $thru->addMinute() : $thru->addDay()->setTime(5, 0);
            if ($thru->lessThanOrEqualTo($from)) {
                $validator->errors()->add('date_thru', 'Tanggal dan jam sampai harus sama atau sesudah waktu mulai.');
            }
        }];
    }

    /** @return array<string, mixed> */
    public function monitoringFilters(): array
    {
        $filters = $this->validated();
        if (empty($filters['date_from']) && empty($filters['date_thru'])) {
            $today = CarbonImmutable::now('Asia/Jakarta')->subHours(5)->startOfDay();
            $filters['date_from'] = $today->subDays(13)->toDateString();
            $filters['date_thru'] = $today->toDateString();
        }

        return $filters;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['freshness_hours.required_if' => 'Pilih batas usia data (jam) untuk mencari data yang melewati batas.'];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'q' => 'AWB', 'shipper' => 'nama pengirim (report)', 'customer_id' => 'customer', 'status' => 'status', 'lifecycle' => 'siklus monitoring',
            'date_from' => 'hari operasional dari', 'date_thru' => 'sampai hari', 'freshness_hours' => 'batas usia data',
            'freshness' => 'kesegaran', 'per_page' => 'baris per halaman', 'page' => 'halaman', 'history' => 'jenis riwayat',
        ];
    }
}
