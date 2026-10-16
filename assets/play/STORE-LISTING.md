# True Site Sync — Google Play Store Listing Kit

Everything you type into the Play Console, in one place. Copy-paste the text,
upload the graphics from this folder (`assets/play/`).

- **Package / App ID:** `com.truesitesync.app`  ⚠️ the Play Console app entry MUST
  use this exact ID. (An earlier draft mentioned `com.truesitesync.myapp` — if the
  Console app was created with that, you cannot change it; create a new app with
  `com.truesitesync.app` to match the build, or we re-point the build to the Console ID.)
- **Default language:** English (India) — en-IN
- **App category:** Business  (alternative: Productivity)
- **Privacy Policy URL:** https://truesitesync.com/privacy.html
- **Website:** https://truesitesync.com
- **Support email:** raghupadhiyar9@gmail.com  (swap for a support@ address if you have one)

---

## App name  (max 30 characters)
```
True Site Sync
```
(28 chars with a tagline option: `True Site Sync: Site Manager` = 28)

## Short description  (max 80 characters)
```
Measurement billing, labour wages, GST/VAT & site reports for contractors.
```
(73 chars)

## Full description  (max 4000 characters)
```
True Site Sync is an all-in-one construction management app built for contractors, civil engineers and site teams. Run measurement billing, labour attendance and wages, material tracking, GST/VAT invoicing and site reporting — from your phone, online or offline.

Stop juggling paper measurement books, WhatsApp photos and dozens of Excel sheets. True Site Sync keeps every project, client and site in one place.

WHAT YOU CAN DO

• Measurement billing — record Nos × L × B × H measurement sheets on site, auto-calculate quantities, build abstracts and RA bills, and export professional PDFs.
• Labour & wages — mark daily attendance with one tap, track trades, overtime and shifts, and generate muster rolls and wage payouts.
• GST & VAT invoicing — raise tax-compliant invoices with correct tax breakup, number-to-words and your company letterhead. Multi-country tax support (India GST, UAE/GCC VAT and more).
• Materials & purchase — track purchase orders, GRN, stock and vendor bills so nothing on site goes unaccounted.
• Clients & projects — organise work client-by-client and project-by-project, with contract values and billed-to-date at a glance.
• Reports — ready-made reports for finance, labour, purchase, sales, GST and more, exportable to PDF and Excel.
• Works offline — capture data on site without signal; it syncs when you are back online.
• One account everywhere — the same account works on the web app, Windows desktop and this Android app.

BUILT FOR REAL SITES
Designed with Indian contractors first and now serving teams globally, True Site Sync speaks the language of the site: BOQ, abstracts, RA bills, muster, retention and more — not generic business jargon.

WHO IT'S FOR
Civil contractors, sub-contractors, builders, PMC/consultants, site engineers, supervisors and accounts teams who want their site data accurate, billed and reported without the paperwork.

Start free. Manage plans and billing on our website at truesitesync.com.

Questions or feedback? Email us — we reply fast.
```

---

## Graphics (upload these)
| Asset | Spec | File |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | `assets/play/icon-512.png` |
| Feature graphic | 1024×500 PNG/JPG | `assets/play/feature-graphic.png` |
| Phone screenshots | 2–8, PNG/JPG, 16:9 or 9:16, min 320px, max 3840px | **you capture — see below** |

### Screenshots — how to capture (required: at least 2)
Take them on a real phone (or the APK in an emulator) so they look authentic:
1. Clients / home screen
2. A measurement entry sheet with a few rows
3. Attendance marking (the new tap UI)
4. A generated invoice/abstract PDF
5. The Reports dashboard

Tip: 1080×1920 portrait is ideal. Send me the raw captures and I'll add clean
device frames + one-line captions (recommended — framed screenshots convert better).

---

## Data safety form (Play Console → App content → Data safety)
Answer truthfully based on what the app does. Typical answers for this app:

- **Does your app collect or share user data?** Yes (account + the business data users enter).
- **Is data encrypted in transit?** Yes (HTTPS).
- **Can users request data deletion?** Yes — via support email / account deletion.
- **Data types collected (typical):**
  - Personal info: Name, Email address (for the account).
  - App activity / other: the business records users create (projects, invoices,
    labour, etc.) stored to provide the service.
  - Device/other IDs: only if analytics is enabled.
- **Purpose:** App functionality, Account management.
- **Shared with third parties:** Only processors needed to run the service
  (e.g. authentication/cloud backend, payment gateway on the website). Not sold.

> Match these answers to reality. If you add analytics/ads later, update this form.

## Content rating (App content → Content rating questionnaire)
- Category: **Business / Productivity** (no violence, no user-generated public content).
- Expected result: **Everyone / PEGI 3** — it's a business tool.

## App access (App content → App access)
The app needs a login. Provide Google with **demo credentials** (a test account
email + password) so the reviewer can sign in, or they will reject the review.

## Ads
Declare **No ads** (unless you add them).

## Target audience
Select **18+ / business users** (not a kids app) to avoid Families policy requirements.

---

## Build & upload the AAB
The signed Android App Bundle is produced by the `Build Android AAB (Play Store)`
GitHub Action. Trigger it by pushing an `aab-release/<version>` branch (Play-only,
doesn't rebuild the EXE/APK). The build:
- targets Android 16 (API 36) — Play's current requirement,
- auto-derives versionCode from package.json (e.g. 1.6.153 → 10653),
- signs with your upload key **if** these repo secrets are set (set them before
  your first PRODUCTION upload so every future update uses the same key):
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

> ⚠️ If you upload a bundle signed with the workflow's throwaway key, Play will
> lock that signing identity for the app and later updates signed differently will
> be rejected. Decide the upload key BEFORE the first production upload. (Enrolling
> in Play App Signing lets Google manage the app signing key; you still keep a
> stable upload key.)

## Submission order in Play Console
1. Create app → name, default language, App/Game = App, Free/Paid = Free.
2. Set up: App access (demo login), Ads, Content rating, Target audience, Data safety, Privacy policy URL.
3. Store listing: name, short + full description, icon, feature graphic, screenshots, category, contact details.
4. Release → start with **Internal testing** → upload the `.aab` → add testers → roll out.
5. Verify it installs & logs in from the Play test link.
6. Promote to **Production** → Google review (hours to a few days for a new app;
   new personal developer accounts may also need the 12-tester/14-day closed-test step).
