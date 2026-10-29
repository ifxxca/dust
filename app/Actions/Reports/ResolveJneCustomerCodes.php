<?php

namespace App\Actions\Reports;

use App\Models\Customer;
use App\Models\JneCustomerCodeAlias;
use App\Models\JneReportAwb;
use App\Models\JneShipperAlias;
use App\Models\JneSourceContract;
use App\Models\ReportJob;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ResolveJneCustomerCodes
{
    public function __construct(private JneEvidenceScope $scope) {}

    /** @param Collection<int, JneReportAwb> $sources
     * @return array<int, array<string, mixed>>
     */
    public function handle(Collection $sources): array
    {
        if (! config('jne-reports.evidence_policies_enabled')) {
            return [];
        }
        $jobs = ReportJob::whereIn('id', $sources->pluck('report_job_id'))->get(['id', 'source', 'report_type'])->keyBy('id');
        $contracts = JneSourceContract::whereNotNull('active_key')->whereNotNull('verified_at')->get()->keyBy('active_key');
        $inputs = [];
        foreach ($sources as $source) {
            $job = $jobs->get($source->report_job_id);
            $contract = $job ? $contracts->get(JneSourceContract::key($job->source, $job->report_type)) : null;
            $column = $contract?->definition['customer_code_column'] ?? null;
            $raw = is_string($column) ? ($source->raw_data[$column] ?? null) : null;
            if ($contract !== null && is_string($raw) && trim($raw) !== '') {
                $code = trim($raw);
                if (preg_match('/^="(.*)"$/sD', $code, $match)) {
                    $code = str_replace('""', '"', $match[1]);
                }
                $code = JneCustomerCodeAlias::normalize(ltrim($code, "'"));
                $inputs[] = ['code' => $code, 'source' => $source, 'method' => 'CUSTOMER_CODE',
                    'evidence' => ['source_id' => $source->id, 'contract_id' => $contract->id, 'contract_revision' => $contract->revision, 'original_code' => $raw]];
            }
            $shipperName = JneShipperAlias::normalize($source->shipper_name ?? '');
            if (preg_match('/^([0-9][A-Z0-9_-]{0,63})(?: |$)/D', $shipperName, $prefix)) {
                $inputs[] = ['code' => $prefix[1], 'source' => $source, 'method' => 'SHIPPER_CODE_PREFIX',
                    'evidence' => ['source_id' => $source->id, 'method' => 'SHIPPER_CODE_PREFIX', 'column' => 'SHIPPER_NAME', 'original_value' => $source->shipper_name, 'original_code' => $prefix[1]]];
            }
        }
        if ($inputs === []) {
            return [];
        }
        $codes = array_values(array_unique(array_column($inputs, 'code')));
        $customers = collect();
        foreach (array_chunk($codes, 500) as $chunk) {
            $customers = $customers->concat(Customer::where('is_active', true)->whereIn(DB::raw('UPPER(TRIM(customer_code))'), $chunk)->get(['id', 'name', 'customer_code']));
        }
        $aliases = JneCustomerCodeAlias::where('is_active', true)->whereNotNull('verified_at')->whereIn('normalized_code', $codes)->get();
        $activeAliasCustomers = Customer::whereIn('id', $aliases->pluck('customer_id'))->where('is_active', true)->pluck('id')->all();
        $catalog = Customer::where('is_active', true)->whereNotNull('customer_code')->orderBy('id')->limit(5001)->get(['id', 'name', 'customer_code']);
        $aliasCatalog = JneCustomerCodeAlias::where('is_active', true)->whereNotNull('verified_at')->whereHas('customer', fn ($query) => $query->where('is_active', true))->with('customer:id,name,customer_code')->orderBy('id')->limit(5001)->get();
        $customersByCode = $customers->groupBy(fn (Customer $customer): string => JneCustomerCodeAlias::normalize($customer->customer_code ?? ''));
        $aliasesByCode = $aliases->groupBy('normalized_code');
        $shipperAliasesByCode = $this->shipperAliasesByCode($codes);
        $suggestions = [];
        $result = [];
        foreach ($inputs as $input) {
            $id = $input['source']->id;
            $owners = [];
            $evidence = [$input['evidence']];
            $usedShipperAlias = false;
            foreach ($customersByCode->get($input['code'], collect()) as $customer) {
                if (JneCustomerCodeAlias::normalize($customer->customer_code ?? '') === $input['code']) {
                    $owners[] = $customer->id;
                    $evidence[] = [...$input['evidence'], 'registered_code' => $customer->customer_code, 'customer_id' => $customer->id];
                }
            }
            foreach ($aliasesByCode->get($input['code'], collect()) as $alias) {
                if ($alias->normalized_code === $input['code'] && $this->scope->allows($alias, $input['source']) && in_array($alias->customer_id, $activeAliasCustomers, true)) {
                    $owners[] = $alias->customer_id;
                    $evidence[] = [...$input['evidence'], 'code_alias_id' => $alias->id, 'code_alias_version' => $alias->version, 'registered_code' => $alias->code, 'customer_id' => $alias->customer_id];
                }
            }
            if ($input['method'] === 'SHIPPER_CODE_PREFIX') {
                foreach ($shipperAliasesByCode->get($input['code'], collect()) as $alias) {
                    if ($this->scope->allows($alias, $input['source'])) {
                        $owners[] = $alias->customer_id;
                        $usedShipperAlias = true;
                        $evidence[] = [...$input['evidence'], 'shipper_alias_id' => $alias->id, 'shipper_alias_version' => $alias->version,
                            'registered_name' => $alias->shipper_name, 'registered_code' => $alias->customer->customer_code, 'customer_id' => $alias->customer_id];
                    }
                }
            }
            $owners = array_values(array_unique($owners));
            $candidates = [];
            $suggestionKey = hash('sha256', json_encode([$input['code'], $input['source']->customer_account, $input['source']->entry_at?->toIso8601String()], JSON_THROW_ON_ERROR));
            if (isset($suggestions[$suggestionKey])) {
                $candidates = $suggestions[$suggestionKey];
            } elseif ($owners === [] && count($suggestions) < 100 && $catalog->count() + $aliasCatalog->count() <= 5000 && strlen($input['code']) >= 3 && strlen($input['code']) <= 64) {
                foreach ($catalog as $customer) {
                    $distance = levenshtein($input['code'], JneCustomerCodeAlias::normalize($customer->customer_code ?? ''));
                    if ($distance === 1) {
                        $candidates[] = ['customer_id' => $customer->id, 'customer_code' => $customer->customer_code, 'customer_name' => $customer->name, 'registered_name' => $customer->customer_code, 'distance' => $distance, 'reason' => 'Similar registered code; candidate only.'];
                    }
                    if (count($candidates) === 5) {
                        break;
                    }
                }
                foreach ($aliasCatalog as $alias) {
                    if ($this->scope->allows($alias, $input['source']) && levenshtein($input['code'], $alias->normalized_code) === 1) {
                        $candidates[] = ['customer_id' => $alias->customer_id, 'customer_code' => $alias->customer->customer_code, 'customer_name' => $alias->customer->name, 'registered_name' => $alias->code, 'distance' => 1, 'reason' => 'Similar registered code alias; candidate only.'];
                    }
                }
                $candidates = collect($candidates)->unique('customer_id')->take(5)->values()->all();
                $suggestions[$suggestionKey] = $candidates;
            }
            $decision = ['customer_id' => count($owners) === 1 ? $owners[0] : null,
                'status' => count($owners) > 1 ? 'CONFLICT' : ($owners !== [] ? 'MATCHED' : ($candidates !== [] ? 'CANDIDATE' : 'UNMATCHED')),
                'method' => $usedShipperAlias ? 'SHIPPER_ALIAS_CODE' : $input['method'],
                'note' => $usedShipperAlias ? 'Kode berakhiran huruf dikenali dari alias pengirim aktif milik kode dasar customer yang sama.' : ($input['method'] === 'SHIPPER_CODE_PREFIX' ? 'Kode awal nama pengirim diperiksa persis terhadap master customer dan alias kode terverifikasi.' : 'Exact registered code and verified code aliases are checked independently of the account.'),
                'evidence' => $evidence, 'candidates' => $candidates];
            $result[$id] = $this->combine($result[$id] ?? null, $decision);
        }

        return $result;
    }

    /**
     * @param  list<string>  $codes
     * @return Collection<array-key, Collection<int, JneShipperAlias>>
     */
    private function shipperAliasesByCode(array $codes): Collection
    {
        $suffixCodes = array_values(array_filter($codes, fn (string $code): bool => preg_match('/^[0-9]+[A-Z]+$/D', $code) === 1));
        if ($suffixCodes === []) {
            return collect();
        }
        $codeSet = array_fill_keys($suffixCodes, true);

        return JneShipperAlias::whereNotNull('mapping_key')->where('is_active', true)
            ->whereHas('customer', fn ($query) => $query->where('is_active', true))
            ->with('customer:id,customer_code')->get()->toBase()
            ->filter(function (JneShipperAlias $alias) use ($codeSet): bool {
                return preg_match('/^(([0-9]+)[A-Z]+)(?: |$)/D', $alias->normalized_name, $prefix) === 1
                    && isset($codeSet[$prefix[1]])
                    && JneCustomerCodeAlias::normalize($alias->customer->customer_code ?? '') === $prefix[2];
            })->groupBy(function (JneShipperAlias $alias): string {
                return explode(' ', $alias->normalized_name, 2)[0];
            });
    }

    /**
     * @param  array<string, mixed>|null  $previous
     * @param  array<string, mixed>  $decision
     * @return array<string, mixed>
     */
    private function combine(?array $previous, array $decision): array
    {
        if ($previous === null) {
            return $decision;
        }
        $evidence = [...$previous['evidence'], ...$decision['evidence']];
        if ($previous['status'] === 'CONFLICT' || $decision['status'] === 'CONFLICT'
            || ($previous['status'] === 'MATCHED' && $decision['status'] === 'MATCHED' && $previous['customer_id'] !== $decision['customer_id'])) {
            return [...$previous, 'customer_id' => null, 'status' => 'CONFLICT', 'evidence' => $evidence,
                'note' => 'Beberapa bukti kode menunjuk pemilik customer berbeda; perlu pemeriksaan.'];
        }
        if ($previous['status'] === 'MATCHED') {
            return [...$previous, 'evidence' => $evidence];
        }
        if ($decision['status'] === 'MATCHED' || $decision['status'] === 'CANDIDATE') {
            return [...$decision, 'evidence' => $evidence];
        }

        return [...$previous, 'evidence' => $evidence];
    }
}
