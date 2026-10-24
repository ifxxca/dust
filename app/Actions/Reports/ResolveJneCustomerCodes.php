<?php

namespace App\Actions\Reports;

use App\Models\Customer;
use App\Models\JneCustomerCodeAlias;
use App\Models\JneReportAwb;
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
            if (! is_string($raw) || trim($raw) === '') {
                continue;
            }
            $code = trim($raw);
            if (preg_match('/^="(.*)"$/sD', $code, $match)) {
                $code = str_replace('""', '"', $match[1]);
            }
            $code = JneCustomerCodeAlias::normalize(ltrim($code, "'"));
            $inputs[$source->id] = ['code' => $code, 'raw' => $raw, 'contract' => $contract, 'source' => $source];
        }
        if ($inputs === []) {
            return [];
        }
        $codes = array_unique(array_column($inputs, 'code'));
        $customers = collect();
        foreach (array_chunk($codes, 500) as $chunk) {
            $customers = $customers->concat(Customer::where('is_active', true)->whereIn(DB::raw('UPPER(TRIM(customer_code))'), $chunk)->get(['id', 'name', 'customer_code']));
        }
        $aliases = JneCustomerCodeAlias::where('is_active', true)->whereNotNull('verified_at')->whereIn('normalized_code', $codes)->get();
        $activeAliasCustomers = Customer::whereIn('id', $aliases->pluck('customer_id'))->where('is_active', true)->pluck('id')->all();
        $catalog = Customer::where('is_active', true)->whereNotNull('customer_code')->orderBy('id')->limit(5001)->get(['id', 'name', 'customer_code']);
        $aliasCatalog = JneCustomerCodeAlias::where('is_active', true)->whereNotNull('verified_at')->whereHas('customer', fn ($query) => $query->where('is_active', true))->with('customer:id,name,customer_code')->orderBy('id')->limit(5001)->get();
        $result = [];
        foreach ($inputs as $id => $input) {
            $owners = [];
            $evidence = [['source_id' => $id, 'contract_id' => $input['contract']->id, 'contract_revision' => $input['contract']->revision, 'original_code' => $input['raw']]];
            foreach ($customers as $customer) {
                if (JneCustomerCodeAlias::normalize($customer->customer_code ?? '') === $input['code']) {
                    $owners[] = $customer->id;
                    $evidence[] = ['source_id' => $id, 'contract_id' => $input['contract']->id, 'contract_revision' => $input['contract']->revision, 'original_code' => $input['raw'], 'registered_code' => $customer->customer_code, 'customer_id' => $customer->id];
                }
            }
            foreach ($aliases as $alias) {
                if ($alias->normalized_code === $input['code'] && $this->scope->allows($alias, $input['source']) && in_array($alias->customer_id, $activeAliasCustomers, true)) {
                    $owners[] = $alias->customer_id;
                    $evidence[] = ['source_id' => $id, 'contract_id' => $input['contract']->id, 'contract_revision' => $input['contract']->revision, 'code_alias_id' => $alias->id, 'code_alias_version' => $alias->version, 'original_code' => $input['raw'], 'registered_code' => $alias->code, 'customer_id' => $alias->customer_id];
                }
            }
            $owners = array_values(array_unique($owners));
            $candidates = [];
            if ($owners === [] && $catalog->count() + $aliasCatalog->count() <= 5000 && strlen($input['code']) >= 3 && strlen($input['code']) <= 64) {
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
            }
            $result[$id] = ['customer_id' => count($owners) === 1 ? $owners[0] : null,
                'status' => count($owners) > 1 ? 'CONFLICT' : ($owners !== [] ? 'MATCHED' : ($candidates !== [] ? 'CANDIDATE' : 'UNMATCHED')),
                'method' => 'CUSTOMER_CODE', 'note' => 'Exact registered code and verified code aliases are checked independently of the account.',
                'evidence' => $evidence, 'candidates' => $candidates];
        }

        return $result;
    }
}
