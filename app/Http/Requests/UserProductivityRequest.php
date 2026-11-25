<?php

namespace App\Http\Requests;

use App\Actions\Pickup\PickupResultPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UserProductivityRequest extends FormRequest
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
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        return [
            'date_from' => ['required', 'date_format:Y-m-d'],
            'date_thru' => ['required', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'q' => ['nullable', 'string', 'max:100'],
            'manual_seconds' => ['required', 'integer', 'between:1,3600'],
            'cashless_seconds' => ['required', 'integer', 'between:1,3600'],
            'orion_seconds' => ['required', 'integer', 'between:1,3600'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $today = PickupResultPeriod::today()->toDateString();
        $this->merge([
            'date_from' => $this->input('date_from', $today),
            'date_thru' => $this->input('date_thru', $this->input('date_from', $today)),
            'manual_seconds' => $this->input('manual_seconds', 90),
            'cashless_seconds' => $this->input('cashless_seconds', 30),
            'orion_seconds' => $this->input('orion_seconds', 90),
        ]);
    }

    /** @return list<\Closure> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['date_from', 'date_thru'])) {
                return;
            }
            if (CarbonImmutable::parse($this->input('date_from'))->diffInDays(CarbonImmutable::parse($this->input('date_thru'))) > 91) {
                $validator->errors()->add('date_thru', 'Pilih maksimal 92 hari operasional.');
            }
        }];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'date_from.required' => 'Isi tanggal mulai.',
            'date_thru.required' => 'Isi tanggal akhir.',
            'date_from.date_format' => 'Gunakan tanggal mulai yang valid.',
            'date_thru.date_format' => 'Gunakan tanggal akhir yang valid.',
            'date_thru.after_or_equal' => 'Tanggal akhir harus sama atau setelah tanggal mulai.',
            'q.max' => 'Pencarian maksimal 100 karakter.',
            '*.required' => 'Isi SLA dalam detik.',
            '*.integer' => 'SLA harus berupa bilangan bulat.',
            '*.between' => 'SLA harus antara 1 dan 3.600 detik.',
        ];
    }
}
