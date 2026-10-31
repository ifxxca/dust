<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
    <title>{{ $heading }} · Retail Pickup</title>
    <style>
        body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        a { color: #155eef; }
        @media only screen and (max-width: 480px) {
            .email-outer { padding: 16px 8px !important; }
            .email-content { padding: 24px 20px !important; }
            .email-header { padding: 22px 20px !important; }
            .email-heading { font-size: 28px !important; }
            .email-meta-label { width: 90px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f2f5fb;color:#182230;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
    <div style="display:none;font-size:1px;line-height:1px;color:#f2f5fb;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{{ $preheader }}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f2f5fb;">
        <tr><td class="email-outer" align="center" style="padding:40px 16px;">
            <!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dfe5f0;border-radius:16px;">
                <tr><td style="height:4px;font-size:1px;line-height:4px;background-color:#155eef;border-radius:16px 16px 0 0;">&nbsp;</td></tr>
                <tr><td class="email-header" style="padding:26px 32px;border-bottom:1px solid #e9edf5;">
                    <p style="margin:0;color:#155eef;font-size:17px;font-weight:700;letter-spacing:-0.3px;" translate="no">Retail Pickup</p>
                    <p style="margin:2px 0 0;color:#5a687e;font-size:12px;line-height:1.5;">JNE Puri Mansion</p>
                </td></tr>
                <tr><td class="email-content" style="padding:30px 32px 32px;">
                    <p style="margin:0 0 8px;color:#5a687e;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">{{ $eyebrow }}</p>
                    <h1 class="email-heading" style="margin:0 0 12px;color:#101828;font-size:32px;font-weight:700;line-height:1.2;letter-spacing:-0.8px;">{{ $heading }}</h1>
                    @yield('content')
                </td></tr>
                <tr><td class="email-header" style="padding:20px 32px;border-top:1px solid #e9edf5;">
                    <p style="margin:0;color:#344054;font-size:12px;font-weight:700;">Retail Pickup <span style="color:#98a2b3;font-weight:400;">&nbsp;/&nbsp;</span> JNE Puri Mansion</p>
                    <p style="margin:4px 0 0;color:#5a687e;font-size:12px;line-height:1.6;">Email otomatis untuk pencatatan dan rekap pengiriman Anda.</p>
                </td></tr>
            </table>
            <!--[if mso]></td></tr></table><![endif]-->
        </td></tr>
    </table>
</body>
</html>
