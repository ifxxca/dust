<?php

namespace App\Http\Requests;

use App\Actions\Pickup\ManageCashlessEntryBatches;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class CashlessEntryCheckpointRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return in_array($this->attributes->get('report_source'), ManageCashlessEntryBatches::Sources, true);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'event_key' => ['required', 'uuid'],
            'type' => ['required', 'in:heartbeat,hold,creating,created,scan-start,scan-result,empty,approval-start,approved,inspection-result'],
            'ho_number' => ['required_if:type,created,scan-start,scan-result,empty,approval-start,approved,inspection-result', 'nullable', 'string', 'regex:/^HO-[A-Z0-9-]{1,60}$/D'],
            'item_id' => ['required_if:type,scan-start,scan-result', 'integer', 'min:1'],
            'awb' => ['required_if:type,scan-start,scan-result', 'string', 'max:100'],
            'outcome' => ['required_if:type,scan-result', 'in:ACCEPTED,PREVIOUSLY_ENTERED,ORION_REJECTED,NOT_FOUND,NEEDS_DATA,INVALID,UNKNOWN'],
            'message' => ['present_if:type,scan-result', 'required_if:type,hold', 'nullable', 'string', 'max:1000'],
            'elapsed_ms' => ['sometimes', 'integer', 'min:0', 'max:3600000'],
            'verified_awbs.*' => ['string', 'max:100', 'distinct:strict'],
            'print_available' => ['required_if:type,approved,inspection-result', 'boolean'],
            'approve_available' => ['required_if:type,approved,inspection-result', 'boolean'],
            'verified_awbs' => ['required_if:type,approval-start', 'present_if:type,inspection-result', 'array', 'list', 'max:500'],
            'ui_total' => ['required_if:type,inspection-result', 'integer', 'min:0', 'max:500'],
            'filters_clear' => ['required_if:type,inspection-result', 'boolean'],
        ];
    }
}
