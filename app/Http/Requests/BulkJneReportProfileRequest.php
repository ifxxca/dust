<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class BulkJneReportProfileRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_array($this->input('accounts'))) {
            $this->merge(['accounts' => array_map(function (mixed $item): mixed {
                if (is_array($item) && is_string($item['customer_account'] ?? null)) {
                    $item['customer_account'] = mb_strtoupper(trim($item['customer_account']));
                }

                return $item;
            }, $this->input('accounts'))]);
        }
    }

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
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'accounts' => ['required', 'array', 'min:1', 'max:500'],
            'accounts.*' => ['required', 'array:customer_account,national_account'],
            'accounts.*.customer_account' => ['required', 'string', 'max:100', 'regex:/^[\pL\pN._\- ]+$/u', 'distinct:ignore_case'],
            'accounts.*.national_account' => ['required', 'in:Y,N'],
            'enabled' => ['required', 'boolean'],
            'interval_minutes' => ['required', 'integer', 'min:5', 'max:1440'],
            'lookback_days' => ['required', 'integer', 'min:1', 'max:366'],
        ];
    }
}
