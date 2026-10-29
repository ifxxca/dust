<?php

namespace App\Console\Commands;

use App\Actions\Pickup\ImportPickupHistory;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ImportPickupHistoryCommand extends Command
{
    protected $signature = 'pickup-history:import {manifest : Private JSON extracted from the workbook} {--actor= : Active Admin ID} {--apply : Persist the import} {--archive-customers : Preserve unresolved customer identities as inactive separate archives} {--follow-master : Use existing master identity for resolved customer codes}';

    protected $description = 'Preview or import pickup history without sending receipts';

    public function handle(ImportPickupHistory $importer): int
    {
        $path = $this->argument('manifest');
        if (! is_file($path) || filesize($path) > 20 * 1024 * 1024 || ! ctype_digit((string) $this->option('actor'))) {
            $this->error('Gunakan manifest JSON lokal maksimal 20 MB dan --actor=ID Admin aktif.');

            return self::FAILURE;
        }
        try {
            $data = json_decode(File::get($path), true, 512, JSON_THROW_ON_ERROR);
            if (! is_array($data)) {
                throw new \JsonException('Manifest harus object JSON.');
            }
            $result = $importer->handle($data, (int) $this->option('actor'), (bool) $this->option('apply'), (bool) $this->option('archive-customers'), (bool) $this->option('follow-master'));
        } catch (ValidationException $exception) {
            foreach ($exception->errors() as $messages) {
                $this->error(implode(' ', $messages));
            }

            return self::FAILURE;
        } catch (\JsonException) {
            $this->error('Manifest bukan JSON yang valid.');

            return self::FAILURE;
        }
        $report = 'pickup-imports/results/'.Str::uuid().'.json';
        if (! Storage::disk('local')->put($report, json_encode($result, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
            throw new \RuntimeException('Hasil impor tidak dapat disimpan.');
        }
        $this->info($result['applied'] ? 'IMPORT_APPLIED' : 'PREVIEW_ONLY');
        foreach ($result['summary'] as $key => $value) {
            $this->line($key.'='.$value);
        }
        $this->line('review='.Storage::disk('local')->path($report));

        return $result['summary']['conflicts'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
