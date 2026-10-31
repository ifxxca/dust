<?php

namespace App\Console\Commands;

use App\Actions\Pickup\SyncCustomerAddresses;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

#[Signature('customers:sync-addresses {csv : CSV containing kode_customer and alamat} {--actor= : Active Admin ID} {--apply : Update unambiguous existing customer addresses}')]
#[Description('Sync master pickup addresses by exact customer code, skipping conflicting codes and preserving a private backup')]
class SyncCustomerAddressesCommand extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(SyncCustomerAddresses $sync): int
    {
        if (! ctype_digit((string) $this->option('actor'))) {
            $this->error('Gunakan --actor=ID Admin yang aktif.');

            return self::FAILURE;
        }
        try {
            $result = $sync->handle($this->argument('csv'), (int) $this->option('actor'), (bool) $this->option('apply'));
        } catch (ValidationException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
        $report = 'customer-address-sync/'.Str::uuid().'/result.json';
        if (! Storage::disk('local')->put($report, json_encode($result, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
            throw new \RuntimeException('Tidak dapat menyimpan laporan sinkronisasi alamat.');
        }
        $this->info($result['applied'] ? 'ADDRESSES_SYNCED' : 'PREVIEW_ONLY');
        foreach ($result['summary'] as $key => $value) {
            $this->line($key.'='.$value);
        }
        $this->line('report='.Storage::disk('local')->path($report));
        if ($result['backup_path'] !== null) {
            $this->line('backup='.$result['backup_path']);
        }

        return self::SUCCESS;
    }
}
