<?php

namespace App\Models;

use Database\Factories\HandoverSessionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HandoverSession extends Model
{
    /** @use HasFactory<HandoverSessionFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['version' => 'integer', 'closed_at' => 'immutable_datetime', 'verification_started_at' => 'immutable_datetime'];
    }

    /** @return HasMany<HandoverItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(HandoverItem::class)->orderBy('id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return HasMany<HandoverEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(HandoverEvent::class)->orderBy('session_version');
    }
}
