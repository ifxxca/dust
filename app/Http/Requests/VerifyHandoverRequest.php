<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class VerifyHandoverRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->canVerifyHandover();
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'expected_version' => ['required', 'integer', 'min:1'],
            'expected_pickup_revision' => ['sometimes', 'integer', 'min:0'],
            'manual_hybrid' => ['required', 'integer', 'min:0', 'max:1000000'],
            'cashless_hybrid' => ['required', 'integer', 'min:0', 'max:1000000'],
            'css_orion' => ['required', 'integer', 'min:0', 'max:1000000'],
            'discrepancy_notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
