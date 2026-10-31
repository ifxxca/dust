@extends('mail.layout', [
    'heading' => 'Rekap kiriman Anda',
    'eyebrow' => 'Daftar resi pengiriman',
    'preheader' => 'Rekap kiriman '.$manifest->snapshot['customer_name'].' siap. Daftar resi lengkap terlampir dalam format Excel dan PDF.',
])

@section('content')
    <p style="margin:0 0 6px;font-size:16px;">Yth. <strong>{{ $manifest->snapshot['customer_name'] }}</strong>,</p>
    <p style="margin:0;color:#5a687e;font-size:15px;line-height:1.7;">Rekap resi untuk pickup Anda sudah selesai dicocokkan. Daftar lengkap tersedia pada dua lampiran email ini.</p>

    @include('mail.package-summary', [
        'manual' => (int) ($manifest->snapshot['categories']['manual_hybrid']['confirmed'] ?? 0),
        'cashless' => (int) ($manifest->snapshot['categories']['cashless_hybrid']['confirmed'] ?? 0),
        'orion' => (int) ($manifest->snapshot['categories']['css_orion']['confirmed'] ?? 0),
        'totalLabel' => 'Total resi terkonfirmasi', 'unit' => 'resi unik',
    ])

    <h2 style="margin:26px 0 12px;color:#182230;font-size:15px;font-weight:700;">Detail rekap</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.65;table-layout:fixed;">
        <tr><td class="email-meta-label" valign="top" width="112" style="width:112px;padding:0 12px 10px 0;color:#5a687e;">Tanggal pickup</td><td valign="top" style="padding:0 0 10px;color:#182230;">{{ \Carbon\CarbonImmutable::parse($manifest->snapshot['pickup_date'])->locale('id')->translatedFormat('d M Y') }}</td></tr>
        <tr><td class="email-meta-label" valign="top" width="112" style="width:112px;padding:0 12px 10px 0;color:#5a687e;">Referensi</td><td valign="top" style="padding:0 0 10px;color:#182230;font-size:13px;overflow-wrap:anywhere;word-break:break-all;">{{ $manifest->snapshot['reference'] }}</td></tr>
        <tr><td class="email-meta-label" valign="top" width="112" style="width:112px;padding:0 12px 0 0;color:#5a687e;">Versi dokumen</td><td valign="top" style="padding:0;color:#182230;">{{ $manifest->revision }}</td></tr>
    </table>

    <h2 style="margin:26px 0 12px;color:#182230;font-size:15px;">Dokumen terlampir</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #dfe5f0;border-radius:10px;">
        <tr>
            <td width="60" valign="middle" style="width:60px;padding:16px 0 16px 16px;"><span style="display:inline-block;padding:6px 8px;border-radius:5px;background-color:#eaf7f0;color:#176543;font-size:11px;font-weight:700;letter-spacing:0.5px;">XLSX</span></td>
            <td style="padding:16px 16px 16px 10px;"><p style="margin:0;color:#182230;font-size:14px;font-weight:700;">Daftar resi · Excel</p><p style="margin:2px 0 0;color:#5a687e;font-size:12px;line-height:1.6;">Untuk pencarian, filter, dan arsip data.</p></td>
        </tr>
        <tr>
            <td width="60" valign="middle" style="width:60px;padding:16px 0 16px 16px;border-top:1px solid #e9edf5;"><span style="display:inline-block;padding:6px 10px;border-radius:5px;background-color:#fff0ed;color:#aa3620;font-size:11px;font-weight:700;letter-spacing:0.5px;">PDF</span></td>
            <td style="padding:16px 16px 16px 10px;border-top:1px solid #e9edf5;"><p style="margin:0;color:#182230;font-size:14px;font-weight:700;">Daftar resi · PDF</p><p style="margin:2px 0 0;color:#5a687e;font-size:12px;line-height:1.6;">Untuk dibaca, dibagikan, atau dicetak.</p></td>
        </tr>
    </table>
    <p style="margin:12px 0 0;color:#5a687e;font-size:12px;line-height:1.7;">Buka dokumen melalui lampiran email. Excel dan PDF memuat daftar resi yang sama.</p>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e9edf5;color:#5a687e;font-size:12px;line-height:1.7;">Terima kasih telah mempercayakan pengiriman Anda kepada JNE Puri Mansion.</p>
@endsection
