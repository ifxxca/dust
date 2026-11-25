<?php

namespace App\Models;

use Database\Factories\CustomerAwbDeliveryPreferenceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomerAwbDeliveryPreference extends Model
{
    /** @use HasFactory<CustomerAwbDeliveryPreferenceFactory> */
    use HasFactory;

    protected $guarded = ['id'];

    public static function fromCustomer(Customer $customer): self
    {
        $additional = config('pickup.email_recipients.enabled') ? ($customer->additional_emails ?? []) : [];

        $preference = new self(['customer_id' => $customer->id, 'enabled' => $customer->is_active,
            'channel' => 'email', 'recipient' => $customer->email,
            'recipients' => is_array($additional) ? [$customer->email, ...$additional] : [], 'revision' => 0]);
        if ($preference->emailRecipients() === []) {
            $preference->enabled = false;
        }

        return $preference;
    }

    public static function effectiveForCustomer(int $customerId): ?self
    {
        $customer = Customer::find($customerId);

        return $customer === null ? null : (self::where('customer_id', $customerId)->first() ?? self::fromCustomer($customer));
    }

    /** @return array<string, mixed> */
    public function deliverySettings(): array
    {
        return [...$this->toArray(), 'email_recipients' => $this->emailRecipients(), 'uses_customer_emails' => ! $this->exists];
    }

    /** @return list<string> */
    public function emailRecipients(): array
    {
        $emails = $this->getAttribute('recipients');
        if ($emails === null) {
            $customer = Customer::whereKey($this->customer_id)->first();
            $additional = config('pickup.email_recipients.enabled') && $customer !== null ? ($customer->additional_emails ?? []) : [];
            if (! is_array($additional)) {
                return [];
            }
            $emails = [$this->recipient, ...$additional];
        }

        if (! is_array($emails) || ! array_is_list($emails)) {
            return [];
        }
        $recipients = [];
        foreach ($emails as $email) {
            if (! is_string($email) || strlen(trim($email)) > 255 || ! filter_var(trim($email), FILTER_VALIDATE_EMAIL)) {
                return [];
            }
            $recipients[] = mb_strtolower(trim($email));
        }
        $recipients = array_values(array_unique($recipients));

        return count($recipients) > Customer::emailRecipientLimit() ? [] : $recipients;
    }

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'revision' => 'integer', 'recipients' => 'array'];
    }
}
