<?php

namespace App\Http\Resources;

use App\Models\PickupRecord;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin PickupRecord */
class PickupRecordResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $values = $this->resource->effectiveValues();

        return [
            'id' => $this->id, ...$values, 'revision' => $this->resource->revisionNumber(),
            'staff_id' => $this->staff_id,
            'total' => $values['manual_hybrid'] + $values['cashless_hybrid'] + $values['css_orion'],
            'original' => $this->resource->only(['customer_name', 'pickup_address', 'contact', 'manual_hybrid', 'cashless_hybrid', 'css_orion', 'notes']),
            'revisions' => $this->resource->revisions->map(fn ($revision) => $revision->only(['revision', 'values', 'actor_id', 'reason', 'created_at'])),
            'picked_up_at' => $this->picked_up_at, 'finalized_at' => $this->finalized_at,
            'attachments' => $this->attachments->map(fn ($file) => ['id' => $file->id, 'kind' => $file->kind, 'url' => $request->routeIs('mobile.*') ? route('mobile.evidence', $file, false) : route('api.evidence', $file)]),
            'receipt' => $this->receipt?->only(['status', 'recipient', 'channel', 'provider_message_id', 'proof_revision', 'accepted_at', 'delivered_at', 'last_error']),
            'receipt_history' => $this->resource->receipts->map(fn ($receipt) => $receipt->only(['proof_revision', 'status', 'recipient', 'provider_message_id', 'accepted_at'])),
            'can_send_receipt' => config('pickup.receipt_channel') === 'email' && config('mail.default') === 'smtp',
        ];
    }
}
