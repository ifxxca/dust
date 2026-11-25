<?php

namespace App\Models;

use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    /** @return HasMany<JneShipperAlias, $this> */
    public function shipperAliases(): HasMany
    {
        return $this->hasMany(JneShipperAlias::class)->whereNotNull('mapping_key');
    }

    /** @use HasFactory<CustomerFactory> */
    use HasFactory;

    protected $fillable = ['name', 'pickup_address', 'contact', 'created_by', 'customer_code', 'email', 'additional_emails', 'phone', 'latitude', 'longitude', 'is_active', 'version', 'updated_by', 'document_delivery_settings'];

    /** @return array{receipt_email: bool, recap_email: bool, receipt_whatsapp: bool, recap_whatsapp: bool, whatsapp_type: string, whatsapp_target: string, whatsapp_label: string, whatsapp_consent_confirmed: bool} */
    public function documentDeliveryOptions(): array
    {
        $options = $this->getAttribute('document_delivery_settings') ?? [];

        return [
            'receipt_email' => filter_var($options['receipt_email'] ?? true, FILTER_VALIDATE_BOOL),
            'recap_email' => filter_var($options['recap_email'] ?? true, FILTER_VALIDATE_BOOL),
            'receipt_whatsapp' => filter_var($options['receipt_whatsapp'] ?? false, FILTER_VALIDATE_BOOL),
            'recap_whatsapp' => filter_var($options['recap_whatsapp'] ?? false, FILTER_VALIDATE_BOOL),
            'whatsapp_type' => ($options['whatsapp_type'] ?? '') === 'group' ? 'group' : 'contact',
            'whatsapp_target' => is_string($options['whatsapp_target'] ?? null) ? $options['whatsapp_target'] : '',
            'whatsapp_label' => is_string($options['whatsapp_label'] ?? null) ? $options['whatsapp_label'] : '',
            'whatsapp_consent_confirmed' => filter_var($options['whatsapp_consent_confirmed'] ?? false, FILTER_VALIDATE_BOOL),
        ];
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function recordDocumentDeliveryConsent(array $options, int $actorId): array
    {
        $old = $this->documentDeliveryOptions();
        $record = $this->getAttribute('document_delivery_settings')['whatsapp_consent_record'] ?? null;
        if (! ($options['whatsapp_consent_confirmed'] ?? false)) {
            $record = null;
        } elseif ($record === null || ! $old['whatsapp_consent_confirmed'] || $old['whatsapp_target'] !== $options['whatsapp_target'] || $old['whatsapp_type'] !== $options['whatsapp_type']) {
            $record = ['actor_id' => $actorId, 'confirmed_at' => now()->toIso8601String(), 'target' => $options['whatsapp_target'], 'type' => $options['whatsapp_type']];
        }

        return [...$options, 'whatsapp_consent_record' => $record];
    }

    public static function emailRecipientLimit(): int
    {
        return config('pickup.email_recipients.enabled') ? max(1, (int) config('pickup.email_recipients.limit', 5)) : 1;
    }

    /** @return list<string> */
    public function notificationEmails(?string $fallback = null): array
    {
        $primary = filter_var($this->email, FILTER_VALIDATE_EMAIL) ? $this->email : $fallback;
        $additional = $this->getAttribute('additional_emails');

        return array_values(collect([$primary, ...(is_array($additional) ? $additional : [])])->filter(fn (mixed $email): bool => is_string($email) && filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false)
            ->map(fn (string $email): string => mb_strtolower(trim($email)))->unique()->take(self::emailRecipientLimit())->all());
    }

    protected function casts(): array
    {
        return ['document_delivery_settings' => 'array', 'additional_emails' => 'array', 'latitude' => 'decimal:7', 'longitude' => 'decimal:7', 'is_active' => 'boolean', 'version' => 'integer'];
    }
}
