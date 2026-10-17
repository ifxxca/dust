<?php

namespace App\Http\Requests;

use App\Models\PickupTask;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StorePickupTaskRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('create', PickupTask::class) ?? false;
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
            if ($this->user()->role === 'pickup_staff' && ! trim((string) $this->input('notes'))) {
                $validator->errors()->add('notes', 'Isi alasan atau catatan pickup manual.');
            }
        }];
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'pickup_address' => ['required', 'string', 'max:2000'],
            'scheduled_at' => ['required', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'submission_key' => [$this->user()->role === 'pickup_staff' ? 'required' : 'nullable', 'uuid'],
            'previous_task_id' => ['nullable', 'integer', 'min:1'],
            'status' => ['prohibited'], 'assigned_staff_id' => ['prohibited'],
            'execution_started_at' => ['prohibited'], 'created_by' => ['prohibited'],
        ];
    }
}
