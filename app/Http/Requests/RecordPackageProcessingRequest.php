<?php

namespace App\Http\Requests;

use App\Models\PickupProcessingRecord;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RecordPackageProcessingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->is_active && $this->user()->role === 'admin_supervisor';
    }

    protected function prepareForValidation(): void
    {
        $reference = $this->input('external_reference');
        if (is_string($reference)) {
            $this->merge(['external_reference' => trim($reference) === '' ? null : mb_strtoupper(trim($reference))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $rules = [
            'category' => ['required', Rule::in(PickupProcessingRecord::CATEGORIES)],
            'system' => ['required', Rule::in(PickupProcessingRecord::SYSTEMS)],
            'expected_revision' => ['required', 'integer', 'min:0'],
            'expected_pickup_revision' => ['required', 'integer', 'min:0'],
            'expected_handover_revision' => ['present', 'nullable', 'integer', 'min:0'],
            'submission_key' => ['required', 'uuid'],
            'external_reference' => ['nullable', 'string', 'max:100'],
            'reason' => ['required', 'string', 'max:500'],
            'source' => ['prohibited'], 'status' => ['prohibited'], 'actor_id' => ['prohibited'], 'confirmed_at' => ['prohibited'],
        ];
        foreach (['successful_quantity', 'failed_quantity', 'pending_quantity', 'unknown_quantity'] as $quantity) {
            $rules[$quantity] = ['required', 'integer', 'min:0', 'max:1000000'];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['reason.required' => 'Catatan pendukung atau alasan koreksi wajib diisi.', '*.min' => 'Jumlah dan revisi tidak boleh negatif.'];
    }
}
