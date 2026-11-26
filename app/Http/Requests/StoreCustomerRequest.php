<?php

namespace App\Http\Requests;

use App\Actions\Pickup\WahaClient;
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
        if (is_array($options = $this->input('document_delivery_settings'))) {
            $target = $options['whatsapp_target'] ?? '';
            $target = is_string($target) ? trim($target) : $target;
            if (($options['whatsapp_type'] ?? '') === 'contact' && is_string($target) && $target !== '') {
                $target = preg_replace('/@c\.us$/', '', $target);
                $target = preg_replace('/[\s()+.-]/', '', $target);
                if (str_starts_with($target, '0')) {
                    $target = '62'.substr($target, 1);
                }
                if (ctype_digit($target)) {
                    $target .= '@c.us';
                }
            }
            $label = $options['whatsapp_label'] ?? '';
            $this->merge(['document_delivery_settings' => [...$options, 'whatsapp_target' => $target, 'whatsapp_label' => is_string($label) ? trim($label) : $label]]);
        }
        if (is_string($this->input('customer_code'))) {
            $this->merge(['customer_code' => strtoupper(trim($this->input('customer_code')))]);
        }
        if (is_string($this->input('email'))) {
            $this->merge(['email' => mb_strtolower(trim($this->input('email')))]);
        }
        if (is_array($this->input('additional_emails'))) {
            $this->merge(['additional_emails' => array_map(fn (mixed $email): mixed => is_string($email) ? mb_strtolower(trim($email)) : $email, $this->input('additional_emails'))]);
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
            if ($this->exists('document_delivery_settings')) {
                $waha = app(WahaClient::class);
                if (! $waha->installed()) {
                    $validator->errors()->add('document_delivery_settings', 'Pengaturan pengiriman dokumen belum diaktifkan.');
                }
                $options = $this->input('document_delivery_settings', []);
                if ($validator->errors()->isEmpty() && is_array($options) && (($options['receipt_whatsapp'] ?? false) || ($options['recap_whatsapp'] ?? false))) {
                    if (! ($options['whatsapp_consent_confirmed'] ?? false)) {
                        $validator->errors()->add('document_delivery_settings.whatsapp_consent_confirmed', 'Konfirmasi persetujuan customer atau pengelola grup sebelum mengaktifkan WhatsApp.');
                    }
                    $pattern = ($options['whatsapp_type'] ?? '') === 'group' ? '/^\d+(?:-\d+)?@g\.us$/' : '/^[1-9]\d{6,14}@c\.us$/';
                    if (! preg_match($pattern, (string) ($options['whatsapp_target'] ?? ''))) {
                        $message = ($options['whatsapp_type'] ?? '') === 'group'
                            ? 'Isi ID grup WhatsApp yang berakhiran @g.us, misalnya 120363046678445460@g.us.'
                            : 'Isi nomor WhatsApp, misalnya 08123456789. Untuk ID berakhiran @g.us, ubah tujuan menjadi Grup lalu tempel ID grupnya.';
                        $validator->errors()->add('document_delivery_settings.whatsapp_target', $message);
                    }
                }
            }
            foreach (array_diff(array_keys($this->all()), [...array_keys($this->rules()), '_token']) as $key) {
                $validator->errors()->add($key, 'Field tidak diizinkan.');
            }
            $customer = $this->route('customer');
            $email = $this->exists('email') ? $this->input('email') : ($customer instanceof Customer ? $customer->email : null);
            $additional = $this->input('additional_emails', $customer instanceof Customer ? ($customer->additional_emails ?? []) : []);
            if (is_array($additional)) {
                if ($additional !== [] && blank($email)) {
                    $validator->errors()->add('email', 'Isi email utama sebelum menambahkan penerima lain.');
                }
                foreach ($additional as $index => $address) {
                    if (is_string($address) && is_string($email) && mb_strtolower(trim($address)) === mb_strtolower(trim($email))) {
                        $validator->errors()->add('additional_emails.'.$index, 'Alamat email sudah digunakan sebagai email utama.');
                    }
                }
            }
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
            'document_delivery_settings' => ['sometimes', 'array:receipt_email,recap_email,receipt_whatsapp,recap_whatsapp,whatsapp_type,whatsapp_target,whatsapp_label,whatsapp_consent_confirmed'],
            'document_delivery_settings.whatsapp_consent_confirmed' => ['sometimes', 'boolean'],
            'document_delivery_settings.receipt_email' => ['required_with:document_delivery_settings', 'boolean'],
            'document_delivery_settings.recap_email' => ['required_with:document_delivery_settings', 'boolean'],
            'document_delivery_settings.receipt_whatsapp' => ['required_with:document_delivery_settings', 'boolean'],
            'document_delivery_settings.recap_whatsapp' => ['required_with:document_delivery_settings', 'boolean'],
            'document_delivery_settings.whatsapp_type' => ['required_with:document_delivery_settings', 'in:contact,group'],
            'document_delivery_settings.whatsapp_target' => ['nullable', 'string', 'max:100'],
            'document_delivery_settings.whatsapp_label' => ['nullable', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'pickup_address' => ['required', 'string', 'max:2000'],
            'contact' => ['nullable', 'string', 'max:255'],
            'customer_code' => ['nullable', 'string', 'max:64', Rule::unique('customers', 'customer_code')->ignore($this->route('customer'))],
            'email' => ['nullable', 'email', 'max:255'],
            'additional_emails' => ['sometimes', 'array', 'list', 'max:'.(Customer::emailRecipientLimit() - 1)],
            'additional_emails.*' => ['required', 'string', 'email', 'max:255', 'distinct:ignore_case'],
            'phone' => ['nullable', 'string', 'max:32', 'regex:/^\+?[0-9][0-9\s().-]{5,31}$/'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'is_active' => ['sometimes', 'required', 'boolean'],
            'created_by' => ['prohibited'],
            'updated_by' => ['prohibited'], 'version' => ['prohibited'],
        ];
    }
}
