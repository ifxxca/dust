<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schedule;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\TelescopeApplicationServiceProvider;

class TelescopeServiceProvider extends TelescopeApplicationServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void
    {
        Telescope::hideRequestParameters(['_token', 'password', 'password_confirmation', 'current_password', 'hybrid_password', 'token', 'claim_token']);
        Telescope::hideRequestHeaders(['authorization', 'cookie', 'set-cookie', 'x-csrf-token', 'x-xsrf-token', 'x-worker-token']);

        Telescope::filter(function (IncomingEntry $entry): bool {
            if (! $this->app->environment('local') || ! config('telescope.enabled')) {
                return false;
            }

            $entry->content = $this->redactSensitiveValues($entry->content);

            return true;
        });
    }

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        $this->authorization();

        if ($this->app->environment('local') && config('telescope.enabled')) {
            Schedule::command('telescope:prune --hours=24')->dailyAt('03:40')->timezone('Asia/Jakarta')->withoutOverlapping(10);
        }
    }

    protected function authorization(): void
    {
        $this->gate();

        Telescope::auth(fn (Request $request): bool => $this->app->environment('local')
            && config('telescope.enabled')
            && Gate::forUser($request->user())->allows('viewTelescope'));
    }

    protected function gate(): void
    {
        Gate::define('viewTelescope', fn (User $user): bool => $user->is_active && $user->role === 'admin_supervisor');
    }

    /**
     * @param  array<array-key, mixed>  $values
     * @return array<array-key, mixed>
     */
    private function redactSensitiveValues(array $values): array
    {
        foreach ($values as $key => $value) {
            if (is_string($key) && preg_match('/password|passwd|secret|token|authorization|cookie|api[_-]?key|credential/i', $key)) {
                $values[$key] = '********';
            } elseif (is_array($value)) {
                $values[$key] = $this->redactSensitiveValues($value);
            }
        }

        return $values;
    }
}
