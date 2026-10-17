<?php

namespace App\Http\Requests;

class UpdateCustomerRequest extends StoreCustomerRequest
{
    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $rules = parent::rules();
        $rules['name'] = ['sometimes', 'required', 'string', 'max:255'];
        $rules['pickup_address'] = ['sometimes', 'required', 'string', 'max:2000'];
        $rules['contact'] = ['sometimes', 'nullable', 'string', 'max:255'];
        $rules['expected_version'] = ['required', 'integer', 'min:1'];

        return $rules;
    }
}
