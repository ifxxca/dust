<?php

namespace App\Http\Controllers;

use App\Actions\Reports\ImportJneShipperAliases;
use App\Actions\Reports\QueueJneCustomerMappings;
use App\Jobs\SyncJneCustomerMappings;
use App\Models\Customer;
use App\Models\JneMappingRun;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class JneShipperAliasController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'q' => ['nullable', 'string', 'max:100'],
            'alias_q' => ['nullable', 'string', 'max:100'], 'conflicts' => ['sometimes', 'boolean'], 'page' => ['sometimes', 'integer', 'min:1'],
            'mapping_page' => ['sometimes', 'integer', 'min:1'], 'conflict_page' => ['sometimes', 'integer', 'min:1'], 'directory_page' => ['sometimes', 'integer', 'min:1']]);
        $query = JneShipperAlias::whereNotNull('mapping_key');
        if (! empty($data['customer_id'])) {
            $query->where('customer_id', $data['customer_id']);
        } elseif (empty($data['conflicts'])) {
            $query->whereRaw('1 = 0');
        }
        $query->select('jne_shipper_aliases.*')->selectSub(DB::table('jne_shipper_aliases as other')->selectRaw('count(*)')
            ->whereNotNull('other.mapping_key')->whereColumn('other.alias_key', 'jne_shipper_aliases.alias_key')->where('other.is_active', true), 'active_candidates');
        if (! empty($data['alias_q'])) {
            $value = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], JneShipperAlias::normalize($data['alias_q'])).'%';
            $query->whereRaw("normalized_name like ? ESCAPE '!'", [$value]);
        }
        if (! empty($data['conflicts'])) {
            $query->where('is_active', true)->whereExists(fn ($other) => $other->selectRaw('1')->from('jne_shipper_aliases as duplicate')
                ->whereNotNull('duplicate.mapping_key')->whereColumn('duplicate.alias_key', 'jne_shipper_aliases.alias_key')->whereColumn('duplicate.customer_id', '!=', 'jne_shipper_aliases.customer_id')->where('duplicate.is_active', true));
        }
        $directory = Customer::query();
        if (! empty($data['q'])) {
            $value = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], trim($data['q'])).'%';
            $directory->where(fn ($match) => $match->whereRaw("name like ? ESCAPE '!'", [$value])->orWhereRaw("customer_code like ? ESCAPE '!'", [$value]));
        }
        $selected = empty($data['customer_id']) ? null : Customer::whereKey($data['customer_id'])->firstOrFail();
        $ownership = JneShipment::selectRaw('customer_match_status, count(*) as total')->groupBy('customer_match_status')->pluck('total', 'customer_match_status');
        $conflictGroups = null;
        if (! empty($data['conflicts']) && ! $selected) {
            $groups = JneShipperAlias::whereNotNull('mapping_key')->where('is_active', true)->select('alias_key', 'normalized_name')
                ->groupBy('alias_key', 'normalized_name')->havingRaw('count(*) > 1')->orderBy('normalized_name')->paginate(20, ['*'], 'conflict_page')->withQueryString();
            $candidates = JneShipperAlias::whereNotNull('mapping_key')->where('is_active', true)->whereIn('alias_key', $groups->pluck('alias_key'))
                ->with('customer:id,name,customer_code')->orderBy('customer_id')->get()->groupBy('alias_key');
            $conflictGroups = $groups->through(fn (JneShipperAlias $group): array => ['name' => $group->normalized_name,
                'customers' => $candidates->get($group->alias_key, collect())->map(fn (JneShipperAlias $alias): array => [
                    'id' => $alias->customer_id, 'name' => $alias->customer->name, 'code' => $alias->customer->customer_code])->values()]);
        }

        $mappingRuns = JneMappingRun::orderByDesc('id')->paginate(5, ['id', 'status', 'affected_count', 'error_message', 'completed_at'], 'mapping_page')->withQueryString();

        return Inertia::render('jne-shipper-aliases', [
            'aliases' => $query->with('customer:id,name,customer_code,is_active')->orderByDesc('id')->paginate(50)->withQueryString(),
            'conflictGroups' => $conflictGroups,
            'ownership' => ['total' => (int) $ownership->sum(), 'recognized' => (int) ($ownership['MATCHED'] ?? 0),
                'ambiguous' => (int) ($ownership['AMBIGUOUS'] ?? 0), 'unmatched' => (int) ($ownership['UNMATCHED'] ?? 0)],
            'directory' => $directory->select(['id', 'name', 'customer_code', 'is_active'])->withCount(['shipperAliases as alias_count' => fn ($aliases) => $aliases->where('is_active', true)])
                ->orderBy('customer_code')->orderBy('id')->paginate(30, ['*'], 'directory_page')->withQueryString(),
            'selectedCustomer' => $selected ? [...$selected->only(['id', 'name', 'customer_code', 'is_active']),
                'pickup_details_missing' => blank($selected->contact) || blank($selected->pickup_address)] : null,
            'stats' => ['customers' => Customer::count(), 'without_names' => Customer::whereDoesntHave('shipperAliases', fn ($aliases) => $aliases->where('is_active', true))->count(),
                'conflicts' => DB::query()->fromSub(JneShipperAlias::whereNotNull('mapping_key')->where('is_active', true)->select('alias_key')->groupBy('alias_key')->havingRaw('count(*) > 1'), 'conflicting_names')->count()],
            'filters' => [...['customer_id' => '', 'q' => '', 'alias_q' => '', 'conflicts' => false], ...$data],
            'mappingRuns' => $mappingRuns->items(),
            'mappingPagination' => ['current_page' => $mappingRuns->currentPage(), 'last_page' => $mappingRuns->lastPage(), 'total' => $mappingRuns->total()],
            'importResult' => $request->session()->get('jne_alias_import'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['customer_id' => ['required', 'integer', 'exists:customers,id'], 'shipper_name' => ['required', 'string', 'max:500']]);
        $normalized = JneShipperAlias::normalize($data['shipper_name']);
        if ($normalized === '' || mb_strlen($normalized) > 500) {
            throw ValidationException::withMessages(['shipper_name' => 'Isi nama pengirim, maksimal 500 karakter setelah normalisasi.']);
        }
        DB::transaction(function () use ($data, $normalized, $request): void {
            abort_unless(Customer::whereKey($data['customer_id'])->where('is_active', true)->lockForUpdate()->first() !== null, 422, 'Customer sedang dinonaktifkan.');
            $key = hash('sha256', $normalized);
            if (JneShipperAlias::whereNotNull('mapping_key')->where('customer_id', $data['customer_id'])->where('alias_key', $key)->exists()) {
                throw ValidationException::withMessages(['shipper_name' => 'Nama pengirim sudah tercatat untuk customer ini, termasuk nama nonaktif.']);
            }
            JneShipperAlias::create([...$data, 'shipper_name' => trim($data['shipper_name']), 'normalized_name' => $normalized, 'alias_key' => $key,
                'is_active' => true, 'created_by' => $request->user()->id, 'updated_by' => $request->user()->id]);
            app(QueueJneCustomerMappings::class)->handle([$normalized], $request->user()->id);
        });

        return back();
    }

    public function update(Request $request, int $alias): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['is_active' => ['required', 'boolean'], 'version' => ['required', 'integer', 'min:1']]);
        DB::transaction(function () use ($alias, $data, $request): void {
            $customerId = JneShipperAlias::whereKey($alias)->whereNotNull('mapping_key')->value('customer_id');
            Customer::whereKey($customerId)->lockForUpdate()->firstOrFail();
            $record = JneShipperAlias::whereKey($alias)->whereNotNull('mapping_key')->lockForUpdate()->firstOrFail();
            abort_if($record->version !== $data['version'], 409, 'Alias berubah. Muat ulang sebelum menyimpan.');
            $record->update(['is_active' => $data['is_active'], 'version' => $record->version + 1, 'updated_by' => $request->user()->id]);
            app(QueueJneCustomerMappings::class)->handle([$record->normalized_name], $request->user()->id);
        });

        return back();
    }

    public function import(Request $request, ImportJneShipperAliases $importer): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $request->validate(['file' => ['required', 'file', 'extensions:csv', 'mimetypes:text/plain,text/csv,application/csv,application/vnd.ms-excel', 'max:5120']]);
        $result = $importer->handle($request->file('file')->getRealPath(), $request->user());

        return back()->with('jne_alias_import', $result);
    }

    public function retrySync(Request $request, int $run): RedirectResponse
    {
        $this->authorizeAdmin($request);
        DB::transaction(function () use ($run): void {
            $record = JneMappingRun::whereKey($run)->lockForUpdate()->firstOrFail();
            if ($record->status !== 'FAILED') {
                return;
            }
            $record->update(['status' => 'QUEUED', 'error_message' => null]);
            SyncJneCustomerMappings::dispatch($record->id)->afterCommit();
        });

        return back();
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
    }
}
