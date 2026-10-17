<?php

namespace App\Console\Commands;

use App\Actions\Fortify\RevokeMobileTokens;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

#[Signature('mobile:revoke-device {user : Account ID} {installation : Installation UUID} {--admin= : Active administrator ID} {--reason= : Audit reason without credentials or customer data}')]
#[Description('Revoke mobile authentication and push registration for one lost installation using privileged server access.')]
class RevokeMobileDevice extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(RevokeMobileTokens $action): int
    {
        $values = ['user' => $this->argument('user'), 'installation' => strtolower((string) $this->argument('installation')), 'admin' => $this->option('admin'), 'reason' => trim((string) $this->option('reason'))];
        if (Validator::make($values, ['user' => ['required', 'integer', 'exists:users,id'], 'installation' => ['required', 'uuid'], 'admin' => ['required', 'integer', 'exists:users,id'], 'reason' => ['required', 'string', 'max:500']])->fails()) {
            $this->error('Account/admin ID, installation UUID dan alasan audit yang valid wajib diberikan.');

            return self::FAILURE;
        }
        $count = DB::transaction(function () use ($values, $action): ?int {
            $administrator = User::whereKey($values['admin'])->lockForUpdate()->firstOrFail();
            if (! $administrator->is_active || $administrator->role !== 'admin_supervisor') {
                return null;
            }

            return $action->handle(User::findOrFail($values['user']), $values['installation']);
        }, 3);
        if ($count === null) {
            $this->error('Administrator aktif diperlukan.');

            return self::FAILURE;
        }
        Log::notice('mobile.device_revoked', ['administrator_id' => (int) $values['admin'], 'user_id' => (int) $values['user'], 'installation_id' => $values['installation'], 'reason' => $values['reason'], 'tokens_revoked' => $count]);
        $this->info('Revocation selesai: '.$count.' token. Perangkat lain tetap memiliki sesi masing-masing.');

        return self::SUCCESS;
    }
}
