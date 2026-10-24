<?php

namespace App\Actions\Reports;

use App\Models\Customer;
use App\Models\JneShipperAlias;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ImportJneShipperAliases
{
    /** @return array{inserted: int, duplicates: int} */
    public function handle(string $path, User $actor): array
    {
        $stream = fopen($path, 'rb');
        if ($stream === false) {
            throw ValidationException::withMessages(['file' => 'CSV tidak dapat dibaca.']);
        }
        try {
            $first = fgets($stream);
            rewind($stream);
            $delimiter = substr_count($first ?: '', ';') > substr_count($first ?: '', ',') ? ';' : ',';
            $header = fgetcsv($stream, null, $delimiter, '"', '');
            $header = array_map(fn ($value): string => mb_strtoupper(trim(ltrim((string) $value, "\xEF\xBB\xBF"))), $header ?: []);
            if ($header !== ['SHIPPER_NAME', 'KODE', 'NAMA_CUSTOMER']) {
                throw ValidationException::withMessages(['file' => 'Gunakan tepat tiga kolom: SHIPPER_NAME,KODE,NAMA_CUSTOMER. Ekspor kolom A–C dari Excel sebagai CSV UTF-8.']);
            }
            $rows = [];
            $line = 1;
            while (($row = fgetcsv($stream, null, $delimiter, '"', '')) !== false) {
                $line++;
                if ($row === [null]) {
                    continue;
                }
                if (count($rows) >= 10000 || count($row) !== 3 || ! mb_check_encoding(implode('', $row), 'UTF-8')) {
                    throw ValidationException::withMessages(['file' => 'CSV harus UTF-8, tepat tiga kolom, dan maksimal 10.000 baris data.']);
                }
                [$name, $code, $customerName] = array_map(fn ($value): string => trim((string) $value), $row);
                $code = mb_strtoupper($code);
                if (JneShipperAlias::normalize($name) === '' || mb_strlen($name) > 500 || mb_strlen(JneShipperAlias::normalize($name)) > 500 || $code === '' || mb_strlen($code) > 64 || $customerName === '' || str_starts_with($customerName, '#')) {
                    throw ValidationException::withMessages(['file' => "Baris {$line}: nama pengirim, kode, atau nama customer tidak valid. Perbaiki nilai kosong dan error Excel."]);
                }
                $rows[] = ['line' => $line, 'name' => $name, 'code' => $code, 'customer_name' => $customerName];
            }
        } finally {
            fclose($stream);
        }
        if ($rows === []) {
            throw ValidationException::withMessages(['file' => 'CSV tidak mempunyai baris data.']);
        }

        return DB::transaction(function () use ($actor, $rows): array {
            $customers = Customer::whereNotNull('customer_code')->orderBy('id')->lockForUpdate()->get(['id', 'customer_code', 'name', 'is_active'])
                ->groupBy(fn (Customer $customer): string => mb_strtoupper(trim($customer->customer_code)));
            $payloads = [];
            foreach ($rows as $row) {
                $matches = $customers->get($row['code']);
                $customer = $matches?->count() === 1 ? $matches->first() : null;
                if (! $customer?->is_active || JneShipperAlias::normalize($customer->name) !== JneShipperAlias::normalize($row['customer_name'])) {
                    throw ValidationException::withMessages(['file' => "Baris {$row['line']}: kode dan nama harus cocok dengan satu customer aktif di master customer. Tidak ada data yang diimpor."]);
                }
                $normalized = JneShipperAlias::normalize($row['name']);
                $payloads[] = ['customer_id' => $customer->id, 'shipper_name' => $row['name'], 'mapping_key' => hash('sha256', $customer->id.':'.hash('sha256', $normalized)),
                    'normalized_name' => $normalized, 'alias_key' => hash('sha256', $normalized), 'is_active' => true, 'version' => 1,
                    'created_by' => $actor->id, 'updated_by' => $actor->id, 'created_at' => now(), 'updated_at' => now()];
            }
            $inserted = 0;
            foreach (array_chunk($payloads, 250) as $chunk) {
                $inserted += JneShipperAlias::insertOrIgnore($chunk);
            }

            if ($inserted > 0) {
                app(QueueJneCustomerMappings::class)->handle(array_column($payloads, 'normalized_name'), $actor->id);
            }

            return ['inserted' => $inserted, 'duplicates' => count($rows) - $inserted];
        });
    }
}
