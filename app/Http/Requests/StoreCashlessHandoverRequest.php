<?php

namespace App\Http\Requests;

use App\Actions\Pickup\RecordCashlessHandover;
use App\Models\PickupTask;
use Illuminate\Foundation\Http\FormRequest;

class StoreCashlessHandoverRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        $task = $this->route('task');

        $user = $this->user();

        return $task instanceof PickupTask && $user !== null && ($user->can('handoverCashlessAwb', $task)
            || RecordCashlessHandover::isReplay($user, $task, $this->only(['submission_key', 'awbs'])));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return RecordCashlessHandover::rules();
    }
}
