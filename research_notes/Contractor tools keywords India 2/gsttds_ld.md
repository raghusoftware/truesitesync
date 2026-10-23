# GST-TDS (CGST s.51) and Liquidated Damages / CPWD Clause 2 — SEO research notes for truesitesync.com

**Tool limits (read first).** Researched 22 Oct 2026. Every direct page fetch failed: the egress proxy refused CONNECT to cbic.gov.in, cpwd.gov.in, taxguru.in, cleartax.in, iitk.ac.in, mahagst.gov.in and indiankanoon.org (403 / DNS failure). So **every finding below comes from search-engine result summaries and snippets, not from my own reading of full documents.** I have not quoted any statute, GCC clause or judgment from full text. The WebSearch tool is US-located, so the "SERP" section shows which sites a search engine surfaces for the topic. It is **not** an observed Google.co.in ranking. Primary sources are linked wherever the search surfaced them, so the writer can check them by hand before publishing.

---

## A1. GST-TDS: who deducts, rate, threshold, base, timing, credit (CGST s.51, Rule 66, Notf. 50/2018-CT)

### Takeaway
Under s.51, government departments and establishments, local authorities, governmental agencies, and the bodies notified in Notf. 50/2018-CT (bodies with 51%+ government equity or control, societies set up by government, and PSUs) must deduct TDS. The rate is 1% CGST + 1% SGST/UTGST, or 2% IGST, on the taxable value excluding GST, when the value of a single contract exceeds ₹2.5 lakh. The deductor deposits it within 10 days after month-end and files GSTR-7. The certificate is GSTR-7A, generated on the portal. The contractor must **accept** the credit on the portal, and it then reaches the electronic cash ledger.

### Cited Findings
**Who must deduct**
- s.51(1) covers (a) a department or establishment of the Central or State Government, (b) a local authority, (c) governmental agencies, and (d) persons or categories of persons notified by the Government — [knowyourgst s.51 text](https://www.knowyourgst.com/gstlaw/cgst-act/51-tax-deduction-at-source-51/); [CG GST s.51 PDF](https://cggst.com/wp-content/uploads/2023/07/Section-51.pdf)
- Notf. 50/2018-Central Tax (13 Sep 2018) brought s.51 into force from **1 Oct 2018**. It notified three categories: (a) an authority, board or other body set up by an Act of Parliament or a State Legislature, or established by any Government, with 51% or more participation by way of equity or control, to carry out any function; (b) a society established by the Central/State Government or local authority under the Societies Registration Act, 1860; (c) public sector undertakings. It superseded Notf. 33/2017 — [GST Council copy of Notf. 50/2018](https://www.gstcouncil.gov.in/sites/default/files/2024-05/notfctn-50-central-tax-english.pdf); [WB consolidated TDS notifications](https://comtax.wb.gov.in/GST/GST_PPU/Consolidated_TDS_Notifications_20190301.pdf); [gstzen summary](https://gstzen.in/a/central-tax-notification-502018-seeks-to-bring-section-51-of-the-cgst-act-provisions-related-to-tds-into-force-wef-01102018.html)
- Notf. 50/2018 was later amended to exempt certain Ministry of Defence authorities (summary only; I did not find the amending notification number) — [search summary citing taxmann/studycafe](https://studycafe.in/cbic-notifies-section-51-of-the-cgst-act-provisions-related-to-tds-33772.html)
- An AAR held that IIMs are "specified persons" liable to deduct GST-TDS — [Taxmann](https://www.taxmann.com/post/blog/iims-liable-to-deduct-gst-tds-as-specified-person-aar/)

**Rate**
- The statute says "one per cent" under the CGST Act. The SGST/UTGST Acts add a matching 1%, and inter-state supplies take 2% under the IGST Act. That gives 2% in total either way — [s.51 text](https://www.knowyourgst.com/gstlaw/cgst-act/51-tax-deduction-at-source-51/); [Assam TDS circular](https://tax.assam.gov.in/AssamTimsInfo/GST/FORMATS/TDS_Circular.pdf); [Bihar BICA study material](https://bica.bihar.gov.in/Doc/Study%20Matrials/TDS%20under%20GST.pdf)

**Threshold and base**
- The deduction applies where "the total value of such supply, under a contract, exceeds two lakh and fifty thousand rupees" — [s.51 text](https://www.knowyourgst.com/gstlaw/cgst-act/51-tax-deduction-at-source-51/)
- Explanation to s.51(1): the value of supply is the amount shown on the invoice **excluding** CGST, SGST/UTGST, IGST and cess — [s.51 text](https://www.knowyourgst.com/gstlaw/cgst-act/51-tax-deduction-at-source-51/); [gstgyaan](https://gstgyaan.com/section-51-of-the-cgst-act-tax-deduction-at-source)
- The ₹2.5 lakh test is applied to the **contract** value, not to each running bill. If the contract value is above ₹2.5 lakh, TDS applies even to an RA/running payment below ₹2.5 lakh — [Assam TDS circular](https://tax.assam.gov.in/AssamTimsInfo/GST/FORMATS/TDS_Circular.pdf)
- The AAR (IIM case) held that each separate contract with the same supplier is tested on its own, excluding GST, while recurring supplies under one contract are aggregated — [Taxmann](https://www.taxmann.com/post/blog/iims-liable-to-deduct-gst-tds-as-specified-person-aar/)
- Proviso: no deduction where the location of the supplier and the place of supply are in a State/UT different from the recipient's State/UT of registration — [s.51 text](https://www.knowyourgst.com/gstlaw/cgst-act/51-tax-deduction-at-source-51/)

**Deposit, return, certificate**
- The deducted amount is paid to the Government **within ten days after the end of the month** of deduction (s.51(2)) — [s.51 text](https://www.knowyourgst.com/gstlaw/cgst-act/51-tax-deduction-at-source-51/)
- Rule 66(1): the return is Form **GSTR-7**, filed electronically. The search summary states the due date is the 10th of the following month, with an amendment effective 1 Nov 2024 — [Uttarakhand CGST TDS Rules PDF](https://gst.uk.gov.in/PDF/TDS/CGST_TDSRules.pdf); [gstzen Rule 66](https://gstzen.in/a/form-and-manner-of-submission-of-return-by-a-person-required-to-deduct-tax-at-source-cgst-rule-66.html)
- Rule 66(3): the TDS certificate is made available electronically in **Form GSTR-7A** on the portal, based on the GSTR-7 return — [gstzen Rule 66](https://gstzen.in/a/form-and-manner-of-submission-of-return-by-a-person-required-to-deduct-tax-at-source-cgst-rule-66.html); [GSTR-7A format](https://taxindiaonline.com/RC2/pdfnoti/gst/gst_forms/2017/GSTR-07A.pdf)
- Late fee: Notf. 22/2021-CT capped the GSTR-7 late fee at ₹25/day (CGST), maximum ₹1,000. **Notf. 23/2024-CT (8 Oct 2024, effective 1 Nov 2024) superseded it** and waives the late fee entirely where the TDS deducted in the month is nil — [IRIS on 22/2021](https://irisgst.com/gst-notification-22-2021-late-fees-applicable-for-delay-in-filing-gstr-7-from-the-month-of-june-21-is-rationalized/); [gstgyaan on 23/2024](https://gstgyaan.com/notification-no-23-2024-central-tax-waiver-of-late-fee-for-late-furnishing-of-gstr-7); [Cashflo](https://www.cashflo.io/magazine/capping-of-late-fee-for-late-filing-of-form-gstr-7-cgst-notification-dated-08-10-2024)

**How the contractor (deductee) gets credit**
- Rule 66(2): the deductor's GSTR-7 details are made available to the deductee, who can claim the amount in the **electronic cash ledger** after validation — [gstzen Rule 66](https://gstzen.in/a/form-and-manner-of-submission-of-return-by-a-person-required-to-deduct-tax-at-source-cgst-rule-66.html)
- GST portal FAQ: the deductee must **accept or reject** the auto-populated entries in the "TDS and TCS Credit Received" form, and that action is mandatory before the cash ledger is credited. Rejected entries appear in a "Rejected by Deductee" tab of the deductor's GSTR-7, where the deductor can amend them — [GST portal GSTR-7 FAQ](https://tutorial.gst.gov.in/userguide/returns/GSTR7_FAQ.htm)

### Inferences
- s.51 says "1%", and many SERP pages say "2%". The page should state plainly that the 2% is 1% CGST + 1% SGST, or 2% IGST, so contractors are not confused.
- The proviso on supplier location / place of supply means an out-of-state contractor working on a site in the recipient's state is normally still subject to TDS (both are in the recipient's state). This is an inference from the proviso wording, so get it legally reviewed before stating it.
- The Assam circular's point on running bills is the most useful nuance for an RA-billing SaaS: the threshold is per contract, so every RA bill on a contract above ₹2.5L carries the 2% deduction.

### Gaps
- I could not open the official CBIC TDS FAQ / Circular 76/50/2018 or the bare Act on cbic.gov.in (fetch blocked), so pinpoint wording comes from mirror copies.
- I found no source on the interest rate for late deposit (s.51(6) refers to s.50 interest; 18% is commonly cited) or on the late fee for not furnishing the certificate. Verify both before publishing.
- I did not confirm the full list of amendments to Notf. 50/2018 after 2018 (e.g. the Defence exemption notification number).

---

## A2. 2025–26 changes and interaction with income-tax TDS (s.393 / old 194C); worked example

### Takeaway
The main GST-TDS change is that **GSTR-7 now requires invoice-wise reporting** (Notf. 09/2025-CT; mandatory from the Sept 2025 tax period per the GSTN advisory of 26 Sep 2025). On the income-tax side, from 1 Apr 2026 contractor TDS sits in **s.393(1) of the Income-tax Act, 2025** (Table Sl. 6(i)), at the same rates as old 194C: 1% for individual/HUF and 2% for others. Both deductions can apply to the same RA bill.

### Cited Findings
- Notf. 09/2025-Central Tax (Feb 2025; sources disagree whether it is dated 11 or 22 Feb) amended Form GSTR-7 to capture invoice-wise TDS — [Taxmann](https://www.taxmann.com/post/blog/gstn-defers-invoice-wise-tds-reporting-in-gstr-7); [studycafe](https://studycafe.in/gstn-advisory-invoice-wise-reporting-made-mandatory-in-gstr-7-from-september-2025-394411.html)
- A GSTN advisory in May 2025 **deferred** the rollout — [Taxmann "GSTN defers…"](https://www.taxmann.com/post/blog/gstn-defers-invoice-wise-tds-reporting-in-gstr-7)
- The GSTN advisory of **26 Sep 2025** made invoice-level reporting operational/required from the **September 2025 tax period** (return due 10 Oct 2025). Fields per invoice: invoice number, invoice date, taxable value, TDS (CGST/SGST or IGST) deducted. Problems go to the GST Self-Service Portal — [Maharashtra GST copy of advisory](https://www.mahagst.gov.in/public/uploads/whatisnew/17617342621760514457_373%20Invoice-wise%20Reporting%20Functionality%20in%20Form%20GSTR-7%20on%20portal-reg.pdf); [taxo.online](https://taxo.online/latest-news/27-09-2025-invoice-wise-reporting-functionality-in-form-gstr-7-on-portal-reg/); [gstgyaan](https://www.gstgyaan.com/invoice-wise-reporting-functionality-in-form-gstr-7-on-portal)
- Some blogs also claim "sequential filing" enforcement for GSTR-7. **No official source confirmed this** — [ClearTax GSTR-7 (snippet only)](https://cleartax.in/s/gstr-7-gst-return)
- Income-tax: for payments or credits from **1 Apr 2026**, contractor TDS is under **s.393(1), Table Sl. No. 6(i)** of the Income-tax Act, 2025. Rates are 1% (individual/HUF) and 2% (others). Thresholds are ₹30,000 per single payment or ₹1,00,000 aggregate in the tax year, unchanged from 194C. Payments on or before 31 Mar 2026 stay under s.194C. Without a PAN, the rate is 20% — [India Briefing](https://india-briefing.com/news/section-393-income-tax-act-2025-tds-rules-rates-compliance-guide-44450.html/); [TDSMAN](https://blog.tdsman.com/2026/05/tds-on-payments-to-contractors-section-3931-section-194c/); [TaxHeal](https://www.taxheal.com/tds-on-contractors-w-e-f-01-4-2026.html); [Busy](https://busy.in/tds/section-194c-contractors-subcontractors/)
- Sources disagree on the TDS return form for FY 2026-27: one says the new **Form 140** replaces 26Q, another still says 26Q — [search summary of TaxHeal / Busy pages above]
- GST rate on government works contracts: works contracts for government were **12%** (Notf. 20/2019-CTR era), raised to 18% for many categories from 18 Jul 2022 (Notf. 03/2022-CTR) — [wbxpress WB memo](https://wbxpress.com/change-contract-amount-enhancement-gst/). Secondary sources say the remaining 12% government works entries moved to **18% from 22 Sep 2025 (GST 2.0)** — [disytax](https://disytax.com/?p=24147); [MS Associates](https://www.msassociates.pro/gst/gst-service-construction.php). **The notification number for the 2025 change was not confirmed.**

### Worked example (illustrative; arithmetic follows the cited rules)
RA bill (taxable value) ₹10,00,000 + GST 18% ₹1,80,000 = invoice ₹11,80,000. Intra-state works contract for a State PWD (a deductor under s.51(1)(a)); contract value well above ₹2.5L; contractor is a company or firm.

| Line | Basis | Amount (₹) |
|---|---|---|
| Gross invoice | 10,00,000 + 1,80,000 | 11,80,000 |
| GST-TDS CGST 1% | on 10,00,000 (excl. GST, s.51 Explanation) | 10,000 |
| GST-TDS SGST 1% | on 10,00,000 | 10,000 |
| Income-tax TDS 2% (s.393(1) Sl. 6(i), non-individual) | on 10,00,000* | 20,000 |
| Net before retention / LD / other recoveries | | **11,40,000** |

*Using the GST-exclusive amount as the income-tax TDS base relies on CBDT Circular 23/2017 (TDS not on the GST component when shown separately). **I did not verify this in this session; it comes from background knowledge.** Confirm that it carries over under the Income-tax Act 2025 before publishing. If the deductor is an inter-state IGST case: IGST-TDS ₹20,000 in place of the CGST + SGST lines. The ₹20,000 GST-TDS then reaches the contractor's electronic cash ledger only after the contractor accepts it on the portal (see A1).

### Inferences
- With invoice-wise GSTR-7, the RA bill number and date the contractor issues must match what the department reports. A SaaS that keeps RA bill numbers, dates and taxable value consistent should cut down "rejected by deductee" loops. This is a product angle, not law.
- Two different "TDS" deductions on one bill (GST 2% + IT 1/2%) is the most common confusion. A side-by-side table is a clear content gap (see B3).

### Gaps
- I could not confirm the official notification number for the 22 Sep 2025 works-contract rate change, or whether every government works entry moved to 18%.
- CBDT Circular 23/2017's continued applicability under the Income-tax Act 2025 is unverified.
- Form 140 vs 26Q for FY 2026-27 is unresolved.

---

## B1. Liquidated damages: CPWD GCC Clause 2 (rate, cap), extension of time, hindrance register

### Takeaway
Copies of **GCC 2023** found by search show Clause 2 compensation at a **maximum of 1% per month of delay, computed per day**, "based on quantum of damage suffered", with the **total capped at 10% of the accepted Tendered Value**. The often-quoted "1.5% per month" comes from **older** CPWD forms (2008–2014 era). Treat the 1% figure as probable, not confirmed: no verbatim official cpwd.gov.in copy could be read.

### Cited Findings
- GCC 2023 (copy hosted by Puducherry PWD; the title reads "General Conditions of Contract for PWD Works – 2023"): "maximum rate @ 1% (one percent) maximum per month of delay to be computed on per day basis based on quantum of damage suffered due to stated delay on the part of Contractor… Provided always that the total amount of compensation for delay…" (the snippet is cut off before the cap) — [pwd.py.gov.in GCC 2023](https://pwd.py.gov.in/sites/default/files/gcc-2023-web-copy.pdf)
- An IIT Kanpur tender copy titled "General Conditions of Contract 2023 Construction Works" shows the same 1% per month per-day wording, and says compensation is without prejudice to the Engineer-in-Charge's action under Clause 3 — [IITK GCC2023](https://www.iitk.ac.in/iwd/file/2025/01-AC-EE-2025/GCC2023.pdf); [IITK alt copy](https://iitk.ac.in/iwd/file/2025/04-AC-EE-2025/GCC2023.pdf)
- Cap: "shall not exceed 10% of the accepted Tendered Value of work" (analysis of GCC 2020) — [AIJR chapter on CPWD Clauses 2/5/25](https://books.aijr.org/index.php/press/catalog/book/112/chapter/976); [ResearchGate](https://www.researchgate.net/publication/350989245_Analysis_of_Compensation_for_Delay_and_Settlement_of_Disputes_Clauses_in_CPWD_Contract_Guidelines). A 10% cap also appears in the IIT Bombay copy — [IITB gc.pdf](https://www.iitb.ac.in/deanpl/tenders/chemlabr/gc.pdf)
- Older versions: "@ 1.5% per month of delay to be computed on per day basis", capped at 10% (in some versions the 1.5% is applied to the value of incomplete work) — [ICTS 2008 conditions](https://www.icts.res.in/sites/default/files/media/attachments/files/Conditions-and-Clauses-of-Contract.pdf); [IIT Madras CPWD Form 8](https://tenders.iitm.ac.in/sites/default/files/CPWD%20Form%208%20-%20Annexure_0.pdf); [iconofhumanity commentary](http://iconofhumanity.com/article.php?id=4)
- Clause 2 also covers failure to keep the milestone progress under Clause 5, and lets amounts be withheld at milestones — [CPWD GCC 2019 copy](https://www.niperhyd.ac.in/Tenders/CPWD_GCC.pdf)
- RITES GCC for Works (Feb 2023), a different employer, uses ½% of tendered value **per week**, capped at 10%. Don't conflate it with CPWD — [RITES GCC 2023](https://rites.com/Upload/MediaGallery/PDF/3/RITES_GCC_for_Works,_February_2023_pdf-2023-Feb-25-11-14-35.pdf)
- Extension of time (practice / audit): a CAG audit of UP road works found extensions granted without levying LD for contractor-attributable delays (sickness, rain), called the practice irregular, and noted a contractual 21-day period for the Engineer to decide on an EoT request — [CAG Report 4 of 2017, Ch. 11](https://cag.gov.in/uploads/download_audit_report/2017/Chapter_11_Contract_Variations_of_Report_No.4_of_2017_-_Contract_Management_in_Road_Works_Government_of_Uttar_Pradesh.pdf)
- Practitioner view: the EoT clause exists largely to preserve the employer's right to levy LD, because an employer cannot levy LD for delay it caused itself — [Planning Planet forum](https://planningplanet.com/index.php/comment/35110) (commentary, not authority)

### Inferences
- The phrase "based on quantum of damage suffered" in GCC 2023 suggests CPWD moved from a flat 1.5% LD to a "maximum 1%" tied to actual damage. That fits the Section 74 case law in B2. This is an inference, so verify against the full official text.
- For page copy, a safe framing is: "CPWD GCC 2023: up to 1% per month (per-day basis), capped at 10% of tendered value. Older CPWD contracts: 1.5% per month. Always check your agreement."

### Gaps
- No verbatim official CPWD GCC 2023 Clause 2 text was read (cpwd.gov.in blocked). The rate base (tendered value vs. value of incomplete work) under GCC 2023 is unconfirmed.
- I could not verify the Clause 5 hindrance-register format or timelines (e.g. the contractor's notice period for EoT applications) from GCC 2023.
- I could not confirm whether GCC 2023 has a bonus/incentive clause (Clause 2A).

---

## B2. LD law: Indian Contract Act s.74 and key Supreme Court cases; LD vs penalty; deducting LD from RA bills; worked example

### Takeaway
s.74 lets the injured party recover only **reasonable compensation up to the stated sum**, whether the clause calls it LD or a penalty. Saw Pipes (2003) let pre-estimated LD stand without strict proof where loss is hard to prove. Kailash Nath (2015) stressed that legal injury or loss is a sine qua non and that the stated sum is a ceiling. Construction & Design Services v DDA (2015) presumed loss from delay in a **public utility** project and upheld the Clause 2 compensation.

### Cited Findings
- s.74 baseline: reasonable compensation not exceeding the named amount. Where loss is impossible or difficult to prove, a genuine pre-estimate can be awarded — [SCC Online blog](https://www.scconline.com/blog/?p=391523); [LiveLaw column](https://www.livelaw.in/amp/columns/profit-and-loss-liquidated-damages-indian-contract-act-1872-penalty-compensation-breach-of-contract-177688)
- **ONGC v Saw Pipes (2003) 5 SCC 705**: buyer deducted LD for delayed supply. The Court held that where loss is difficult to prove and the parties pre-estimated it, letting the party in breach escape liability would be unjustified. In that case the clause expressly called the sum "an agreed, genuine pre-estimate of damages". Where loss can be calculated, it must be proved — [Bar & Bench (Pachnanda)](https://www.barandbench.com/amp/story/columns/commercial-law-monologues-liquidated-damages-on-whom-does-the-burden-of-proof-lie); [iPleaders](https://blog.ipleaders.in/liquidated-damages-meaning/); [Casemine column](https://www.casemine.com/in/column/liquidated-damages-under-indian-contract-law:-doctrinal-evolution-and-contemporary-judicial-trends/view)
- **Kailash Nath Associates v DDA, (2015) 4 SCC 136**: the named sum is recoverable only if it is a genuine pre-estimate. Otherwise only reasonable compensation is awarded, not exceeding the named sum. The Court called damage or loss a sine qua non for s.74. On the facts (earnest-money forfeiture in an auction) there was no breach, so forfeiture was not allowed — [SCI digital SCR PDF](https://digiscr.sci.gov.in/admin/judgement_file/judgement_pdf/2015/volume%201/Part%20I/2015_1_627_1703075485.pdf); [iPleaders on KNA](https://blog.ipleaders.in/determination-of-contractual-damages-u-s-74-with-reference-to-the-kailash-nath-associates-kna-case/); [IndiaCorpLaw](https://indiacorplaw.in/2015/06/24/the-supreme-court-on-penalties-and/)
- Commentators disagree on whether Kailash Nath requires proof of actual loss in all cases. One Bar & Bench piece argues a headnote-based misreading — [Bar & Bench "Disentangling s.74"](https://www.barandbench.com/law-firms/view-point/disentangling-section-74-from-the-illusion-of-actual-loss-the-pitfalls-of-headnote-based-misinterpretation); [Mondaq](https://www.mondaq.com/india/contracts-and-commercial-law/950450/curious-case-of-section-74-of-the-indian-contract-act)
- **Construction & Design Services v DDA, (2015) 14 SCC 263** (decided 4 Feb 2015): sewage pumping station at Kondli Gharoli; contract dated 4 Oct 1995; terminated for delay. The SE levied **₹20,86,446 under Clause 2**. The Court held loss can be presumed from delay in a public-utility project (environmental degradation), and that interest on blocked capital is a measure of damages. **Note: "(2015) 4 SCC 136" is Kailash Nath, not CDS** — [SCI judgment PDF](https://api.sci.gov.in/jonew/judis/42354.pdf); [LegitQuest](https://www.legitquest.com/case/ms-construction-design-services-v-delhi-devtauth/8EEEB); [Bar & Bench critique](https://www.barandbench.com/law-firms/view-point/damages-without-proof-of-loss-the-supreme-courts-overbroad-public-utility-presumption)
- Fateh Chand (1963): s.74 dispenses with proof of "actual loss" but does not justify compensation where no legal injury resulted — [Bar & Bench critique (quoted)](https://www.barandbench.com/law-firms/view-point/damages-without-proof-of-loss-the-supreme-courts-overbroad-public-utility-presumption)

### Worked example (illustrative; uses the GCC 2023 maximum rate found above and should be labelled as such)
Tendered value ₹1,00,00,000. Stipulated completion missed by 45 days. Assume the EE determines the maximum rate is justified and no EoT has been granted (hindrances not proven).
- Rate = 1% per month of tendered value = ₹1,00,000/month → per-day basis ≈ ₹1,00,000 ÷ 30 × 45 = **₹1,50,000** (whether a 30-day month or calendar days is used depends on the contract; this is an assumption).
- Cap = 10% × ₹1,00,00,000 = ₹10,00,000, so not binding here.
- Same delay under an old 1.5%/month contract ≈ ₹2,25,000.
- On the RA bill this appears as an "LD / compensation for delay" recovery line, after GST-TDS and IT-TDS. In the A2 example, a ₹1,50,000 levy would reduce the net from ₹11,40,000 to ₹9,90,000. Any amounts withheld at milestones under Clause 2 are typically released or adjusted once the final EoT/LD decision is taken (inferred from the milestone-withholding wording in [GCC 2019 copy](https://www.niperhyd.ac.in/Tenders/CPWD_GCC.pdf); not verified for 2023).
- If the delay is partly the department's fault (hindrance register entries), EoT shortens the delay counted for LD. Under s.74 / Kailash Nath, the contractor can challenge the levy as exceeding reasonable compensation. Under CDS, a public-utility employer may rely on presumed loss.

### Inferences
- LD vs penalty: Indian law (s.74) does not void "penalty" clauses the way English law does. It reduces any stipulated sum to reasonable compensation capped at that sum. This difference is often muddled in SERP content and is worth stating clearly.
- Whether an employer can deduct LD from running bills before LD is adjudicated is an important practical question. I found **no 2023–26 Supreme Court authority** on it in this session (see Gaps).

### Gaps
- I could not retrieve the full judgment texts (Supreme Court PDFs found but not fetchable), so the holdings rest on search summaries and commentary.
- I found no post-2020 Supreme Court ruling on LD in construction (e.g. on unilateral deduction from RA bills or set-off against other contracts). A targeted case-law search is needed.
- I could not verify GCC 2023's exact per-day computation convention.

---

## B3. SERP / AI-answer picture, PAA-style questions and gaps for a contractor-focused page

### Takeaway
GST-TDS results are dominated by tax-compliance publishers (ClearTax, TaxGuru, Taxmann, StudyCafe, gstgyaan/gstzen, myBillBook, TaxBuddy, Corpbiz) and government PDFs (state tax circulars, GST portal FAQ). LD results are dominated by legal commentary (iPleaders, SCC Online, Bar & Bench, Mondaq, IndiaCorpLaw, Casemine) and copies of CPWD-style GCC PDFs. Almost no ranking page is written **from the contractor's billing side** or combines GST-TDS + IT-TDS + LD on one RA bill.

### Cited Findings (observed in search results, US-located tool, not a google.co.in ranking)
- GST-TDS queries surfaced: myBillBook, TaxGuru, TaxBuddy, Corpbiz, the GeM GST-TDS notification PDF, the Bihar BICA study PDF, the Assam TDS circular — [myBillBook](https://mybillbook.in/s/?p=19876); [TaxGuru](https://taxguru.in/goods-and-service-tax/gst-tds-2supply-government-entities-w-e-f-1st-oct-2018.html); [TaxBuddy](https://www.taxbuddy.com/blog/tds-under-gst); [Corpbiz](https://corpbiz.io/learning/tds-under-gst-a-comprehensive-guide/); [GeM PDF](https://assets-bg.gem.gov.in/resources/pdf/GeM_GST_TDS_Notification.pdf)
- GSTR-7 queries surfaced: ClearTax (GSTR-7 guide and invoice-wise TDS page), Taxmann, TaxGuru, Techjockey — [ClearTax GSTR-7](https://cleartax.in/s/gstr-7-gst-return); [ClearTax invoice-wise](https://cleartax.in/s/invoice-wise-tds-reporting-gstr-7); [Techjockey](https://www.techjockey.com/blog/what-is-gstr-7)
- Section 393 queries surfaced: ClearTax, India Briefing, TDSMAN, Busy, TaxHeal — [ClearTax s.393](https://cleartax.in/s/section-393-of-income-tax-act)
- LD queries surfaced: iPleaders (several), SCC Online blog, Bar & Bench, LiveLaw, Mondaq, Casemine, IndiaCorpLaw. One niche tool page also appeared: InfraLens "PMC Contract & Billing — Liquidated Damages (LD) Calculation", a **direct product-type competitor** — [InfraLens LD calc](https://infralens.in/pmc/billing/liquidated-damages-calculation)
- CPWD Clause 2 queries surfaced mostly institutional tender PDFs (IITs, NITs, PWD Puducherry), the AIJR academic chapter, and iconofhumanity.com commentary — [see B1 sources]

### Inferred PAA-style questions (not observed; the tool shows no PAA boxes)
- GST-TDS: "Is TDS under GST 1% or 2%?", "Is GST TDS deducted on the value including GST?", "Does GST TDS apply if the RA bill is below ₹2.5 lakh?", "How do I claim GST TDS credit as a contractor?", "What happens if I reject TDS in the GST portal?", "Are both GST TDS and income-tax TDS deducted from a contractor bill?", "Who is required to deduct TDS under GST?", "What is GSTR-7A?", "Is GST TDS applicable to PSUs / municipal corporations?"
- LD: "How is liquidated damages calculated in construction?", "What is the maximum LD in CPWD contracts?", "Is LD 1% or 1.5% per month in CPWD?", "Difference between liquidated damages and penalty in India", "Can LD be deducted from running bills?", "Is LD levied if extension of time is granted?", "What is a hindrance register?", "Is GST payable on liquidated damages?" (Circular 178/10/2022-GST exists on this point, but **it was not verified in this session**)

### Inferences — content gaps truesitesync can own
1. **A single RA-bill deduction waterfall** (gross → GST-TDS 2% on taxable value → IT-TDS s.393 → retention / security deposit → LD → net). None of the observed pages combines GST and income-tax TDS on one bill.
2. **Contractor-side credit workflow**: accept on portal → cash ledger → reconcile with invoice-wise GSTR-7 (new since Sept 2025). Most pages are written for the deductor.
3. **2026 currency**: many pages still cite s.194C only, or the pre-2024 GSTR-7 late fee (22/2021). An up-to-date page citing s.393 and Notf. 23/2024 and 09/2025 would be fresher.
4. **CPWD Clause 2 rate confusion (1% in GCC 2023 vs 1.5% in old forms)**: few pages spell this out, and none observed offered a calculator.
5. **An LD calculator plus a short legal explainer** (s.74, Saw Pipes, Kailash Nath, CDS) written for site engineers and billing staff, not lawyers. Only InfraLens was observed attempting a tool.
6. Put calculators and tables up front. Law-firm and iPleaders pages are long-form prose without worked numbers.

### Gaps
- No live Google India SERP, ranking positions, search volumes or AI Overview text could be observed (US-located search tool; no SERP/keyword tool available).
- PAA questions are inferred, not observed.
- Circular 178/10/2022-GST (GST on LD) and CBDT Circular 23/2017 were not verified.
