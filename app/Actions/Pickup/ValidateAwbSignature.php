<?php

namespace App\Actions\Pickup;

use Illuminate\Validation\ValidationException;

class ValidateAwbSignature
{
    public static function normalize(string $raw): string
    {
        return strtr(trim($raw, " \t\r\n"), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    }

    /** @return list<string> */
    public function matches(string $awb): array
    {
        return array_values(array_filter(config('pickup.awb_signatures'), function (string $pattern) use ($awb): bool {
            $expression = str_replace('\\#', '[0-9]', preg_quote($pattern, '~'));

            return preg_match('~\\A'.$expression.'\\z~', $awb) === 1;
        }));
    }

    /** @return list<string> */
    public function handle(string $awb, string $attribute = 'awb'): array
    {
        $matches = $this->matches($awb);
        if ($matches === []) {
            throw ValidationException::withMessages([$attribute => 'Format resi tidak dikenali.']);
        }

        return $matches;
    }
}
