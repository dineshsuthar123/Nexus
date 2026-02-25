package email

// verificationEmailTemplate is the HTML email for account verification.
const verificationEmailTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <tr>
      <td style="padding:32px 40px 24px 40px;text-align:center;background:#1a1a2e;border-radius:8px 8px 0 0;">
        <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:600;">Nexus RTP Platform</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px;">
        <h2 style="color:#1a1a2e;margin:0 0 16px 0;font-size:20px;">Verify Your Email Address</h2>
        <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
          Welcome to Nexus RTP! Please click the button below to verify your email address and activate your account.
        </p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px auto;">
          <tr>
            <td style="background:#2563eb;border-radius:6px;padding:12px 32px;">
              <a href="{{.VerificationLink}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
                Verify Email Address
              </a>
            </td>
          </tr>
        </table>
        <p style="color:#888;font-size:13px;line-height:1.5;margin:0 0 8px 0;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="color:#2563eb;font-size:13px;word-break:break-all;margin:0 0 24px 0;">
          {{.VerificationLink}}
        </p>
        <p style="color:#888;font-size:13px;line-height:1.5;margin:0;">
          This link will expire in 24 hours. If you did not create an account, you can safely ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 40px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#aaa;font-size:12px;margin:0;">&copy; 2025 Nexus RTP Platform. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>`

// passwordResetEmailTemplate is the HTML email for password resets.
const passwordResetEmailTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <tr>
      <td style="padding:32px 40px 24px 40px;text-align:center;background:#1a1a2e;border-radius:8px 8px 0 0;">
        <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:600;">Nexus RTP Platform</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px;">
        <h2 style="color:#1a1a2e;margin:0 0 16px 0;font-size:20px;">Reset Your Password</h2>
        <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
          We received a request to reset the password for your Nexus RTP account. Click the button below to choose a new password.
        </p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px auto;">
          <tr>
            <td style="background:#dc2626;border-radius:6px;padding:12px 32px;">
              <a href="{{.ResetLink}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
                Reset Password
              </a>
            </td>
          </tr>
        </table>
        <p style="color:#888;font-size:13px;line-height:1.5;margin:0 0 8px 0;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="color:#dc2626;font-size:13px;word-break:break-all;margin:0 0 24px 0;">
          {{.ResetLink}}
        </p>
        <p style="color:#888;font-size:13px;line-height:1.5;margin:0 0 8px 0;">
          This link will expire in 1 hour.
        </p>
        <p style="color:#888;font-size:13px;line-height:1.5;margin:0;">
          If you did not request a password reset, please ignore this email or contact support if you have concerns.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 40px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#aaa;font-size:12px;margin:0;">&copy; 2025 Nexus RTP Platform. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>`
