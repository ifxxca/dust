<?php

namespace App\Http\Requests;

use App\Models\PickupProcessingRecord;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReviewPickupAwbsRequest extends FormRequest
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
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'action' => ['required', Rule::in(['ADD', 'REMOVE', 'UNLOCK', 'VALIDATE', 'PENDING', 'READY', 'CANCEL_PENDING'])],
            'expected_version' => ['required', 'integer', 'min:0'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
            'shipment_id' => ['nullable', 'required_if:action,ADD,REMOVE', 'integer', 'min:1'],
            'shipment_version' => ['nullable', 'required_if:action,ADD,REMOVE', 'integer', 'min:1'],
            'pending_id' => ['nullable', 'required_if:action,READY,CANCEL_PENDING', 'integer', 'min:1'],
            'pending_version' => ['nullable', 'required_with:pending_id', 'integer', 'min:1'],
            'category' => ['nullable', 'required_if:action,PENDING', Rule::in(PickupProcessingRecord::CATEGORIES)],
            'label' => ['nullable', 'required_if:action,PENDING', 'string', 'max:150'],
        ];
    }
}
