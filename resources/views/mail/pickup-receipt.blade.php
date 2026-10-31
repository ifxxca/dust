@extends('mail.layout', [
    'heading' => 'Bukti pickup',
    'eyebrow' => 'Pengambilan paket',
    'preheader' => 'Pickup '.$values['customer_name'].' tercatat: '.($values['manual_hybrid'] + $values['cashless_hybrid'] + $values['css_orion']).' paket. Bukti pickup terlampir.',
])

@section('content')
    <p style="margin:0 0 6px;font-size:16px;">Yth. <strong>{{ $values['customer_name'] }}</strong>,</p>
    <p style="margin:0;color:#5a687e;font-size:15px;line-height:1.7;">Pengambilan paket Anda sudah tercatat. Berikut ringkasan bukti pickup Anda.</p>

    @if ($revision > 0)
        <p style="margin:20px 0 0;padding:12px 16px;border-left:3px solid #d97706;background-color:#fffaeb;color:#854a0e;font-size:13px;line-height:1.7;"><strong>Bukti diperbarui · versi {{ $revision }}</strong><br>Pencatatan telah dikoreksi. Foto dan tanda tangan awal tetap dipertahankan.</p>
    @endif

    @include('mail.package-summary', [
        'manual' => (int) $values['manual_hybrid'], 'cashless' => (int) $values['cashless_hybrid'], 'orion' => (int) $values['css_orion'],
        'totalLabel' => 'Total paket dijemput', 'unit' => 'paket',
    ])

    <h2 style="margin:26px 0 12px;color:#182230;font-size:15px;font-weight:700;">Detail pickup</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.65;table-layout:fixed;">
        <tr><td class="email-meta-label" valign="top" width="112" style="width:112px;padding:0 12px 10px 0;color:#5a687e;">Buku pickup</td><td valign="top" style="padding:0 0 10px;color:#182230;font-weight:700;overflow-wrap:anywhere;word-break:break-word;">PCK-{{ $record->pickup_task_id }}</td></tr>
        <tr><td class="email-meta-label" valign="top" width="112" style="width:112px;padding:0 12px 10px 0;color:#5a687e;">Waktu pickup</td><td valign="top" style="padding:0 0 10px;color:#182230;overflow-wrap:anywhere;word-break:break-word;">{{ $record->picked_up_at->setTimezone(config('pickup.timezone'))->locale('id')->translatedFormat('d M Y, H.i') }} {{ config('pickup.timezone') === 'Asia/Jakarta' ? 'WIB' : config('pickup.timezone') }}</td></tr>
        <tr><td class="email-meta-label" valign="top" width="112" style="width:112px;padding:0 12px 0 0;color:#5a687e;">Alamat pickup</td><td valign="top" style="padding:0;color:#182230;overflow-wrap:anywhere;word-break:break-word;">{{ $values['pickup_address'] }}</td></tr>
    </table>

    @if (filled($values['notes'] ?? null))
        <div style="margin-top:20px;padding:14px 16px;background-color:#f8fafc;border:1px solid #e9edf5;border-radius:8px;">
            <p style="margin:0 0 4px;color:#344054;font-size:12px;font-weight:700;">Catatan pickup</p>
            <p style="margin:0;color:#5a687e;font-size:13px;line-height:1.7;white-space:pre-line;overflow-wrap:anywhere;word-break:break-word;">{{ $values['notes'] }}</p>
        </div>
    @endif

    <h2 style="margin:26px 0 8px;color:#182230;font-size:15px;">Lampiran bukti</h2>
    <p style="margin:0;color:#5a687e;font-size:14px;line-height:1.7;">Buka lampiran pada email ini untuk melihat tanda tangan penerima dan foto pickup yang dicatat, jika ada.</p>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e9edf5;color:#5a687e;font-size:12px;line-height:1.7;">Bukti ini mencatat pengambilan paket. Verifikasi gudang dan rekap resi diproses terpisah.<br>Versi bukti: {{ $revision }}.</p>
@endsection
