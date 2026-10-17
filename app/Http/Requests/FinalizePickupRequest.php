<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class FinalizePickupRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->canExecutePickup();
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'expected_version' => ['required', 'integer', 'min:1'],
            'submission_key' => ['required', 'uuid'],
            'manual_hybrid' => ['required', 'integer', 'min:0', 'max:1000000'],
            'cashless_hybrid' => ['required', 'integer', 'min:0', 'max:1000000'],
            'css_orion' => ['required', 'integer', 'min:0', 'max:1000000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'photos' => ['sometimes', 'array', 'max:4'],
            'photos.*' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'signature' => ['required', 'image', 'mimes:png', 'max:1024', 'dimensions:max_width=2000,max_height=1000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'manual_hybrid.integer' => 'Jumlah Manual Hybrid (Non-Cashless) harus berupa bilangan bulat.',
            'cashless_hybrid.integer' => 'Jumlah Cashless Hybrid harus berupa bilangan bulat.',
            'css_orion.integer' => 'Jumlah CSS / Orion harus berupa bilangan bulat.',
        ];
    }

    /** @return list<\Closure(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ((int) $this->input('manual_hybrid') + (int) $this->input('cashless_hybrid') + (int) $this->input('css_orion') <= 0) {
                $validator->errors()->add('manual_hybrid', 'Pickup berhasil harus memiliki paket. Gunakan hasil kunjungan tanpa paket untuk total nol.');
            }
            if (! $validator->errors()->has('signature') && $this->hasFile('signature')) {
                $image = imagecreatefrompng($this->file('signature')->getPathname());
                $hasInk = false;
                if ($image !== false) {
                    for ($x = 0; $x < imagesx($image) && ! $hasInk; $x++) {
                        for ($y = 0; $y < imagesy($image); $y++) {
                            $pixel = imagecolorat($image, $x, $y);
                            if ($pixel === false) {
                                continue;
                            }
                            $color = imagecolorsforindex($image, $pixel);
                            if ($color['alpha'] < 120 && $color['red'] + $color['green'] + $color['blue'] < 600) {
                                $hasInk = true;
                                break;
                            }
                        }
                    }
                }
                if (! $hasInk) {
                    $validator->errors()->add('signature', 'Tanda tangan tidak boleh kosong.');
                }
            }
        }];
    }
}
