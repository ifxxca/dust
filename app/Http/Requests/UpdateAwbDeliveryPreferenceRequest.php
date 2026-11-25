<?php

namespace App\Http\Requests;

use App\Models\Customer;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAwbDeliveryPreferenceRequest extends FormRequest
{
    private bool $explicitRecipients = false;

    public function recipientsWereProvided(): bool
    {
        return $this->explicitRecipients;
    }

    protected function prepareForValidation(): void
    {
        $this->explicitRecipients = $this->exists('recipients');
        $recipients = $this->input('recipients');
        if ($recipients === null && is_string($this->input('recipient'))) {
            $recipients = $this->input('recipient') === '' ? [] : [$this->input('recipient')];
        }
        if (is_array($recipients)) {
            $recipients = array_map(fn (mixed $email): mixed => is_string($email) ? mb_strtolower(trim($email)) : $email, $recipients);
            $this->merge(['recipients' => $recipients, 'recipient' => $recipients[0] ?? null]);
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
            'enabled' => ['required', 'boolean'],
            'recipient' => ['nullable', Rule::requiredIf($this->boolean('enabled')), 'email', 'max:255'],
            'recipients' => [Rule::requiredIf($this->boolean('enabled')), 'array', 'list', 'max:'.Customer::emailRecipientLimit()],
            'recipients.*' => ['required', 'string', 'email', 'max:255', 'distinct:ignore_case'],
            'expected_revision' => ['required', 'integer', 'min:0'],
            'reason' => ['required', 'string', 'max:500'],
        ];
    }
}
