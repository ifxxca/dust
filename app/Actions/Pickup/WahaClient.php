<?php

namespace App\Actions\Pickup;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

class WahaClient
{
    public function installed(): bool
    {
        return Schema::hasTable('document_delivery_settings') && Schema::hasTable('pickup_whatsapp_deliveries');
    }

    public function configured(): bool
    {
        return filled(config('services.waha.base_url')) && filled(config('services.waha.api_key'));
    }

    /** @return array{session: ?string, enabled: bool, version: int} */
    public function settings(): array
    {
        $row = $this->installed() ? DB::table('document_delivery_settings')->where('id', 1)->first() : null;

        if ($row === null) {
            return ['session' => null, 'enabled' => false, 'version' => 0];
        }

        return ['session' => $row->session, 'enabled' => (bool) $row->enabled, 'version' => (int) $row->version];
    }

    private function http(): PendingRequest
    {
        abort_unless($this->configured(), 503, 'Konfigurasi WAHA belum tersedia.');

        return Http::baseUrl(rtrim(config('services.waha.base_url'), '/'))->withHeaders(['X-Api-Key' => config('services.waha.api_key')])
            ->acceptJson()->asJson()->connectTimeout(3)->timeout(15)->withoutRedirecting();
    }

    /** @return list<array{name: string, status: string}> */
    public function sessions(): array
    {
        $rows = $this->http()->get('/api/sessions')->throw()->json();

        $sessions = [];
        foreach (is_array($rows) ? $rows : [] as $row) {
            if (is_array($row) && is_string($row['name'] ?? null)) {
                $sessions[] = ['name' => $row['name'], 'status' => (string) ($row['status'] ?? 'UNKNOWN')];
            }
        }

        return $sessions;
    }

    public function working(string $session): bool
    {
        return $this->http()->get('/api/sessions/'.rawurlencode($session))->throw()->json('status') === 'WORKING';
    }

    /** @return list<array{id: string, name: string}> */
    public function groups(string $session, int $page): array
    {
        $rows = $this->http()->get('/api/'.rawurlencode($session).'/groups', ['limit' => 30, 'offset' => ($page - 1) * 30, 'sortBy' => 'subject', 'sortOrder' => 'asc', 'exclude' => 'participants'])->throw()->json();
        $groups = [];
        foreach (is_array($rows) ? $rows : [] as $key => $row) {
            if (! is_array($row)) {
                continue;
            }
            $id = $row['id'] ?? $key;
            $id = is_array($id) ? ($id['_serialized'] ?? null) : $id;
            if (is_string($id) && preg_match('/^\d+(?:-\d+)?@g\.us$/', $id)) {
                $groups[] = ['id' => $id, 'name' => (string) ($row['subject'] ?? $row['name'] ?? $id)];
            }
        }

        return $groups;
    }

    public function groupExists(string $session, string $target): bool
    {
        return $this->http()->get('/api/'.rawurlencode($session).'/groups/'.rawurlencode($target))->successful();
    }

    public function readChat(string $session, string $target): Response
    {
        return $this->http()->timeout(5)->post('/api/'.rawurlencode($session).'/chats/'.rawurlencode($target).'/messages/read', ['messages' => 30, 'days' => 7]);
    }

    /** @param array<string, mixed> $part */
    public function send(string $session, string $target, array $part): Response
    {
        $body = ['session' => $session, 'chatId' => $target];
        if ($part['type'] === 'text') {
            return $this->http()->timeout(25)->post('/api/sendText', [...$body, 'text' => $part['text'], 'linkPreview' => false]);
        }

        return $this->http()->timeout(25)->post('/api/sendFile', [...$body, 'file' => ['mimetype' => $part['mimetype'], 'filename' => $part['filename'], 'data' => $part['data']]]);
    }
}
