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
- Brand tokens: green `#16a34a→#15803d` (button), gold accent `#c99a2e`, ink `#0f172a`, 20px cards.
- Logo: pulled live from `https://truesitesync.com/assets/logo.png` in a white tile (works in
  light + dark inboxes). If you move the logo, update the `<img src>` in each file.
- After pasting, use **Send test email** in Supabase to confirm rendering in your inbox.
