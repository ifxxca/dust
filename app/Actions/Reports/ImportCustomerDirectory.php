<?php

namespace App\Actions\Reports;

use App\Models\Customer;
use App\Models\JneShipperAlias;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class ImportCustomerDirectory
{
    /**
     * @param  array<string, mixed>  $input
     * @return array{source_name: string, source_sha256: string, applied: bool, summary: array<string, int>, issues: list<array{kind: string, row: int, code: string, detail: string}>}
     */
    public function handle(array $input, int $actorId, bool $apply = false): array
    {
        $data = Validator::make($input, [
            'source_name' => ['required', 'string', 'max:255'], 'source_sha256' => ['required', 'regex:/^[a-f0-9]{64}$/'],
            'customers' => ['required', 'array', 'min:1', 'max:5000'], 'customers.*' => ['required', 'array:code,name,row'],
            'customers.*.code' => ['required', 'string', 'max:64'], 'customers.*.name' => ['required', 'string', 'max:255'], 'customers.*.row' => ['required', 'integer', 'min:2'],
            'aliases' => ['required', 'array', 'min:1', 'max:10000'], 'aliases.*' => ['required', 'array:shipper_name,code,source_customer_name,row'],
            'aliases.*.shipper_name' => ['required', 'string', 'max:500'], 'aliases.*.code' => ['required', 'string', 'max:64'],
            'aliases.*.source_customer_name' => ['present', 'string', 'max:500'], 'aliases.*.row' => ['required', 'integer', 'min:2'],
        ])->validate();
        $master = [];
        foreach ($data['customers'] as $row) {
            $code = mb_strtoupper(trim($row['code']));
            if ($code === '' || str_starts_with(trim($row['name']), '#') || (isset($master[$code]) && JneShipperAlias::normalize($master[$code]['name']) !== JneShipperAlias::normalize($row['name']))) {
                throw ValidationException::withMessages(['customers' => 'Master harus mempunyai satu nama yang valid untuk setiap kode customer.']);
            }
            $master[$code] = [...$row, 'code' => $code, 'name' => trim($row['name'])];
        }

        return DB::transaction(function () use ($data, $master, $actorId, $apply): array {
            $actor = User::whereKey($actorId)->lockForUpdate()->firstOrFail();
            abort_unless($actor->is_active && $actor->role === 'admin_supervisor', 403);
            $existing = Customer::orderBy('id')->lockForUpdate()->get()->groupBy(fn (Customer $customer): string => mb_strtoupper(trim($customer->customer_code ?? '')));
            $issues = [];
            $summary = ['master_customers' => count($master), 'customers_new' => 0, 'customers_existing' => 0, 'customers_skipped' => 0,
                'customers_missing_pickup_details' => 0, 'source_alias_rows' => count($data['aliases']), 'aliases_new' => 0, 'aliases_existing' => 0,
                'duplicate_rows' => 0, 'aliases_skipped' => 0, 'canonical_name_corrections' => 0, 'ambiguous_names' => 0];
            $targets = [];
            foreach ($master as $code => $row) {
                $matches = $existing->get($code, collect());
                $customer = $matches->count() === 1 ? $matches->first() : null;
                if ($matches->count() > 1 || ($customer && (! $customer->is_active || JneShipperAlias::normalize($customer->name) !== JneShipperAlias::normalize($row['name'])))) {
                    $summary['customers_skipped']++;
                    $issues[] = ['kind' => 'EXISTING_CUSTOMER_CONFLICT', 'row' => $row['row'], 'code' => (string) $code, 'detail' => 'Kode sudah ada dengan nama berbeda atau customer dinonaktifkan. Data lama dan alias kode ini tidak diubah.'];

                    continue;
                }
                if (! $customer) {
                    $summary['customers_new']++;
                    $summary['customers_missing_pickup_details']++;
                    if ($apply) {
                        $customer = Customer::create(['customer_code' => $row['code'], 'name' => $row['name'], 'pickup_address' => '', 'contact' => '',
                            'is_active' => true, 'created_by' => $actor->id, 'updated_by' => $actor->id]);
                    }
                } else {
                    $summary['customers_existing']++;
                    if (blank($customer->pickup_address) || blank($customer->contact)) {
                        $summary['customers_missing_pickup_details']++;
                    }
                }
                $targets[$code] = $customer;
            }
            $existingAliases = JneShipperAlias::whereNotNull('mapping_key')->with('customer:id,customer_code')->get();
            $pairs = [];
            $owners = [];
            foreach ($existingAliases as $alias) {
                $code = mb_strtoupper(trim($alias->customer->customer_code ?? ''));
                $pairs[$code.':'.$alias->alias_key] = true;
                if ($alias->is_active) {
                    $owners[$alias->normalized_name][$code] = true;
                }
            }
            $sourcePairs = [];
            $inserts = [];
            foreach ($data['aliases'] as $row) {
                $code = mb_strtoupper(trim($row['code']));
                $name = JneShipperAlias::normalize($row['shipper_name']);
                if ($name === '' || mb_strlen($name) > 500 || ! array_key_exists($code, $targets)) {
                    $summary['aliases_skipped']++;
                    $issues[] = ['kind' => 'UNRESOLVED_CUSTOMER', 'row' => $row['row'], 'code' => $code, 'detail' => 'Nama pengirim tidak valid, kode tidak ada di master, atau kode customer perlu pemeriksaan.'];

                    continue;
                }
                if (JneShipperAlias::normalize($row['source_customer_name']) !== JneShipperAlias::normalize($master[$code]['name'])) {
                    $summary['canonical_name_corrections']++;
                    $issues[] = ['kind' => 'MASTER_NAME_USED', 'row' => $row['row'], 'code' => $code,
                        'detail' => 'Nama pada daftar alias: '.$row['source_customer_name'].'; nama master yang dipakai: '.$master[$code]['name']];
                }
                $aliasKey = hash('sha256', $name);
                $pair = $code.':'.$aliasKey;
                if (isset($sourcePairs[$pair])) {
                    $summary['duplicate_rows']++;

                    continue;
                }
                $sourcePairs[$pair] = true;
                if (isset($pairs[$pair])) {
                    $summary['aliases_existing']++;

                    continue;
                }
                $summary['aliases_new']++;
                $owners[$name][$code] = true;
                if ($apply) {
                    $id = $targets[$code]->id;
                    $inserts[] = ['customer_id' => $id, 'shipper_name' => trim($row['shipper_name']), 'normalized_name' => $name, 'alias_key' => $aliasKey,
                        'mapping_key' => hash('sha256', $id.':'.$aliasKey), 'is_active' => true, 'version' => 1, 'created_by' => $actor->id,
                        'updated_by' => $actor->id, 'created_at' => now(), 'updated_at' => now()];
                }
            }
            foreach ($owners as $name => $codes) {
                if (count($codes) > 1) {
                    $summary['ambiguous_names']++;
                    $issues[] = ['kind' => 'AMBIGUOUS_SHIPPER', 'row' => 0, 'code' => implode(', ', array_keys($codes)), 'detail' => $name];
                }
            }
            foreach (array_chunk($inserts, 250) as $chunk) {
                JneShipperAlias::insert($chunk);
            }

            return ['source_name' => $data['source_name'], 'source_sha256' => $data['source_sha256'], 'applied' => $apply, 'summary' => $summary, 'issues' => $issues];
        }, 3);
    }
}
