<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class TakeoverRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->canExecutePickup() ?? false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    /** @return array<\Closure> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), [...array_keys($this->rules()), '_token']) as $key) {
                $validator->errors()->add($key, 'Field tidak diizinkan.');
            }
        }];
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'expected_version' => ['required', 'integer', 'min:1'],
            'expected_assigned_staff_id' => ['present', 'nullable', 'integer', 'min:1'],
            'reason' => ['nullable', 'string', 'max:500'],
            'assigned_staff_id' => ['prohibited'], 'execution_started_at' => ['prohibited'],
        ];
    }
}
