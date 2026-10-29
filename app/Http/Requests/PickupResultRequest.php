<?php

namespace App\Http\Requests;

use App\Actions\Pickup\PickupResultPeriod;
use App\Models\PickupProcessingRecord;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PickupResultRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $today = PickupResultPeriod::today()->toDateString();
        $this->merge([
            'date_from' => $this->input('date_from') ?: ($this->input('date_to') ?: $today),
            'date_to' => $this->input('date_to') ?: ($this->input('date_from') ?: $today),
            'date_basis' => in_array($this->input('date_basis'), [null, '', 'schedule', 'visit', 'received', 'processing_recorded'], true) ? 'pickup' : $this->input('date_basis'),
        ]);
    }

    public function authorize(): bool
    {
        return $this->user()->is_active && $this->user()->role === 'admin_supervisor';
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:100'], 'reference' => ['nullable', 'string', 'max:100'],
            'customer' => ['nullable', 'string', 'max:100'], 'staff' => ['nullable', 'string', 'max:100'],
            'customer_id' => ['nullable', 'integer', 'min:1'], 'staff_id' => ['nullable', 'integer', 'min:1'],
            'date_from' => ['required', 'date_format:Y-m-d'],
            'date_to' => ['required', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'date_basis' => ['required', Rule::in(['pickup'])],
            'scope' => ['nullable', Rule::in(['daily', 'backlog', 'outstanding'])],
            'pickup_queue' => ['nullable', Rule::in(['not_visited', 'incomplete', 'waiting_handover', 'unverified', 'discrepancy'])],
            'quick_pickup' => ['nullable', 'integer', 'min:1'],
            'visit_outcome' => ['nullable', Rule::in(['not_visited', 'visited', 'in_progress', 'COLLECTED', 'NO_PACKAGES'])],
            'pop_status' => ['nullable', Rule::in(['final', 'incomplete'])],
            'handover_status' => ['nullable', Rule::in(['none', 'waiting', 'DRAFT', 'IN_VERIFICATION', 'CLOSED'])],
            'verification_status' => ['nullable', Rule::in(['none', 'pending', 'verified', 'review'])],
            'discrepancy_status' => ['nullable', Rule::in(['yes', 'no'])],
            'sort' => ['sometimes', Rule::in(['scheduled_at', 'period_at', 'reference', 'customer_name', 'staff_name'])],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
            'group_by' => ['nullable', Rule::in(['date', 'staff', 'customer'])],
            'monitoring' => ['nullable', Rule::in(['pickup', 'processing', 'automation'])],
            'automation_status' => ['nullable', Rule::in(['NOT_EVALUATED', 'AWAITING_VERIFICATION', 'WAITING_DATA', 'PARTIAL', 'COUNTS_MATCHED', 'REVIEW', 'DONE'])],
            'reconciliation_group' => ['nullable', Rule::in(['review', 'waiting', 'done'])],
            'selected_ids' => ['sometimes', 'array', 'max:200'],
            'selected_ids.*' => ['integer', 'min:1', 'distinct'],
            'delivery_status' => ['nullable', Rule::in(['NOT_READY', 'BUILDING_DOCUMENT', 'DOCUMENT_FAILED', 'AWAITING_CONFIGURATION', 'READY', 'SENDING', 'ACCEPTED', 'DELIVERED', 'FAILED', 'UNKNOWN', 'CANCELLED', 'REVIEW'])],
            'category' => ['nullable', Rule::in(PickupProcessingRecord::CATEGORIES)],
            'processing_system' => ['nullable', Rule::in(PickupProcessingRecord::SYSTEMS)],
            'processing_status' => ['nullable', Rule::in(['NOT_RECORDED', 'MANUAL_RECORDED', 'PENDING', 'FAILED', 'UNKNOWN', 'RECONCILIATION_REQUIRED'])],
            'provenance' => ['nullable', Rule::in(['MANUAL', 'NOT_RECORDED', 'EXTERNAL'])],
            'reconciliation' => ['nullable', Rule::in(['yes', 'no'])],
            'processing_sort' => ['nullable', Rule::in(['scheduled_at', 'period_at', 'reference', 'customer_name', 'staff_name', 'unconfirmed_quantity', 'manual_quantity', 'last_updated_at'])],
            'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', Rule::in([10, 20, 50])],
        ];
    }
}
