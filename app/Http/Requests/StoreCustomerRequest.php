<?php

namespace App\Http\Requests;

use App\Models\Customer;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreCustomerRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->canManagePickup() ?? false;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('customer_code'))) {
            $this->merge(['customer_code' => strtoupper(trim($this->input('customer_code')))]);
        }
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
            $customer = $this->route('customer');
            $latitude = $this->exists('latitude') ? $this->input('latitude') : ($customer instanceof Customer ? $customer->latitude : null);
            $longitude = $this->exists('longitude') ? $this->input('longitude') : ($customer instanceof Customer ? $customer->longitude : null);
            if (($latitude === null) !== ($longitude === null)) {
                $validator->errors()->add($latitude === null ? 'latitude' : 'longitude', 'Isi latitude dan longitude bersama, atau kosongkan keduanya.');
            }
        }];
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'pickup_address' => ['required', 'string', 'max:2000'],
            'contact' => ['nullable', 'required_without_all:email,phone', 'string', 'max:255'],
            'customer_code' => ['nullable', 'string', 'max:64', Rule::unique('customers', 'customer_code')->ignore($this->route('customer'))],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32', 'regex:/^\+?[0-9][0-9\s().-]{5,31}$/'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'is_active' => ['sometimes', 'required', 'boolean'],
            'created_by' => ['prohibited'],
            'updated_by' => ['prohibited'], 'version' => ['prohibited'],
        ];
    }
}
