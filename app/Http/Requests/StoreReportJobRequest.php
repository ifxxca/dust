<?php

namespace App\Http\Requests;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreReportJobRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $account = $this->input('customer_account');
        if (is_string($account)) {
            $this->merge(['customer_account' => mb_strtoupper(trim($account))]);
        }
        if (is_array($this->input('accounts'))) {
            $this->merge(['accounts' => array_map(function (mixed $item): mixed {
                if (is_array($item) && is_string($item['customer_account'] ?? null)) {
                    $item['customer_account'] = mb_strtoupper(trim($item['customer_account']));
                }

                return $item;
            }, $this->input('accounts'))]);
        }
    }

    public function authorize(): bool
    {
        return $this->user()?->is_active && $this->user()->role === 'admin_supervisor';
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'customer_account' => ['required_without:accounts', 'prohibits:accounts', 'nullable', 'string', 'max:100', 'regex:/^[\pL\pN._\- ]+$/u'],
            'national_account' => ['sometimes', 'required', 'in:Y,N'],
            'accounts' => ['required_without:customer_account', 'array', 'min:1', 'max:500'],
            'accounts.*' => ['required', 'array:customer_account,national_account'],
            'accounts.*.customer_account' => ['required', 'string', 'max:100', 'regex:/^[\pL\pN._\- ]+$/u', 'distinct:ignore_case'],
            'accounts.*.national_account' => ['required', 'in:Y,N'],
            'date_from' => ['required', 'date_format:Y-m-d'],
            'date_thru' => ['required', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'status' => ['prohibited'], 'worker_id' => ['prohibited'], 'created_by' => ['prohibited'],
            'parameters' => ['prohibited'], 'report_mode' => ['prohibited'],
        ];
    }

    /** @return array<callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['date_from', 'date_thru'])) {
                return;
            }

            $maxDays = config('jne-reports.max_request_days');
            $lastDate = CarbonImmutable::parse($this->string('date_from')->toString())->addDays($maxDays - 1);
            if (CarbonImmutable::parse($this->string('date_thru')->toString())->greaterThan($lastDate)) {
                $validator->errors()->add('date_thru', "Rentang satu permintaan maksimal {$maxDays} hari, termasuk tanggal awal dan akhir.");
            }
            $parts = (int) ceil((CarbonImmutable::parse($this->string('date_from')->toString())->diffInDays(CarbonImmutable::parse($this->string('date_thru')->toString())) + 1) / config('jne-reports.max_report_days'));
            if ($parts * (is_array($this->input('accounts')) ? count($this->input('accounts')) : 1) > 1000) {
                $validator->errors()->add('accounts', 'Maksimal 1.000 bagian report per permintaan. Kurangi account atau rentang tanggal.');
            }
        }];
    }
}
