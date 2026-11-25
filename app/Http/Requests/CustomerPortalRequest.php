<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class CustomerPortalRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->is_active && in_array($this->user()->role, ['customer', 'admin_supervisor'], true);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'customer_id' => ['nullable', 'integer', 'min:1'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:DELIVERED,IN_TRANSIT,EXCEPTION,CANCELLED,RETURNED,UNKNOWN'],
            'category' => ['nullable', 'in:manual_hybrid,cashless_hybrid,css_orion'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
