<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Laravel\Sanctum\PersonalAccessToken;

class MobilePushDevice extends Model
{
    protected $guarded = ['id'];

    protected $hidden = ['fcm_token', 'token_hash'];

    protected function casts(): array
    {
        return ['fcm_token' => 'encrypted', 'is_active' => 'boolean'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<PersonalAccessToken, $this> */
    public function personalAccessToken(): BelongsTo
    {
        return $this->belongsTo(PersonalAccessToken::class);
    }

    public function activeMobileToken(?User $user): ?PersonalAccessToken
    {
        $token = $this->personalAccessToken;
        if (! $this->is_active || ! $user?->is_active || $user->role !== 'pickup_staff' || $this->user_id !== $user->id
            || ! $token || $token->tokenable_type !== $user->getMorphClass() || $token->tokenable_id !== $user->id
            || ! $token->can('mobile:read') || ! $token->expires_at || $token->expires_at->isPast()
            || $token->created_at->addMinutes((int) config('sanctum.expiration'))->isPast()
            || ! str_starts_with($token->name, 'mobile:'.$this->installation_id.':')) {
            return null;
        }

        return $token;
    }
}
