# Fifth SEO landing-page target for True Site Sync

**Pick: (b) "construction petty cash management" / "site petty cash app".** Proposed URL: `/solutions/construction-petty-cash-management/`.

**Method and limits. Read this before trusting any SERP claim below.**
- WebSearch gives US-located, engine-summarised results. It is not a Google.co.in SERP. The rankings below are "pages the search engine surfaced", not verified Google India positions.
- WebFetch failed with DNS errors on every competitor domain. Direct curl got a proxy 403 (org egress policy) for getpowerplay.in, tocobrick.com, onsiteteams.com, cashbook.in and truesitesync.com. So the deep-dives come from search-engine summaries of the pages, not full page reads. I could not measure word counts, schema or exact H2 lists for competitors.
- I had no access to keyword-volume tools, Google Autocomplete or live PAA boxes. Demand evidence is indirect: how many vendor pages exist, forum and how-to articles, and app listings.
- I checked the site from the local repo (`/home/user/truesitesync`), which holds the deployed static site plus `sitemap.xml` and the app source. I did not check it live.

## Q1. Each candidate: demand evidence, who ranks, how strong they are, and fit with the site and product

### Takeaway
Petty cash is the only candidate that clears all four bars:
- No page on the site targets it.
- The product already has a dedicated module (an imprest-style wallet for each custodian, with photo receipts).
- Indian construction competitors (Powerplay, Onsite, Toco, CashBook) have built pages for it, which shows commercial demand.
- The results are thin vendor feature pages and generic accounting guides. None combines a construction workflow with India-specific tax and cash rules.

The other four either duplicate an existing page or fit the product or demand poorly. Retention already has a page, which is thin (about 900 words) and should be expanded rather than duplicated.

### Cited Findings

**Existing site coverage (repo check)**
- `/solutions/retention-money-tracking/` exists and is in the sitemap. Title: "How to Track Retention Money in RA Bills (2026 Guide)". About 899 words of visible text. H2s: what retention is / five steps / worked example / how TSS automates it / FAQ. — [local file /home/user/truesitesync/solutions/retention-money-tracking/index.html](https://truesitesync.com/solutions/retention-money-tracking/)
- `/solutions/material-management-software-for-construction/` (about 1,186 words) already targets "material reconciliation site" in its meta keywords. Its body covers "indent, purchase order, GRN, supplier reconciliation and consumption against work done". — [local file](https://truesitesync.com/solutions/material-management-software-for-construction/). `/solutions/construction-inventory-management/` is about 1,328 words. — [local file](https://truesitesync.com/solutions/construction-inventory-management/)
- RA bill coverage already exists at `/solutions/ra-bill-software/`, `/blog/how-to-prepare-ra-bill-india/` and `/solutions/ra-bill-payment-timeline-india/`. — [sitemap](https://truesitesync.com/sitemap.xml)
- Petty cash appears only as passing mentions in the pillar pages (for example "tracking inventory, equipment and petty cash"). No URL is dedicated to it. — [local file solutions/construction-management-software/index.html](https://truesitesync.com/solutions/construction-management-software/)
- MEP: no page, and the app source has no MEP-specific features. A grep for "MEP" in `js/` returned nothing. (Local repo check; no URL.)
- Product fit for petty cash: `js/modules/pettyCash.js` (744 lines) is headed "Petty Cash (Imprest-to-User wallet model) — Main Head pushes funds directly to a custodian (Site Engineer / Plant Manager). Each custodian holds a live balance and logs field expenses (with a compressed photo receipt) that deduct from it instantly. Project-scoped, offline-first." The built-in categories are Site Materials, Travel/Transport, Food/Refreshments, Daily Wages, Tools/Hardware and Miscellaneous. Admins see and fund all wallets; a custodian sees only their own. The code also has float, top-up, settle and reconciliation logic. (Local source file; no public URL.)

**(a) Retention money**
- Demand signals: many Indian explainers exist, from legal, tax and construction sources: [Bricknbolt](https://www.bricknbolt.com/blogs-and-articles/construction-guide/what-is-retainage-in-construction), [Conventus Law](https://conventuslaw.com/report/india-milestone-payments-vs-retention-money-the-fine-line-that-can-decide-multi-million-dollar-claims-in-construction-disputes/), [CAclubindia GST on retention](https://www.caclubindia.com/articles/treatment-of-retention-with-held-amount-under-gst-40463.asp) and [terra-insight](https://www.terra-insight.com/insights/why-is-5-percent-of-my-invoice-being-held-as-retention-money).
- The results are mainly informational (what it is, the percentage, GST treatment) plus ITAT case law ([ITAT order](https://itat.gov.in/public/files/upload/1693568078-ITA%20399,%20845%20&%202799%20of%202019%20-%20Consolidated%20Constructions%20Consortium%20Ltd.pdf)). They have little software intent.
- Typical rates: 5–10% of each payment; public works commonly 5–10%; private EPC commonly 5%; historically 10%, now commonly 5%. — [Bricknbolt](https://www.bricknbolt.com/blogs-and-articles/construction-guide/what-is-retainage-in-construction); [studiomatrx](https://www.studiomatrx.org/guides/construction-contracts-retainage-india); [Conventus Law](https://conventuslaw.com/report/india-milestone-payments-vs-retention-money-the-fine-line-that-can-decide-multi-million-dollar-claims-in-construction-disputes/) (secondary sources)
- CPWD-style practice:
  - DPHCL tenders under GCC-CPWD 2023 set the security deposit at 2.5% of the accepted contract value. It is recovered from running bills, and the tenders word the recovery rate inconsistently (5% vs 2.5% per bill).
  - Defect liability period: 12 months from certified completion.
  - Performance guarantee: 5%.
  - Sources: [DPHCL tender 387588](https://www.dphcl.com/tender/387588.pdf) and [DPHCL tender 484369](https://www.dphcl.com/tender/484369.pdf).
  - An NBCC contract deducted 5% of gross RA bill value, refundable after the DLP or the final bill, whichever is later. — [Delhi HC order CS(COMM) 1005/2018](https://delhihighcourt.nic.in/app/downloadOrderbByDate/CS(COMM)/1005/2018/13-01-2020)

**(b) Petty cash**: details under Q2.

**(c) RA bill format (Excel/PDF)**
- A US-located search for "RA bill format excel download" returned only generic invoice templates (SignNow, WPS, a BART test host). No construction RA format appeared in the surfaced results. — [SignNow](https://www.signnow.com/features/bill-format-in-excel-free-download-for-government); [WPS](https://www.wps.com/blog/10-bill-formats-in-excel-free-download)

**(d) MEP contractor billing software**
- Results are mostly job postings for MEP billing engineers ([L&T skima](https://lntecc.skima.ai/afe46a2a-7035-4a1d-bae2-8eecdb8e78ba), [RSM India](https://www.rsm.global/india/engineer-sr-engineer-assistant-manager-mechanical-planning-billing-mep)).
- The rest are generic invoicing pages ([myBillBook construction](https://mybillbook.in/free/invoicing-software/construction/)) and one electrical-contractor ERP vendor blog ([constructionestimatorindia](https://constructionestimatorindia.com/?p=12093)).

**(e) Material reconciliation / GRN**
- The top surfaced results are Excel tutorials and generic templates: [ExcelDemy](https://www.exceldemy.com/material-reconciliation-format-in-excel/), [Sheetaki](https://sheetaki.com/create-material-reconciliation-format-in-excel/), [Vyapar](https://vyaparapp.in/reconciliation-format/material), [Bajaj Finserv](https://www.bajajfinserv.in/reconciliation-format).
- Infralens has India-specific beta templates: [MRS](https://infralens.in/pmc/procurement/material-reconciliation-statement) and [monthly stores reconciliation](https://infralens.in/formats/stores/monthly-stores-reconciliation).
- One PSU form also appears: [GRSE MRS PDF](https://grse.in/wp-content/uploads/2022/05/MRS_Format_Blasting-painting.pdf).
- Wastage benchmarks conflict and none is a verified CPWD figure:
  - Infralens gives cement ≤2–3% and steel 3–5% ([cement register](https://www.infralens.in/formats/stores/cement-consumption-register)).
  - A BHEL tender caps wastage at +2% over theoretical consumption, with excess charged at a penal rate ([BHEL NIT 3048](https://tenders.bhel.com/sites/default/files/NIT_3048_2.pdf)).
  - A GSIDC clause requires a purchase/consumption/balance reconciliation with each RA bill ([GSIDC](https://www.gsidcltd.com/?p=9584)).

### Inferences
- **Scoring** (1–5 each for demand, commercial intent, beatability and product fit, then less overlap with existing pages):
  - **(b) Petty cash: 4, 4, 4, 5. No overlap. Best.**
  - (e) Material reconciliation: 3, 2–3, 4, 4. Partial overlap with the material management page, and the searchers mainly want Excel formats.
  - (a) Retention: 3, 2, 3, 5. A page already exists, so the better move is to expand it (FAQ, CPWD SD/DLP facts, GST on retention, release tracker), not to build a new URL.
  - (c) RA bill format: probably the highest raw volume, but the intent is template download. It also overlaps the RA software page and blog and risks keyword cannibalisation. Better handled as a downloadable template section added to `/blog/how-to-prepare-ra-bill-india/`.
  - (d) MEP: 2, 3, 4, 2. Low demand signal, mostly job-posting results, and the product has no MEP-specific features, so the claim would be weak.
- Petty cash is also a known pain point that Indian rivals monetise as a feature (Powerplay, Onsite, Toco, CashBook). That points to proven buyer intent in this exact segment.

### Gaps
- I have no keyword volumes, Google India autocomplete or Google India SERP positions, because those tools were unavailable. Before building, check demand in Google Keyword Planner or Search Console for "petty cash app", "site expense app", "petty cash management software" and "imprest account".
- I could not read RA bill format SERPs from India. The US-located search showed no Indian RA results, which is probably an artefact of geography rather than real SERP weakness.

## Q2. Full SERP and AI-answer analysis for "construction petty cash management" / "site petty cash app"

### Takeaway
The results split three ways:
1. **Indian construction-SaaS feature pages** (Powerplay, Toco, Onsite, Sirex, CashBook). Short and feature-led.
2. **Generic global petty-cash guides** (Xero, HighRadius, Nqoodle, Hala). Long, but not about construction or India.
3. **Templates and definitions** (template.net, Vergo, ProjectManagement123).

No surfaced page combines all of these:
- the site-custodian imprest workflow,
- Indian rules: Section 40A(3) ₹10,000 cash disallowance, TDS/194C on cash paid to petty contractors, and GST input credit needing a proper invoice,
- a worked replenishment example,
- an advance-ageing policy,
- a free voucher or register template,
- an FAQ.

That combination is the gap to exploit.

### Cited Findings

**Surfaced results for "petty cash management construction site" (extended search; order as returned, not a verified Google India rank)**

| # | URL | Type |
|---|---|---|
| 1 | [xero.com/us/guides/manage-petty-cash](https://www.xero.com/us/guides/manage-petty-cash/) | Generic accounting guide (US) |
| 2 | [getpowerplay.in/features/petty-cash-management](https://www.getpowerplay.in/features/petty-cash-management/) | Indian construction-SaaS feature page |
| 3 | [getvergo.com/define/petty-cash-report](https://www.getvergo.com/define/petty-cash-report) | Glossary definition |
| 4 | [tocobrick.com/petty-cash-management](https://tocobrick.com/petty-cash-management) | Construction-SaaS feature page |
| 5 | [onsiteteams.com/why-choose-onsite-for-construction-expense-management](https://onsiteteams.com/why-choose-onsite-for-construction-expense-management/) | Indian construction-SaaS (expense workflow) |
| 6 | [halsimplify.com/knowledge-center/petty-cash-usage](https://www.halsimplify.com/knowledge-center/petty-cash-usage) | Generic guide |
| 7 | [nqoodlet.com/en/blog/petty-cash](https://nqoodlet.com/en/blog/petty-cash/) | Generic guide (Gulf fintech) |
| 8 | [projectmanagement123.com petty cash reconciliation](https://projectmanagement123.com/petty-cash-reconciliation-procedure-policy-for-cash-handling/) | Policy/procedure template |
| 9 | [template.net construction petty cash return](https://www.template.net/editable/44087/construction-petty-cash-return) | Template download |
| 10 | [highradius.com petty cash management](https://www.highradius.com/resources/Blog/petty-cash-management/) | Generic enterprise-finance blog |

Other India-relevant pages surfaced for the variant queries:
- [Powerplay blog "Digital Petty Cash Advantage"](https://www.getpowerplay.in/resources/?p=5638)
- [CashBook construction imprest/UPI wallets](https://cashbook.in/blogs/cashbook-for-construction-industry-streamline-imprest-expense-management-with-upi-wallets)
- [CashBook "What is petty cash"](https://cashbook.in/blogs/what-is-petty-cash)
- [Zoho Expense petty cash](https://www.zoho.com/expense/petty-cash-management/)
- [Happay imprest cash](https://happay.com/blog/imprest-cash/)
- [CAclubindia petty cash guidelines](https://www.caclubindia.com/articles/petty-cash-guidelines-15747.asp)
- [Tally petty cash example](https://tallysolutions.com/accounting/petty-cash-example-with-recording-and-control-method/)
- [Pazy petty cash book guide](https://www.pazy.io/blogs/petty-cash-book-guide)
- App listings: [HajariBook (App Store)](https://apps.apple.com/us/app/-/id1661537437) and [SiteExpensify (Capterra)](https://www.capterra.co.uk/software/1104175/SiteExpensify)
- Launch press release: [Sirex on ThePrint](https://theprint.in/ani-press-releases/from-site-register-to-smartphone-sirex-launches-construction-management-software-for-contractors-and-builders/3017372/)

**Deep-dives.** These come from search-engine summaries only, because direct fetches were blocked. I could not measure word counts or schema.

- **Powerplay feature page:**
  - Headline framing: "Track where your money is being spent".
  - Covers tracking spend, custom expense categories per project and transactional reports.
  - Has an FAQ that touches on how material expenses and payments show in its Daily Project Report.
  - Its FAQ concedes there is no cost-estimation or excess-cost module; users compare actual against planned costs.
  - Sources: [Powerplay](https://www.getpowerplay.in/features/petty-cash-management/) and the search summary [via techjockey/softwarefinder listings](https://www.techjockey.com/detail/powerplay).
  - The Powerplay blog pitches digital petty cash on fraud reduction: audit trails, access controls and automated approvals. — [Powerplay blog](https://www.getpowerplay.in/resources/?p=5638)
- **Toco / Onsite / generic multi-site guidance:** digital logging, custom categories, real-time sync with accounts, a named custodian for each site fund, per-site limits, standard documentation, central reporting and periodic audits. Onsite frames it as "Site Expense Workflow: From Petty Cash to P&L". — [Tocobrick](https://tocobrick.com/petty-cash-management); [Onsite](https://onsiteteams.com/why-choose-onsite-for-construction-expense-management/); [Hala](https://www.halsimplify.com/knowledge-center/petty-cash-usage)
- **CashBook:** targets construction firms whose "managing imprest accounts and site expenses across multiple projects is a complex and time-consuming task". Selling points are UPI payments to contractors and automated reconciliation. — [CashBook](https://cashbook.in/blogs/cashbook-for-construction-industry-streamline-imprest-expense-management-with-upi-wallets)
- **Xero (generic):**
  - Set the fund to cover about 2–4 weeks of small expenses.
  - Log date, amount, purpose and recipient for every withdrawal.
  - Replenish weekly, fortnightly or monthly after reconciling.
  - Source: [Xero](https://www.xero.com/us/guides/manage-petty-cash/)
- **Sirex:** a petty cash module broken down per site. Priced at ₹3,600/user/year for contractors (minimum 5 users) and ₹5,000/user/year for builders. — [ThePrint press release](https://theprint.in/ani-press-releases/from-site-register-to-smartphone-sirex-launches-construction-management-software-for-contractors-and-builders/3017372/)
- **HajariBook:** free; supports multiple petty cash accounts (site or office) assigned to selected users, with reimbursement approvals. — [App Store](https://apps.apple.com/us/app/-/id1661537437)

**Question themes that recur across results (proxy for People Also Ask; I could not capture a live PAA box)**
- What is petty cash, and what is the imprest system? — [Happay](https://happay.com/blog/imprest-cash/); [CashBook](https://cashbook.in/blogs/what-is-petty-cash)
- How do you reconcile and replenish petty cash? — [ProjectManagement123](https://projectmanagement123.com/petty-cash-reconciliation-procedure-policy-for-cash-handling/); [Xero](https://www.xero.com/us/guides/manage-petty-cash/)
- What are the journal entries for petty cash, and how is cash over/short handled? — [Tally](https://tallysolutions.com/accounting/petty-cash-example-with-recording-and-control-method/)
- What is a petty cash voucher, and who signs it? — [Pazy](https://www.pazy.io/blogs/petty-cash-book-guide)
- What is a petty cash report? — [Vergo](https://www.getvergo.com/define/petty-cash-report)
- What should petty cash not be used for, and how long can an advance stay unsettled? — [CAclubindia](https://www.caclubindia.com/articles/petty-cash-guidelines-15747.asp)

**What AI answers say (search-engine AI summaries for these queries)**
- They give generic best practice: a fixed float, a custodian, a receipt for every spend, periodic replenishment and audits.
- They name Toco, Powerplay and Onsite as construction tools, flagging that these are vendor claims.
- They cite Xero, Powerplay, Vergo, Toco, Onsite, Hala, Nqoodle, ProjectManagement123 and template.net.
- For "site petty cash app" they cite CashBook, Zoho Expense, Happay and haeywa.
- They state the gap explicitly: "I found no source on the specific mechanics of settling a site engineer's advance (e.g., bill-to-advance matching or treatment of unspent cash)" and "None gave an Indian voucher template, GST or TDS treatment for site expenses, or construction-specific examples such as labour advances or material purchases".
- Sources: the search summaries above, citing [CAclubindia](https://www.caclubindia.com/articles/petty-cash-guidelines-15747.asp) and [Tally](https://tallysolutions.com/accounting/petty-cash-example-with-recording-and-control-method/).

### Inferences
**Gaps to exploit**
1. **Construction-specific imprest walkthrough.** A worked example: HO funds an engineer's wallet with ₹25,000, the engineer spends on material, transport and daily wages with photo bills, a top-up restores the float to ₹25,000, and the month-end settlement is posted to project cost.
2. **India compliance box** (see Q3):
   - Section 40A(3): a ₹10,000 per person per day cash limit (₹35,000 for transporters).
   - No splitting of payments to stay under the limit.
   - Keep subcontractor or TDS-liable payments out of petty cash.
   - GST ITC needs a vendor's GST invoice. This last point is inference and needs a source; see Gaps.
3. **Advance-ageing policy.** A 45-day unsettled-advance rule as an example policy (CAclubindia), turned into an in-app alert.
4. **Free downloadable petty cash register/voucher (Excel or PDF).** This captures template intent, which today goes to template.net.
5. **Comparison table.** Cash box + register vs WhatsApp photos vs Excel vs an app with per-custodian wallets. This fits the site's existing WhatsApp and Excel alternative pages, which should get internal links.
6. **Offline-first.** Field expense logging without signal is a real differentiator in the product code, and competitor pages don't stress it.
7. **Schema.** SoftwareApplication + FAQPage + HowTo (replenishment steps). From the summaries, competitors appear not to use HowTo, but this is unverified.
8. **Suggested H2s:**
   - What is site petty cash (imprest)
   - Why cash leaks on site
   - How the imprest wallet works (steps)
   - Worked example
   - India rules you must follow (40A(3), TDS, GST bills)
   - Petty cash policy template (limits, banned uses, 45-day settlement)
   - Free register/voucher download
   - App vs Excel vs WhatsApp
   - How True Site Sync does it (custodian wallets, photo receipts, categories, offline, roll-up to project P&L/cash flow)
   - FAQ

### Gaps
- I could not see competitor word counts, schema or exact H2s; a manual view of the pages is needed.
- I could not capture live Google India PAA boxes or Google AI Overview citations.

## Q3. Authoritative facts the page needs

### Takeaway
The strongest citable facts are:
- **Income Tax Act Section 40A(3):** cash payments over ₹10,000 per person per day are fully disallowed (₹35,000 for goods transporters), and splitting payments does not escape the rule.
- **The imprest definition and its government analogues:** the CPWA Code imprest provision and GFR 2017 Rule 322.

The CPWD and other government imprest rules apply to government divisions, not private contractors. Use them only as definitional authority.

### Cited Findings

**Section 40A(3) and cash payments**
- Expenses paid in cash above ₹10,000 to one person in a day, without an account payee cheque, draft or electronic clearing, are 100% disallowed. The limit is ₹35,000 for payments to transporters plying, hiring or leasing goods carriages. — [TaxGuru](https://taxguru.in/income-tax/disallowance-cash-payment-section-40a3.html)
- Finance Act 2017 cut the limit from ₹20,000 to ₹10,000, and splitting a payment to avoid the limit still attracts disallowance. — [Bajaj Finserv](https://www.bajajfinserv.in/section-40a3-of-income-tax-act) (secondary; verify against the Act and Rule 6DD)
- Rule 6DD exceptions exist (banks, RBI, certain cooperative or agricultural bodies; some sources add areas without banking facilities). Sources differ on the full list. — [TaxGuru](https://taxguru.in/income-tax/section-40a3-section-40a3a-income-tax-act-1961.html)

**Imprest: definition and government rules**
- CPWA Code: "an imprest is a standing advance of a fixed sum of money given to an individual to enable him to make certain classes of disbursements". It should be kept as low as possible, and not above ₹5,000 without special sanction. Imprest accounts are rendered in "Imprest Cash Account Form 2". — [CPWA Code, CG PWD copy](https://pwd.cg.nic.in/Doc/CENTRAL%20PUBLIC%20WORKS%20ACCOUNTS%20CODE.pdf); [CAG CPWA Code 1993](https://cag.gov.in/uploads/media/PC-16-CPWA-Code-1993-20210331152534.pdf); [CAG Book of Forms](https://cag.gov.in/uploads/media/PC-16-Book-of-forms-of-CPWA-Code-20210331152655.pdf). The paragraph number (6.6.8) and the ₹5,000 figure come from a search summary and need checking against the PDF.
- GFR 2017 Rule 322: a permanent advance or imprest for day-to-day contingent expenditure may be granted by the Head of Department in consultation with internal finance, kept to the minimum needed. — [constitutionofindia.in, Rule 322](https://constitutionofindia.in/rule-322-of-the-general-financial-rules-2017-permanent-advance-or-imprest/) (secondary; the official GFR 2017 PDF on doe.gov.in should be cited instead)
- The UP Financial Handbook has a section titled "Permanent Advances or Imprest Account". — [budget.up.nic.in](https://budget.up.nic.in/Fin_H_Book/volume5/part1/011.html)
- CPWD Works Manual 2022 (copy hosted by NDMC). — [NDMC PDF](https://www.ndmc.gov.in/departments/Departments/Finance/nodal_cell/CPWD%20Works%20Manual%202022.pdf). I did not confirm that it has a site petty cash provision.
- Indian Railways Engineering Code, chapter XIV. It surfaced for the imprest query but I did not read it. — [indianrailways.gov.in](https://indianrailways.gov.in/railwayboard/uploads/codesmanual/EngCode/chapter-xiv.htm)

**Imprest mechanics and practice (secondary)**
- In the imprest method a fixed amount is advanced, and replenishment equals the amount spent, which restores the float. — [Happay](https://happay.com/blog/imprest-cash/); [Pazy](https://www.pazy.io/blogs/petty-cash-book-guide)
- Pazy says Indian SMB petty cash funds typically range from ₹5,000 to ₹20,000. — [Pazy](https://www.pazy.io/blogs/petty-cash-book-guide) (vendor claim)
- Example company policy (not law):
  - daily cash report,
  - fortnightly review of the advance register,
  - advances unsettled after 45 days reported for recovery,
  - a per-person daily cap,
  - no subcontractor or TDS-liable payments through petty cash,
  - forms: cash delivery, receiving, reimbursement settlement and request letter.
  - Source: [CAclubindia](https://www.caclubindia.com/articles/petty-cash-guidelines-15747.asp)
- A cash over/short journal treatment example. — [Tally Solutions](https://tallysolutions.com/accounting/petty-cash-example-with-recording-and-control-method/)

**Facts for the other candidates (for the retention page expansion or future pages)**
- Retention and security deposit rates, GCC-CPWD 2023 practice and DLP: see Q1, (a).
- Material reconciliation wastage benchmarks: see Q1, (e). There is still no verified CPWD clause.

### Inferences
- Present Section 40A(3) as "why ₹10,000+ site payments should go via UPI or bank, not the cash box". This is an inference that links the rule to product behaviour. The page should recommend UPI or bank transfer for large or recurring vendor payments.
- Paying a labour or petty contractor in cash may also trigger TDS under Section 194C above its thresholds. The site already has `/blog/section-194c-tds-on-contractor-payments/`, so link to it rather than restating thresholds I did not verify here.

### Gaps
- I did not find an official CPWD rule on site-level petty cash for contractors; contractors' petty cash is a private accounting practice.
- I did not verify the GST input-credit conditions for petty cash purchases (Section 16 CGST Act needs a tax invoice). Cite cbic-gst.gov.in before publishing.
- I did not fetch the official GFR 2017 PDF or confirm the CPWA Code paragraph number and the ₹5,000 figure.
- CPWD GCC 2023 retention/SD clause text and CPWD material-wastage allowances: the primary text was not retrieved, only tender-notice summaries.
