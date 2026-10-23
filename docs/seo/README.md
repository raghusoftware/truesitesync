# SEO Page Briefs

Publish-ready page briefs built from *Comprehensive SEO Keyword Research and Strategic Content Plan for True Site Sync*. Each brief follows the same template: metadata → intent → outline → full page copy → JSON-LD → linking plan → image plan → gaps & flags.

## The six briefs

| # | Brief | Primary keyword | Est. volume (India) | Priority | Slug | CTA |
|---|---|---|---|---|---|---|
| 1 | [BOQ vs actual cost](boq-vs-actual-cost-software.md) | BOQ vs actual cost software | 100–300 | 10 | `/solutions/boq-vs-actual-cost-software/` | Demo |
| 2 | [Subcontractor billing](subcontractor-billing-software.md) | subcontractor billing software India | 150–350 | 9 | `/solutions/subcontractor-billing-software/` | Demo |
| 3 | [Real-time site sync](real-time-construction-site-sync-app.md) | real-time construction site sync app | 50–150 (brand-adjacent) | 9 | `/solutions/real-time-construction-site-sync-app/` | Trial |
| 4 | [Pricing guide](construction-software-pricing-india.md) | construction software pricing India | 200–500 | 9 | `/resources/construction-software-pricing-india/` | Trial + Demo |
| 5 | [Labour attendance](labour-attendance-software-construction.md) | labour attendance software for construction sites | 400–900 | 8 | `/solutions/labour-attendance-software-construction/` | Trial |
| 6 | [Multi-site management](multi-site-construction-management-software.md) | multi-site construction management software | 100–250 | 8 | `/solutions/multi-site-construction-management-software/` | Demo |

**Why these six:** they're the highest-priority keywords in the research doc that (a) had no page on truesitesync.com and (b) the product actually supports. The other top-priority keywords already have pages (DPR app, RA billing, offline app, Powerplay comparison, WhatsApp alternative, measurement book).

**Deliberately not built yet:** *RERA compliance tracking software* (priority 9) and *construction software with Tally integration* (priority 9). The site doesn't confirm either feature. Writing those pages before the features exist would mean making claims the product can't back, and buyers would find out in the demo.

## Fix these site-wide before publishing anything

These contradictions appear on the live site and undercut every new page:

1. **Entry price:** ₹2,400/yr (`/features/` and most solution-page FAQs and JSON-LD descriptions) vs ₹2,500/yr (`/pricing.html` and JSON-LD `price`).
2. **Feature gating:** `/features/` says "every module included, no feature gates". `/pricing.html` gates multi-site and the sub-contractor ledger (Business), labour & attendance and role-based access (Pro), and API access and audit logs (Enterprise).
3. **User count:** `/features/` says "up to 50 users", but only Enterprise allows 50.

## Publishing order

1. Fix the three conflicts above.
2. Resolve each brief's **[NEEDS SOURCE]** items with the product team. The most important are: budget-vs-actual granularity (BOQ page), TDS on payable bills (subcontractor page), and GPS/selfie attendance (labour page).
3. Publish in this order: **Real-time sync** (brand defence, fewest open items) → **Multi-site** (hub for the 20 city pages) → **BOQ vs actual** → **Subcontractor billing** → **Labour attendance** → **Pricing guide** (needs competitor prices first).
4. For each page: add it to `sitemap.xml` and the `/solutions/` index, and make the inbound-link edits listed in its Linking Plan. Without inbound links, a new page ranks slowly.
5. Assign a real named author and reviewer to each page (E-E-A-T), and keep the "Last updated" date current.
