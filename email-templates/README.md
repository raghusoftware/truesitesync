# True Site Sync — Auth Email Templates

Premium, brand-matched HTML templates for the Supabase auth emails.
Email-client-safe (table layout, inline CSS, bulletproof Outlook buttons, dark-mode aware).

## Where to paste each file

Supabase Dashboard → **Authentication → Emails → Templates**. For each template, set the
**Subject** and paste the file's full HTML into the **Message body**:

| File | Supabase template | Suggested subject |
|------|-------------------|-------------------|
| `confirm-signup.html` | Confirm signup | `Confirm your True Site Sync account` |
| `reset-password.html` | Reset password | `Reset your True Site Sync password` |
| `magic-link.html` | Magic Link | `Your True Site Sync sign-in link` |
| `invite.html` | Invite user | `You're invited to True Site Sync` |
| `change-email.html` | Change Email Address | `Confirm your new email address` |

## Supabase template variables used
- `{{ .ConfirmationURL }}` — the action link (all templates)
- `{{ .Email }}` / `{{ .NewEmail }}` — old/new address (change-email only)

Do **not** rename these — Supabase substitutes them at send time. The visible `{{ ... }}`
you see in a browser preview is replaced with the real link/email when Supabase sends.

## Notes
- These only render correctly **once SMTP is working**. Fix the GoDaddy `535 Authentication
  Failed` first (correct mailbox password, or switch to Microsoft 365 host / Resend).
- Design tokens: primary `#2563eb→#1d4ed8`, accent `#f59e0b`, ink `#0f172a`, 20px cards.
- After pasting, use **Send test email** in Supabase to confirm rendering in your inbox.
