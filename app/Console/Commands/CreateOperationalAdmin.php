<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

#[Signature('app:create-operational-admin {email} {--name=Admin Retail}')]
#[Description('Provision an operational admin with a password from M1_ADMIN_PASSWORD (or a hidden prompt).')]
class CreateOperationalAdmin extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $email = strtolower((string) $this->argument('email'));
        $password = getenv('M1_ADMIN_PASSWORD') ?: ($this->input->isInteractive() ? $this->secret('Password') : null);
        $validator = Validator::make(['email' => $email, 'password' => $password], ['email' => ['required', 'email', 'unique:users,email'], 'password' => ['required', 'string', 'min:12']]);
        if ($validator->fails()) {
            $this->error('Email harus unik/valid dan password minimal 12 karakter. Gunakan M1_ADMIN_PASSWORD untuk mode non-interaktif.');

            return self::FAILURE;
        }
        User::create(['name' => $this->option('name'), 'email' => $email, 'password' => $password, 'role' => 'admin_supervisor', 'is_active' => true]);
        $this->info('Admin dibuat. Tidak ada password yang dicetak.');

        return self::SUCCESS;
    }
}
