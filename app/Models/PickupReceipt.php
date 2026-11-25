<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PickupReceipt extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['recipient_statuses' => 'array'];
    }

    /** @param list<string> $emails
     * @return array<string, array{status: string}>
     */
    public static function pendingRecipients(array $emails): array
    {
        return array_fill_keys($emails, ['status' => 'PENDING']);
    }

    /** @return HasMany<ReceiptAttempt, $this> */
    public function attempts(): HasMany
    {
        return $this->hasMany(ReceiptAttempt::class);
    }
}
