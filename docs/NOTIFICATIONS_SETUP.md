# Notifications — activation guide

Three delivery channels ship with the app:

| Channel | Works out of the box? | What it needs |
|---|---|---|
| **In‑app bell** (🔔 in the header) | ✅ Yes | Nothing — org‑synced, cross‑device |
| **Email** | ⚙️ Needs a key | `RESEND_API_KEY` (+ optional `RESEND_FROM`) |
| **Web push** | ⚙️ Needs keys | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

Both email and push **degrade silently** until configured — the app never breaks if the secrets are absent.

## Email (Resend)
1. Create a free account at resend.com and verify your sending domain (or use the test sender for trials).
2. In Supabase → Project → **Edge Functions → Secrets**, add:
   - `RESEND_API_KEY` = your Resend API key
   - `RESEND_FROM` = e.g. `True Site Sync <noreply@yourdomain.com>` (optional; defaults to Resend's onboarding sender)
3. Done. Emails send via the deployed `send-notification` function.

## Web push (VAPID)
A VAPID keypair was generated for this app. The **public** key is already embedded in the client (`js/modules/push.js`). Add the **private** key (and the pair) as Edge Function secrets:

- `VAPID_PUBLIC_KEY` = `BMoj9QhBSXNbtnmakiYW7ve-LVxeoSb3yy4lMNChUqnMcI74X9bVuXALq4smU75pIMTSme8F_Oa-EihO1LjffvI`
- `VAPID_PRIVATE_KEY` = `CoU5dc8-gCfYvev-7speMUB0a1fOAYDBvgbivLFa60k`
- `VAPID_SUBJECT` = `mailto:info@truesitesync.com`

> Keep `VAPID_PRIVATE_KEY` secret. If you ever rotate it, also update the public key in `js/modules/push.js`.

Users enable push per‑device from the 🔔 panel → **Enable push** (asks browser permission, then subscribes). Subscriptions are stored in the org‑synced `pushSubscriptions` module and read by the `send-push` function.

**Note:** Web push works in browsers (desktop + Android Chrome). The packaged **Android (Capacitor) app** needs Firebase Cloud Messaging (FCM) instead — that's a separate setup (add the `@capacitor/push-notifications` plugin + `google-services.json`) and can be added later; in‑app + email already cover the native app.

## What triggers a notification today
- **Petty cash** — funds sent → the custodian is notified to confirm receipt; when they **confirm** or **dispute**, the admin who issued it is notified.
- `window.notify({userId, supaId, email, name}, {type, title, body, data})` is the shared helper — call it from any module to notify a user across all three channels at once.
