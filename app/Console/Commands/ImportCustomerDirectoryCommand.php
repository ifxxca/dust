<?php

namespace App\Console\Commands;

use App\Actions\Reports\ImportCustomerDirectory;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ImportCustomerDirectoryCommand extends Command
{
    protected $signature = 'jne-customers:import {manifest : Private JSON extracted from the workbook} {--actor= : Existing active Admin ID} {--apply : Persist the previewed customer directory}';

    protected $description = 'Preview or import customer codes and shipper names without changing existing customer identities';

    /**
     * Execute the console command.
     */
    public function handle(ImportCustomerDirectory $importer): int
    {
        $path = $this->argument('manifest');
        if (! is_file($path) || filesize($path) > 10 * 1024 * 1024 || ! ctype_digit((string) $this->option('actor'))) {
            $this->error('Gunakan manifest JSON lokal maksimal 10 MB dan --actor=ID Admin yang aktif.');

            return self::FAILURE;
        }
        try {
            $data = json_decode(File::get($path), true, 512, JSON_THROW_ON_ERROR);
            if (! is_array($data)) {
                throw new \JsonException('Manifest harus berupa object JSON.');
            }
            $result = $importer->handle($data, (int) $this->option('actor'), (bool) $this->option('apply'));
        } catch (ValidationException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        } catch (\JsonException) {
            $this->error('Manifest bukan JSON yang valid.');

            return self::FAILURE;
        }
        $directory = 'jne-imports/'.Str::uuid();
        $disk = Storage::disk('local');
        if (! $disk->put($directory.'/result.json', json_encode($result, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
            throw new \RuntimeException('Tidak dapat menyimpan hasil impor privat.');
        }
        $stream = fopen('php://temp', 'w+b');
        if ($stream === false) {
            throw new \RuntimeException('Tidak dapat menyiapkan hasil pemeriksaan impor.');
        }
        fputcsv($stream, ['JENIS', 'BARIS_EXCEL', 'KODE_CUSTOMER', 'KETERANGAN'], ',', '"', '');
        foreach ($result['issues'] as $issue) {
            $cells = array_map(function (mixed $value): string {
                $text = (string) $value;

                return preg_match('/^[=+@\-\t\r]/', $text) ? "'".$text : $text;
            }, array_values($issue));
            fputcsv($stream, $cells, ',', '"', '');
        }
        rewind($stream);
        if (! $disk->put($directory.'/review.csv', $stream)) {
            fclose($stream);
            throw new \RuntimeException('Tidak dapat menyimpan hasil pemeriksaan impor privat.');
        }
        fclose($stream);
        $this->info($result['applied'] ? 'IMPORT_APPLIED' : 'PREVIEW_ONLY');
        foreach ($result['summary'] as $key => $value) {
            $this->line($key.'='.$value);
        }
        $this->line('review='.$disk->path($directory.'/review.csv'));

        return self::SUCCESS;
    }
}
