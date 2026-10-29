<?php

namespace App\Http\Requests;

use App\Actions\Pickup\RecordCashlessAwb;
use App\Models\PickupTask;
use Illuminate\Foundation\Http\FormRequest;

class RecordCashlessAwbRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        $task = $this->route('task');
        $task = $task instanceof PickupTask ? $task : PickupTask::find($task);

        return $task !== null && $this->user()?->can($this->routeIs('api.cashless-awbs.correct') ? 'correctCashlessAwb' : 'recordCashlessAwb', $task);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return RecordCashlessAwb::rules($this->routeIs('api.cashless-awbs.correct'));
    }
}
