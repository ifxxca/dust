<?php

namespace App\Http\Controllers;

use App\Actions\Handover\CorrectVerification;
use App\Actions\Pickup\CorrectPickupRecord;
use App\Http\Resources\HandoverResource;
use App\Http\Resources\PickupTaskResource;
use App\Models\HandoverSession;
use App\Models\PickupTask;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class OperationalCorrectionController extends Controller
{
    public function proof(Request $request, PickupTask $task, CorrectPickupRecord $action): PickupTaskResource
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([...$this->quantityRules(), 'customer_name' => ['required', 'string', 'max:255'], 'pickup_address' => ['required', 'string', 'max:2000'], 'contact' => ['required', 'string', 'max:255'], 'notes' => ['nullable', 'string', 'max:5000']]);
        if (array_sum(array_intersect_key($data, array_flip(['manual_hybrid', 'cashless_hybrid', 'css_orion']))) < 1) {
            throw ValidationException::withMessages(['manual_hybrid' => 'Total paket harus lebih dari nol.']);
        }

        return new PickupTaskResource($action->handle($request->user(), $task->id, $data)->load(['assignedStaff', 'events', 'visits', 'proof.attachments', 'proof.receipt', 'proof.revisions']));
    }

    public function verification(Request $request, HandoverSession $session, int $item, CorrectVerification $action): HandoverResource
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([...$this->quantityRules(), 'discrepancy_notes' => ['nullable', 'string', 'max:5000']]);

        return new HandoverResource($action->handle($request->user(), $session->id, $item, $data)->load(['items.proof.revisions', 'items.revisions', 'items.task.assignedStaff', 'events']));
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->is_active && $request->user()->role === 'admin_supervisor', 403);
    }

    /** @return array<string, array<int, string>> */
    private function quantityRules(): array
    {
        return ['expected_version' => ['required', 'integer', 'min:1'], 'reason' => ['required', 'string', 'max:500'], 'manual_hybrid' => ['required', 'integer', 'min:0', 'max:1000000'], 'cashless_hybrid' => ['required', 'integer', 'min:0', 'max:1000000'], 'css_orion' => ['required', 'integer', 'min:0', 'max:1000000']];
    }
}
