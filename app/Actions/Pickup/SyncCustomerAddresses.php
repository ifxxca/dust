<?php

namespace App\Actions\Pickup;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SyncCustomerAddresses
{
    /** @return array<string, mixed> */
    public function handle(string $path, int $actorId, bool $apply = false): array
    {
        if (! is_file($path) || filesize($path) > 10 * 1024 * 1024) {
            throw ValidationException::withMessages(['file' => 'Gunakan CSV lokal maksimal 10 MB.']);
        }
        $contents = file_get_contents($path);
        if ($contents === false || ! mb_check_encoding($contents, 'UTF-8')) {
            throw ValidationException::withMessages(['file' => 'CSV harus dapat dibaca sebagai UTF-8.']);
        }
        $stream = fopen('php://temp', 'w+b');
        if ($stream === false) {
            throw new \RuntimeException('Tidak dapat membaca CSV.');
        }
        fwrite($stream, $contents);
        rewind($stream);
        $rows = [];
        try {
            $header = fgetcsv($stream, null, ',', '"', '');
            if ($header !== false) {
                $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0] ?? '');
            }
            if ($header === false || count(array_unique($header)) !== count($header) || ! in_array('kode_customer', $header, true) || ! in_array('alamat', $header, true)) {
                throw ValidationException::withMessages(['file' => 'CSV wajib memiliki kolom kode_customer dan alamat.']);
            }
            $number = 1;
            while (($cells = fgetcsv($stream, null, ',', '"', '')) !== false) {
                $number++;
                if ($cells === [null]) {
                    continue;
                }
                if (count($cells) !== count($header) || count($rows) >= 5000) {
                    throw ValidationException::withMessages(['file' => 'Struktur CSV tidak valid atau melebihi 5.000 baris.']);
                }
                $row = array_combine($header, $cells);
                $code = mb_strtoupper(trim($row['kode_customer'] ?? ''));
                $address = trim($row['alamat'] ?? '');
                if (mb_strlen($code) > 64 || mb_strlen($address) > 2000) {
                    throw ValidationException::withMessages(['file' => 'Kode atau alamat pada baris '.$number.' melebihi batas panjang.']);
                }
                $rows[] = ['row' => $number, 'code' => $code, 'address' => $address];
            }
        } finally {
            fclose($stream);
        }
        if ($rows === []) {
            throw ValidationException::withMessages(['file' => 'CSV tidak berisi data customer.']);
        }

        return DB::transaction(function () use ($rows, $contents, $path, $actorId, $apply): array {
            $actor = User::whereKey($actorId)->lockForUpdate()->firstOrFail();
            abort_unless($actor->is_active && $actor->role === 'admin_supervisor', 403);
            $summary = ['source_rows' => count($rows), 'rows_without_code' => 0, 'rows_without_address' => 0,
                'conflicting_codes' => 0, 'unmatched_codes' => 0, 'unchanged' => 0, 'to_update' => 0, 'updated' => 0];
            $groups = [];
            foreach ($rows as $row) {
                if (in_array($row['code'], ['', 'NULL'], true)) {
                    $summary['rows_without_code']++;
                } elseif ($row['address'] === '' || mb_strtoupper($row['address']) === 'NULL') {
                    $summary['rows_without_address']++;
                } else {
                    $groups[$row['code']][] = $row;
                }
            }
            $customers = Customer::orderBy('id')->lockForUpdate()->get()->groupBy(fn (Customer $customer): string => mb_strtoupper(trim($customer->customer_code ?? '')));
            $changes = [];
            $issues = [];
            foreach ($groups as $code => $values) {
                $code = (string) $code;
                $addresses = array_values(array_unique(array_column($values, 'address')));
                $matches = $customers->get($code, collect());
                if (count($addresses) !== 1 || $matches->count() > 1) {
                    $summary['conflicting_codes']++;
                    $issues[] = ['kind' => 'CONFLICTING_CODE', 'code' => $code, 'rows' => array_column($values, 'row'), 'addresses' => $addresses];

                    continue;
                }
                $customer = $matches->first();
                if ($customer === null) {
                    $summary['unmatched_codes']++;
                    $issues[] = ['kind' => 'CUSTOMER_NOT_FOUND', 'code' => $code, 'rows' => array_column($values, 'row')];

                    continue;
                }
                if ($customer->pickup_address === $addresses[0]) {
                    $summary['unchanged']++;

                    continue;
                }
                $changes[] = ['customer_id' => $customer->id, 'code' => $code, 'name' => $customer->name,
                    'previous_address' => $customer->pickup_address, 'address' => $addresses[0], 'previous_version' => $customer->version,
                    'previous_updated_by' => $customer->updated_by, 'previous_updated_at' => $customer->updated_at?->toIso8601String(), 'rows' => array_column($values, 'row')];
            }
            $summary['to_update'] = count($changes);
            $result = ['source_name' => basename($path), 'source_sha256' => hash('sha256', $contents), 'actor_id' => $actorId,
                'applied' => false, 'summary' => $summary, 'changes' => $changes, 'issues' => $issues, 'backup_path' => null];
            if ($apply && $changes !== []) {
                $backup = 'customer-address-sync/'.Str::uuid().'/before.json';
                if (! Storage::disk('local')->put($backup, json_encode($result, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
                    throw new \RuntimeException('Tidak dapat menyimpan salinan alamat sebelum perubahan.');
                }
                $result['backup_path'] = Storage::disk('local')->path($backup);
                foreach ($changes as $change) {
                    $customer = $customers->get($change['code'])->first();
                    $customer->update(['pickup_address' => $change['address'], 'version' => $customer->version + 1, 'updated_by' => $actorId]);
                    $summary['updated']++;
                }
            }
            $result['applied'] = $apply;
            $result['summary'] = $summary;

            return $result;
        }, 3);
    }
}
