<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class BulkAssignmentRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->canManagePickup() ?? false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'assigned_staff_id' => ['required', 'integer', Rule::exists('users', 'id')->where(fn ($query) => $query->whereIn('role', User::PICKUP_ROLES)->where('is_active', true))],
            'tasks' => ['required', 'array', 'list', 'min:1', 'max:100'],
            'tasks.*' => ['required', 'array:id,expected_version'],
            'tasks.*.id' => ['required', 'integer', 'min:1', 'distinct', 'exists:pickup_tasks,id'],
            'tasks.*.expected_version' => ['required', 'integer', 'min:1'],
        ];
    }

    /** @return array<\Closure> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach (array_diff(array_keys($this->all()), [...array_keys($this->rules()), '_token']) as $key) {
                $validator->errors()->add($key, 'Field tidak diizinkan.');
            }
        }];
    }
}
