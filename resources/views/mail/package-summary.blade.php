<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0 0;">
    <tr>
        <td style="padding:20px 22px;background-color:#edf4ff;border:1px solid #d4e4ff;border-radius:12px;">
            <p style="margin:0;color:#334e7d;font-size:13px;font-weight:700;">{{ $totalLabel }}</p>
            <p style="margin:2px 0 0;color:#155eef;font-size:42px;font-weight:700;line-height:1.2;letter-spacing:-1.6px;font-variant-numeric:tabular-nums;">{{ number_format($manual + $cashless + $orion, 0, ',', '.') }} <span style="color:#334e7d;font-size:15px;font-weight:400;letter-spacing:0;">{{ $unit }}</span></p>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin-top:12px;text-align:left;">
    <thead>
        <tr><th scope="col" style="padding:10px 0;border-bottom:1px solid #e9edf5;color:#5a687e;font-size:12px;font-weight:400;">Kategori</th><th scope="col" align="right" style="padding:10px 0;border-bottom:1px solid #e9edf5;color:#5a687e;font-size:12px;font-weight:400;">Jumlah</th></tr>
    </thead>
    <tbody>
        <tr><td style="padding:13px 0;border-bottom:1px solid #e9edf5;font-size:14px;">Manual Hybrid <span style="color:#5a687e;font-size:12px;">(Non-Cashless)</span></td><td align="right" style="padding:13px 0;border-bottom:1px solid #e9edf5;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;">{{ number_format($manual, 0, ',', '.') }}</td></tr>
        <tr><td style="padding:13px 0;border-bottom:1px solid #e9edf5;font-size:14px;">Cashless Hybrid</td><td align="right" style="padding:13px 0;border-bottom:1px solid #e9edf5;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;">{{ number_format($cashless, 0, ',', '.') }}</td></tr>
        <tr><td style="padding:13px 0;border-bottom:1px solid #e9edf5;font-size:14px;">CSS / Orion</td><td align="right" style="padding:13px 0;border-bottom:1px solid #e9edf5;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;">{{ number_format($orion, 0, ',', '.') }}</td></tr>
    </tbody>
</table>
