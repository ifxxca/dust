<?php

namespace App\Actions\Fortify;

use App\Models\MobilePushDevice;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class RevokeMobileTokens
{
    public function handle(User $user, ?string $installation = null): int
    {
        return DB::transaction(function () use ($user, $installation): int {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $tokens = $locked->tokens()->where('name', 'like', $installation === null ? 'mobile:%' : 'mobile:'.strtolower($installation).':%');
            MobilePushDevice::where('user_id', $locked->id)->whereIn('personal_access_token_id', $tokens->pluck('id'))->update(['is_active' => false]);

            return $tokens->delete();
        }, 3);
    }
}
