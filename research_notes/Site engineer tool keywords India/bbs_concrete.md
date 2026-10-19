# BBS / Steel Weight Calculator and Concrete / Cement-Bag Calculator: Formulas, Code Values and SERP (India, Oct 2026)

Research method and tool limits (read first):
- WebSearch is US-located; results are not a true google.co.in SERP and do not show rank positions, PAA boxes or AI Overviews. "Who ranks" below means "who surfaced in search results," not verified India rankings.
- WebFetch failed with DNS errors (ENOTFOUND) for every host tried: law.resource.org (IS 456 full text), archive.org (IS 456 text), downloads.cadsglobal.com (RebarCAD IS 2502 shape-code PDF) and infralens.in. **No primary BIS text was read directly.** All code values below come from search-result summaries of secondary sources (college notes, handbooks, NCB table reproduction, software help). Each is labelled:
  - **[CODE, secondary-confirmed]**: a code value reported consistently by 2 or more secondary sources, or by an institutional reproduction (NCB, Bentley, university notes).
  - **[CODE, recollection, unverified]**: my training knowledge of the IS text. No source fetched this session confirms it. A page builder must check it against the BIS PDF before publishing.
  - **[PRACTICE]**: a common site or blog convention, not code-mandated.
  - **[ARITHMETIC]**: computed by me in Python this session (reproducible).
- 15 tool calls were used. Hindi SERP and the AI-answer picture are thin (see Gaps).

## Q1. BBS: steel unit weight (D²/162), its derivation and the standard weights for 6–40 mm

### Takeaway
D²/162 kg/m (D in mm) comes from steel density 7850 kg/m³. The exact constant is 4×10⁶/(π×7850) = 162.196, so "162" slightly over-reads (by about 0.12%) compared with the IS 1786 nominal masses, which are computed from π/4·D²·7850. A good calculator should show both and explain the difference. IS 1786 also allows a mass tolerance per metre, so weighbridge weight will differ from the D²/162 weight. This is the hook for "steel reconciliation."

### Cited Findings
- Unit weight = D²/162 kg/m, D in mm. Examples: 8 mm ≈ 0.395 kg/m, 12 mm ≈ 0.888 kg/m. Some sources use 162.2 instead. The constant is derived from (π/4)×D²×7850/10⁶ — [sreemetaliks BBS blog](https://sreemetaliks.com/blog/bar-bending-schedule-bbs-construction); [infralens rebar weight tool](https://infralens.in/tools/rebar-weight); [civils.ai rebar weight](https://civils.ai/free-construction-estimating-software/rebar-weight)
- The actual constant is 162.114 per one source, and some IS 1786-based sources use 162.2. Note that my own computation gives 162.196, so the "162.114" figure in that source appears wrong — [engineeringhulk steel bar weight calculator](https://engineeringhulk.com/steel-bar-weight-calculator/); [AmbitionBox interview Q on d²/162](https://www.ambitionbox.com/interviews/question/where-is-the-formula-d-or-162-derived-from-AGEGCkhe)
- Published unit weights: 8 mm 0.395, 10 mm 0.617, 12 mm 0.888, 16 mm 1.578/1.580, 20 mm 2.466, 25 mm 3.853 kg/m — [engineeringhulk](https://engineeringhulk.com/steel-bar-weight-calculator/); [infralens rebar weight chart per IS 1786](https://infralens.in/knowledge/rebar-weight-chart-is-1786)
- Total bar weight = No. of bars × cutting length × unit weight — [sreemetaliks](https://sreemetaliks.com/blog/bar-bending-schedule-bbs-construction)
- IS 1786 mass tolerance: sources conflict. One summary gives ±7% for 6–8 mm and ±5% for 10–12 mm (size-banded). Another cites a flat "±3% per IS 1786 Cl. 9.2" and a third cites ±3.5%. Treat these as unverified — [engineeringhulk / search summary](https://engineeringhulk.com/steel-bar-weight-calculator/); [sreemetaliks](https://sreemetaliks.com/blog/bar-bending-schedule-bbs-construction)
- [ARITHMETIC] Unit weights for 6–40 mm, D²/162 vs exact π/4·D²·7850 (kg/m):

| Dia (mm) | D²/162 | Exact (7850 kg/m³) |
|---|---|---|
| 6 | 0.222 | 0.222 |
| 8 | 0.395 | 0.395 |
| 10 | 0.617 | 0.617 |
| 12 | 0.889 | 0.888 |
| 16 | 1.580 | 1.578 |
| 20 | 2.469 | 2.466 |
| 25 | 3.858 | 3.853 |
| 28 | 4.840 | 4.834 |
| 32 | 6.321 | 6.313 |
| 36 | 8.000 | 7.990 |
| 40 | 9.877 | 9.865 |

  Constant = 4×10⁶/(π×7850) = 162.196.

### Inferences
- The "Exact" column matches the figures sources attribute to IS 1786 (0.888, 1.578, 2.466, 3.853), which suggests IS 1786 nominal masses are π/4·D²·7850 values. A calculator should default to the IS 1786 column and show D²/162 as the "site shortcut." Content angle: "why your D²/162 total is 0.1–0.2% higher."
- The tolerance dispute (±7/5/3% size-banded vs flat ±3%) matters for reconciling theoretical BBS weight against supplier invoice weight. The sources disagree, so a page should state the range and link to IS 1786 rather than assert one value.

### Gaps
- Could not open IS 1786:2008 to confirm the nominal mass table or the Cl. on mass tolerance (fetch blocked).
- Did not confirm whether 28/36 mm appear in the IS 1786 nominal size list; 6–40 mm were computed, not sourced.

## Q2. BBS: cutting-length rules (bend deductions, hooks, lap, development length, stirrups) and code vs practice

### Takeaway
Only development length, bend/hook *anchorage values* and lap length are IS 456 code rules. The popular "bend deductions" (45° = 1d, 90° = 2d, 135° = 3d) and the "hook = 9d/10d" and "lap = 50d" figures are site/blog conventions loosely attributed to IS 2502/SP 34. Sources disagree on 135° and 180° values. A calculator should make every deduction and hook value user-editable with defaults labelled "common practice."

### Cited Findings
**Code-based (IS 456:2000)**
- [CODE, secondary-confirmed] Development length Ld = φ·σs/(4·τbd), with σs = 0.87fy at ultimate. τbd for deformed bars is the plain-bar value increased by 60% (Cl. 26.2.1.1) — [engineeringhulk bond/anchorage](https://engineeringhulk.com/civil/rcc-design/bond-anchorage-development-length/); [Bentley RAM Concept IS 456 development lengths](https://docs.bentley.com/LiveContent/web/RAM%20Concept%20Help-v16/en/GUID-4F0A7DC7-FED9-4559-95CF-B261C7DDB35D.html)
- [CODE, secondary-confirmed] Anchorage value of a bend = 4φ for each 45° bend, max 16φ. Standard U-type hook anchorage = 16φ (Cl. 26.2.2.1) — [JNTUA GATE notes](https://jntua.ac.in/gate-online-classes/registration/downloads/material/a159109558880.pdf); [IndiaBix discussion](https://www.indiabix.com/civil-engineering/rcc-structures-design/discussion-1757); [engineeringhulk](https://engineeringhulk.com/civil/rcc-design/bond-anchorage-development-length/). Note: these are anchorage credits for development length, NOT the cutting-length bend deductions; blogs often conflate the two.
- Sources quote Ld for Fe500 in M25 ≈ 47φ, and Ld for Fe500 in M20 = 55d. Lap in tension is given variously as 1.5Ld, Ld+30%, or 1.3/1.5 × Ld depending on % lapped. These conflict — [infralens lap/development length](https://infralens.in/knowledge/lap-length-development-length-is-456); [infralens splice lap length](https://infralens.in/handbook/splice-lap-length)
- [ARITHMETIC] Using τbd (plain) M20 = 1.2 and M25 = 1.4 N/mm² (as used in the engineeringhulk source), ×1.6 for deformed bars:
  - Fe415 + M20: 0.87·415/(4·1.92) = **47.0φ**
  - Fe500 + M20: 435/(7.68) = **56.6φ**
  - Fe500 + M25: 435/(4·2.24) = **48.5φ**

  So the widely quoted "47d" is the Fe415/M20 figure, not Fe500/M25. A page that gets this right differentiates itself.
- [CODE, recollection, unverified] IS 456 Cl. 26.2.5.1(c) lap length:
  - Flexural tension: Ld or 30φ, whichever is greater.
  - Direct tension: 2Ld or 30φ.
  - Compression: Ld (compression) but not less than 24φ.

  Search results did NOT confirm this, and the "1.5Ld/1.3Ld" figures in secondary sources look like other codes (e.g. ACI/EC2 lap classes). Must be verified against the BIS text.

**IS 2502 / SP 34 (detailing, bending)**
- IS 2502:1963 ("Code of practice for bending and fixing of bars for concrete reinforcement") defines standard shape codes in an annex. RebarCAD India publishes a support document for IS 2502-1963 shape codes, showing that commercial BBS software uses them — [RebarCAD India IS2502-1963 shape codes PDF (title only; fetch blocked)](https://downloads.cadsglobal.com/rc2dsuiteautoupdate/2026/RebarCAD-India/documents/Support_for_IS2502-1963_Shape_Codes.pdf); [infralens IS 2502 1963](https://infralens.in/code/IS-2502-1963)
- Hook allowance: 9φ for mild steel (k=2), and 11φ, 13φ, 17φ for higher-strength steels (larger bend radius), per an IS 2502 summary. A standard U-hook is commonly 9d — [infralens IS 2502 1963](https://infralens.in/code/IS-2502-1963); [infralens IS 2502 1969](https://infralens.in/code/IS-2502-1969). Minimum internal bend radius is described as k×d, with k = 4 for cold-worked/HYSD bars under 25 mm — [search summary of RebarCAD/infralens](https://www.infralens.in/code/IS-2502-Part-1-1963/clause/hooks-bends)

**Common practice (blogs/site)**
- [PRACTICE] Hook = 9d or 75 mm; bend deductions 45° = 1d, 90° = 2d, 135° = 3d — [civilconcept BBS calculators](https://www.civilconcept.com/bar-bending-schedule-of-square-or-rectangular-column-calculator/); [infralens bar bending shapes](https://infralens.in/handbook/bar-bending-shapes); [LinkedIn BBS basics](https://in.linkedin.com/in/ajay2511)
- Conflicts: 135° deduction = 1.5d in one CAD generator vs 3d elsewhere. 180° deduction = 4d in one table. 90° bend allowance = 5d vs 5.5d. 90° hook = 9d vs 8d vs 4d+8d — [infralens CAD BBS shapes generator](https://infralens.in/cad-library/generator/bbs-shapes); [infralens term IS 2502](https://infralens.in/term/is-2502)
- [PRACTICE] Stirrup cutting length = perimeter + hook lengths − bend deductions. For a rectangular stirrup with 135° hooks: 3 × 90° bends + 2 × 135° bends, e.g. 2(a+b) + 2×9d − (deductions). One handbook gives a simplified 2(a+b) + 24d. The sources' formulas are internally inconsistent (one uses a 12d hook in the formula but 9d in its worked example) — [infralens bar bending shapes](https://infralens.in/handbook/bar-bending-shapes); [civilconcept helical/diamond stirrup calculators](https://www.civilconcept.com/cutting-length-of-diamond-ties-stirrups-calculator/)
- [PRACTICE] "Lap = 50d" (and 40d/45d variants) is a site rule of thumb. No fetched source tied 50d to an IS clause. It is roughly consistent with the computed Ld of 47–57φ for Fe415/Fe500 in M20.

### Inferences
- Label in the calculator UI:
  - Code-based: Ld formula, the 4φ/45° and 16φ anchorage credits, minimum lap per IS 456.
  - Practice: bend deductions, hook = 9d/10d, lap = 50d, stirrup 135° hook length.
- 135° seismic hooks: IS 13920 (ductile detailing) governs stirrup hooks in seismic zones. [CODE, recollection, unverified]: 135° hook with extension of 6d but not less than 65 mm. Not confirmed this session.
- Shape-code-driven BBS (IS 2502 shape codes → auto cutting length) is offered by paid desktop software (RebarCAD). It was not seen in free Indian web calculators, which are per-element (beam/column/slab) templates.

### Gaps
- Could not read IS 2502:1963, SP 34:1987 or IS 456 directly (fetch blocked). The exact shape-code table, bend-radius table and lap clause wording are unverified.
- No authoritative (BIS/NPTEL/IIT) source surfaced for "45° = 1d, 90° = 2d, 135° = 3d". These appear to be practice approximations of (bend allowance − straight-length overlap) and should be presented as such.
- IS 13920:2016 stirrup hook rule not verified.

## Q3. Concrete: IS 456 nominal mixes, dry-volume factor, cement bags per m³ and w/c limits

### Takeaway
IS 456 permits nominal mixes only up to M20 (M10 1:3:6, M15 1:2:4, M20 1:1.5:3). M25 and above must be design mixes per IS 10262:2019. The site method (wet volume × 1.54 → split by ratio → cement ÷ 0.0347 m³/bag) gives **M20 = 8.06 bags, M15 = 6.34, M10 = 4.44** per m³ [ARITHMETIC]. This matches published answers ("~8 bags / ~400 kg for M20").

### Cited Findings
- [CODE, secondary-confirmed] Nominal mix proportions: M10 1:3:6, M15 1:2:4, M20 1:1.5:3 (IS 456 Cl. 9 / Table 9). Nominal mixes are limited to M20 and below; above M20 a design mix is required. "M25 = 1:1:2" is a comparison figure, not a permitted nominal mix — [RCET college notes](https://rcet.org.in/uploads/academics/rohini_48314460737.pdf); [infralens concrete mix ratios](https://infralens.in/handbook/concrete-mix-ratios); [infralens M20 nominal mix](https://infralens.in/thumbrules/concrete-nominal-mix-m20); [Chettinad Tech MCQ](https://www.chettinadtech.ac.in/MCQ2021/CE8404_CT_UNIT%20III.pdf)
- [CODE, secondary-confirmed] IS 456 Table 5, reinforced concrete, 20 mm aggregate:

  | Exposure | Min cement (kg/m³) | Max free w/c | Min grade |
  |---|---|---|---|
  | Mild | 300 | 0.55 | M20 |
  | Moderate | 300 | 0.50 | M25 |
  | Severe | 320 | 0.45 | M30 |
  | Very severe | 340 | 0.45 | M35 |
  | Extreme | 360 | 0.40 | M40 |

  Sources: [NCB India CDR table](https://www.ncbindia.com/ncb-center/cdr/CDR-cmd5.pdf) (labels units kg/m², a typo); [infralens w/c ratio](https://infralens.in/handbook/water-cement-ratio); [infralens w/c guide](https://www.infralens.in/knowledge/water-cement-ratio-guide). Amendment No. 4 (May 2013) is hosted by UltraTech — [UltraTech IS 456 amendments PDF](https://www.ultratechcement.com/content/dam/ultratechcementwebsite/solutions/new/pfds/IS-456-Amendments-2013.pdf). One secondary source gave 320/340 for Moderate/Severe, which conflicts with NCB; NCB is preferred.
- IS 10262:2019 governs mix proportioning, and the Table 5 minimum cement content acts as a floor in design — [infralens IS 10262 cl 4.4](https://infralens.in/code/IS-10262-2019/clause/4-4)
- [PRACTICE] Dry-volume factor 1.54 (range 1.50/1.52–1.57) accounts for voids in loose dry sand/aggregate that fill on mixing and compaction, plus bulking and spillage. It is an empirical estimation factor, not a code value — [engineeringhulk concrete volume calculator](https://engineeringhulk.com/concrete-volume-calculator/); [infralens material calculator](https://infralens.in/tools/material-calculator); [bricknbolt how to calculate](https://www.bricknbolt.com/blogs-and-articles/construction-guide/how-to-calculate-cement-sand-and-aggregates)
- [PRACTICE] Cement bulk density 1440 kg/m³, so a 50 kg bag = 0.0347 m³ — [bricknbolt bags per m³](https://www.bricknbolt.com/blogs-and-articles/construction-guide/how-many-bags-of-cement-required-for-one-cubic-meter)
- Published M20 answers: 8.064 → "8 bags" — [bricknbolt M20](https://www.bricknbolt.com/blogs-and-articles/how-much-cement-is-required-for-m20-concrete-mix). Another source gives 8 bags = 400 kg, 662 kg sand, 1201 kg aggregate, 198.5 L water — [civilconcept M20](https://civilconcept.com/cement-calculation-for-m20-concrete). A third gives 7.8 bags (~390 kg) — [infralens cement bags M20](https://infralens.in/thumbrules/cement-bags-per-cum-m20). An outlier gives 310–330 kg/m³ — [hellogravel](https://hellogravel.com/?p=25741). Cement brands also publish M20 explainers — [UltraTech M20 ratio](https://www.ultratechcement.com/for-homebuilders/home-building-explained-single/descriptive-articles/what-is-m20-concrete-ratio); [JK Cement M20 per m³](https://www.jkcement.com/blog/construction-planning/how-to-calculate-m20-concrete-mix-ratio-for-1-cubic-metre/)
- [ARITHMETIC] Per 1 m³ wet concrete (bag = 50/1440 = 0.034722 m³):

| Mix | Factor | Cement m³ | Bags | Cement kg | Sand m³ | Agg m³ |
|---|---|---|---|---|---|---|
| M7.5 1:4:8 | 1.54 | 0.1185 | 3.41 | 171 | 0.474 | 0.948 |
| M10 1:3:6 | 1.54 | 0.154 | 4.44 | 222 | 0.462 | 0.924 |
| M15 1:2:4 | 1.54 | 0.220 | 6.34 | 317 | 0.440 | 0.880 |
| M20 1:1.5:3 | 1.52 | 0.276 | 7.96 | 398 | 0.415 | 0.829 |
| **M20 1:1.5:3** | **1.54** | **0.280** | **8.06** | **403** | **0.420** | **0.840** |
| M20 1:1.5:3 | 1.57 | 0.286 | 8.22 | 411 | 0.428 | 0.856 |
| "M25" 1:1:2 (not a code nominal mix) | 1.54 | 0.385 | 11.09 | 554 | 0.385 | 0.770 |

  The user's "M20 ≈ 8.06 bags" is verified.

### Inferences
- Applying 1:1:2 to M25 gives about 554 kg/m³ cement (about 11 bags), which is far above typical design-mix cement contents. This is a strong content point: "don't use 1:1:2 for M25; get an IS 10262 design mix." I did not source a typical M25 design-mix cement content, so don't state a number without one.
- The calculator should show the factor (1.52/1.54/1.57) as a selectable assumption, plus an optional wastage % (one third-party site recommends a 5–10% buffer — [everycalculators](https://everycalculators.com/cement-sand-aggregate-calculator.html)).
- The M20 = 8.06 result also clears the Table 5 minimum (403 kg > 300 kg/m³ Mild). M15 (317 kg) is fine for PCC, but M20 is the minimum grade for RCC (Mild exposure).

### Gaps
- IS 456 Table 9 water and aggregate figures were not verified. [CODE, recollection, unverified]: aggregate per 50 kg cement = 800 kg (M5), 625 (M7.5), 480 (M10), 330 (M15), 250 (M20); water per 50 kg cement = 60, 45, 34, 32, 30 L. Note that Table 9 is actually mass-based; the "1:1.5:3 by volume" is the popular translation. Verify before publishing.
- No primary IS 456 text fetched (law.resource.org and archive.org blocked).

## Q4. SERP and AI-answer picture, with exploitable gaps

### Takeaway
The surfaced results are dominated by:
- Indian blog/calculator sites: infralens.in, engineeringhulk.com, civilconcept.com, bricknbolt.
- Cement-brand explainers: UltraTech, JK Cement.
- Third-party "everycalculators" pages borrowing the UltraTech name.
- App-store BBS apps.

theconstructor, civilsir, dailycivil and gharpedia did NOT surface in US-located searches, which is a tool limitation, not evidence of absence. AI answers give "~8 bags for M20" and "D²/162", but they consistently flag conflicting bend/lap values. A code-labelled, editable-assumption calculator is the gap.

### Cited Findings
- Steel weight / BBS results surfaced:
  - infralens.in (BBS tool "Based on IS 2502", rebar weight tool "Based on IS 1786", handbooks, code-clause pages) — [infralens BBS tool](https://infralens.in/tools/bbs)
  - engineeringhulk steel bar weight calculator — [link](https://engineeringhulk.com/steel-bar-weight-calculator/)
  - civilconcept per-element BBS calculators (column, crank beam, helical/diamond stirrups) — [link](https://www.civilconcept.com/bar-bending-schedule-of-crank-beam-calculator/)
  - constructionestimatorindia BBS Excel guide — [link](https://constructionestimatorindia.com/?p=16811)
  - sreemetaliks (steel manufacturer) BBS blog — [link](https://sreemetaliks.com/blog/bar-bending-schedule-bbs-construction)
  - civils.ai — [link](https://civils.ai/free-construction-estimating-software/rebar-weight)
- BBS app/paid competitors:
  - Constropedia Steel BBS Calc iOS app (slabs, columns, footings, beams, retaining walls) — [App Store](https://apps.apple.com/in/app/constropedia-steel-bbs-calc/id1606618896)
  - "Bar Bending Schedule rebar bbs" app — [App Store](https://apps.apple.com/py/app/bar-bending-schedule-rebar-bbs/id6447794489?l=en-GB)
  - CivilQuant Pro (paid BOQ/BBS) — [superprofile](https://superprofile.bio/vp/civil-qaunt-pro-building-cost-estimator)
  - Paid BBS Excel template — [payhip](https://payhip.com/b/mLg16)
  - RebarCAD India (IS 2502 shape codes, desktop) — [cadsglobal](https://downloads.cadsglobal.com/rc2dsuiteautoupdate/2026/RebarCAD-India/documents/Support_for_IS2502-1963_Shape_Codes.pdf)
- "BBS format excel" SERP is heavily polluted with spam PDF mirrors on unrelated domains (e.g. deervalley.com, 5by5.tv, altnews.in paths) — [example](https://audio.5by5.tv/news/bar-bending-schedule-xls). Legit format guidance lists columns: item no., description, dia, shape, length, no. of bars, total weight, bend details, remarks, drawing ref. — [sbrc2017 mirror (low quality)](https://sbrc2017.ufpa.br/trip/bar-bending-schedule-format)
- Concrete / cement-bag results surfaced:
  - bricknbolt (two articles) — [link](https://www.bricknbolt.com/blogs-and-articles/how-much-cement-is-required-for-m20-concrete-mix)
  - engineeringhulk concrete volume + cement-sand-aggregate calculators (M15/M20/M25) — [link](https://engineeringhulk.com/cement-sand-aggregate-calculator/)
  - civilconcept — [link](https://civilconcept.com/cement-calculation-for-m20-concrete)
  - UltraTech — [link](https://www.ultratechcement.com/for-homebuilders/home-building-explained-single/descriptive-articles/what-is-m20-concrete-ratio)
  - JK Cement — [link](https://www.jkcement.com/blog/construction-planning/how-to-calculate-m20-concrete-mix-ratio-for-1-cubic-metre/)
  - infralens thumb rules — [link](https://infralens.in/thumbrules/cement-bags-per-cum-m20)
  - hellogravel — [link](https://hellogravel.com/?p=25741)
- No official UltraTech calculator surfaced. everycalculators.com runs many "UltraTech cement calculator" pages, which signals brand-name query demand captured by a third party — [everycalculators UltraTech calculator](https://everycalculators.com/ultratech-cement-calculator.html)
- Hindi query "sariya ka weight kaise nikale" returned English calculator pages (engineeringhulk, infralens, civilconcept) plus one Hindi page on "1 soot sariya" — [comaron Hindi blog](https://www.comaron.com/blog/1-soot-sariya-kitne-mm-2026-size-weight-bundle-hindi). "1 cube concrete me kitna cement" returned only English pages (bricknbolt, UltraTech, JK Cement, civilconcept) — [bricknbolt](https://www.bricknbolt.com/blogs-and-articles/how-much-cement-is-required-for-m20-concrete-mix)
- AI-style search answers:
  - M20: "~8 bags (~400 kg)", with caveats to follow the mix design / IS 10262.
  - Steel: "D²/162, from 7850 kg/m³", noting the 162 vs 162.2 discrepancy.
  - Bends: they explicitly say bend deductions, 135°/180° values and lap lengths conflict across sources and tell the user to "verify against IS 2502/SP 34/IS 456". Observed in the WebSearch synthesis for each query above (e.g. [infralens bar-bending shapes](https://infralens.in/handbook/bar-bending-shapes)).

### Inferences (gaps to exploit)
1. **Code vs practice labelling:** No surfaced page separates IS 456 code values (Ld, anchorage credits, lap minima, Table 5) from site conventions (1d/2d/3d deductions, 9d hook, 50d lap). AI answers explicitly complain about conflicting values, so an authoritative, labelled table is likely to be cited.
2. **Correct Ld table:** Publish a computed Ld table (Fe415/Fe500/Fe550 × M20–M40) showing the formula. The widely repeated "47d for Fe500/M25" is wrong (47φ is Fe415/M20).
3. **Shape-code BBS calculator:** Free web tools are per-element templates. IS 2502 shape-code input with editable deductions, plus export to Excel/PDF in standard BBS columns, is otherwise only in paid desktop software (RebarCAD) or apps.
4. **Steel reconciliation link:** Theoretical (BBS) weight vs supplier/weighbridge weight, with an IS 1786 tolerance band and a wastage % column. None of the surfaced pages connect BBS output to procurement or reconciliation, which is a natural TrueSiteSync product tie-in.
5. **Concrete calculator with selectable assumptions:** Dry factor 1.52/1.54/1.57, wastage %, bag size (50 kg), output in bags + kg + m³ + CFT + brass (Indian site units). It should warn that M25+ requires an IS 10262 design mix and flag Table 5 minimum cement content and max w/c by exposure.
6. **Hindi/Hinglish content:** Hindi queries return English pages. A Hindi section/FAQ ("sariya ka weight kaise nikale", "1 cube concrete me kitna cement", "1 bori cement me kitna concrete") is an open lane.
7. **Spam-polluted "BBS format excel" SERP:** A clean downloadable BBS format (Excel/Google Sheet) with standard columns can win this query.
- Likely People-Also-Ask-style questions (inferred from repeated query patterns in results, NOT observed PAA boxes):
  - Why is steel weight D²/162?
  - What is the weight of a 12 mm bar per metre / per 12 m length?
  - How many bags of cement are in 1 m³ of M20/M15?
  - Why is 1.54 used?
  - What is the ratio of M25?
  - What is the lap length for a column/beam?
  - What is the stirrup cutting length formula?
  - How much steel per m³ of RCC?

### Gaps
- No true India (google.co.in) SERP positions, PAA boxes or Google AI Overview text could be captured (US-located search, no SERP API).
- theconstructor.org, civilsir.com, dailycivil.com and gharpedia.com never surfaced. Their rankings for these keywords are unknown, not absent.
- No search-volume data (keyword tools not available).
- Did not check Tata Tiscon / JSW Neosteel steel-weight calculators (brand competitors for the steel weight query); worth a follow-up.
