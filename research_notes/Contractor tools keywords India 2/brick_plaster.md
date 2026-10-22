# Brick calculator and plaster calculator (India): formulas, standard values, SERP and gaps

Tool limits, read first: WebFetch and curl could not reach any source host (the egress proxy refused connections to law.resource.org, bricknbolt.com, civilconcept.com and deendayalport.gov.in). Every finding below comes from **search-result snippets and summaries**, not from full pages I read. I could **not** open the primary texts of IS 1077, IS 2212, IS 1661 or the CPWD Specifications/DSR. Values marked "code" are as reported by secondary sites (mostly infralens.in) and must be checked against the BIS/CPWD text before the page cites them as code values. The arithmetic labelled "computed" is my own calculation (python), based on the stated assumptions.

Labels: **[CODE-reported]** = a standard's value as quoted by a secondary site; **[PRACTICE]** = estimating convention found in Indian textbooks and rate analyses; **[BLOG]** = a figure from a blog or calculator site; **[COMPUTED]** = my arithmetic.

## Brick sizes and bricks per m³ (modular vs conventional)

### Takeaway
A modular IS 1077 brick (190×90×90 mm) gives exactly 500 bricks/m³ with 10 mm joints. A conventional 230×110×70 brick gives about 434/m³, and 230×110×75 or 230×115×75 bricks give about 392–409/m³. The "450–550 for conventional bricks" figure in the brief is not supported by the arithmetic: conventional bricks give fewer per m³ than modular ones, because each brick is bigger.

### Cited Findings
- [CODE-reported] IS 1077 standard modular size is 190×90×90 mm (Cl. 7.1) — [InfraLens IS 1077](https://infralens.in/code/IS-1077); modular bricks are described as machine-made — [Housing.com](https://housing.com/news/brick-size)
- [CODE-reported / conflicting] Sources disagree on the non-modular size: 230×110×70 mm ([Housing.com](https://housing.com/news/brick-size)); 230×115×75 mm ([InfraLens handbook](https://infralens.in/handbook/brick-types-strength)); 230×110×70–75 mm, "still common in northern India" ([InfraLens IS 1077-1992](https://infralens.in/code/IS-1077-1992)); 230×110×70 is also listed under the fly-ash brick standard IS 13757 ([InfraLens IS 13757](https://infralens.in/code/IS-13757-1993)). Primary text (not fetched): [IS 1077:1992 on law.resource.org](https://law.resource.org/pub/in/bis/S03/is.1077.1992.pdf)
- [PRACTICE] Method: brick with mortar = 200×100×100 mm = 0.002 m³, so 1/0.002 = 500 bricks. Bare brick = 0.001539 m³, 500 × 0.001539 = 0.7695 m³, leaving wet mortar = 0.2305 m³. Add 5% wastage — [CivilConcept](https://www.civilconcept.com/how-to-calculate-number-of-bricks-in-one-cubic-meter/); [Brick&Bolt](https://www.bricknbolt.com/blogs-and-articles/construction-guide/how-much-cement-is-required-for-1-cubic-meter-of-brickwork)
- [BLOG] One calculator's per-brick mortar formula has an arithmetic error that gives a near-zero mortar figure — [EngineeringHulk](https://engineeringhulk.com/brick-calculator/)
- [BLOG] InfraLens warns against using the "500 bricks per m³" thumb rule blindly, since brick type, joint thickness and wet vs dry mortar all change the count — [InfraLens IS 2212 calc](https://infralens.in/knowledge/brickwork-calculation-is-2212)
- [CODE-reported / conflicting] Joint thickness: 10 mm standard per an IS 2212:1991 summary ([InfraLens IS 2212](https://infralens.in/code/IS-2212-1991)); "nominally 10 mm, not exceeding 15 mm" ([InfraLens IS 1443](https://infralens.in/code/IS-1443-1992)); a contract clause gives "6 mm first class, 10 mm second class" ([LawInsider](https://lawinsider.com/clause/brick-masonry/_2))
- [COMPUTED] Bricks/m³ with 10 mm joints, and the wet mortar left over:
  | Brick (mm) | With joint (mm) | Bricks/m³ | Wet mortar m³ |
  |---|---|---|---|
  | 190×90×90 (modular) | 200×100×100 | 500 | 0.2305 |
  | 230×110×70 | 240×120×80 | 434 | 0.231 |
  | 230×110×75 | 240×120×85 | 408 | 0.225 |
  | 230×115×75 | 240×125×85 | 392 | 0.222 |
- [PRACTICE] Wastage of about 5% → about 525 modular bricks per m³ ordered (500 × 1.05) — [CivilConcept](https://www.civilconcept.com/how-to-calculate-number-of-bricks-in-one-cubic-meter/); a 5,000 bricks per 10 cum basis plus 5% wastage also appears in a rate-analysis summary — [InfraLens rate analysis](https://infralens.in/rate-analysis/brickwork-cm-1-6)

### Inferences
- Whatever the brick size, wet mortar comes to about 22–23% of the brickwork volume. That is why the "~0.23 m³ wet / ~0.30 m³ dry" rule holds broadly.
- A calculator should take brick size and joint thickness as inputs, with modular and 230×110×70 as presets. Most competitor calculators hard-code only one of them (see SERP).

### Gaps
- The exact IS 1077 clause text (sizes, tolerances measured over 20 bricks, 2008 amendment) could not be fetched.
- The true local spread (Kolkata, Punjab and South India sizes vary) has no authoritative source.

## Mortar per m³ of brickwork, mixes, cement bags and sand

### Takeaway
The standard derivation is 0.2305 m³ wet mortar × 1.33 (dry factor) = about 0.307 m³ dry mortar. At 1:6 that gives about 1.26 bags of cement and 0.263 m³ of sand per m³ of modular brickwork. Rate analyses and blogs often use a rounded 0.25–0.30 m³ of mortar, so their published cement figures range from about 1.2 to 1.9 bags/m³.

### Cited Findings
- [PRACTICE/BLOG] 0.23 m³ wet × 1.33 dry factor, with a 50 kg bag = 0.0347 m³, gives about 1.26 bags at 1:6. Published range "1.25–1.35 bags" — [Brick&Bolt](https://www.bricknbolt.com/blogs-and-articles/construction-guide/how-much-cement-is-required-for-1-cubic-meter-of-brickwork). A Hindi-summarised version gives about 0.3 m³ dry, 1.26 bags and 0.263 m³ sand ([Brick&Bolt alt](https://www.bricknbolt.com/blogs-and-articles/how-much-cement-is-required-for-1-cubic-meter-of-brickwork))
- [BLOG / conflicting] Other sites give 1.2–1.5, 1.4 or 1.88 bags of cement and 0.25, 0.31 or 0.39 m³ of sand per cum of 1:6 brickwork; one uses a dry-mortar allowance of 30% of the brickwork volume — [InfraLens rate analysis](https://infralens.in/rate-analysis/brickwork-cm-1-6); [Studio Matrx](https://www.studiomatrx.org/students/estimation-specification/rate-analysis); [ConstructionEstimatorIndia](https://constructionestimatorindia.com/?p=15802)
- [BLOG] Market (non-CPWD) Delhi rates for CM 1:6 brick masonry run about ₹7,248–₹9,108 per cum, including 12–15% overheads — same sources as above. These are not official.
- [BLOG] One Brick&Bolt example gives "1.30 m³ dry volume" and "≈1.5 m³ sand". This looks like an internal error or a different basis, so do not reuse it — [Brick&Bolt](https://www.bricknbolt.com/blogs-and-articles/construction-guide/how-much-cement-is-required-for-1-cubic-meter-of-brickwork)
- [CODE-reported] 1:6 cement:sand is cited as a general-purpose masonry mix (IS 1443 / IS 6041 summaries). I found no snippet confirming that IS 2212 itself prescribes 1:6 — [InfraLens IS 1443](https://infralens.in/code/IS-1443-1992); [InfraLens IS 6041](https://infralens.in/code/IS-6041)
- [COMPUTED] Per m³ of modular brickwork (wet mortar 0.2305 m³; bag 0.0347 m³):
  | Mix | Dry factor 1.27: cement bags / sand m³ | Dry factor 1.33: cement bags / sand m³ |
  |---|---|---|
  | 1:4 | 1.69 / 0.234 | 1.77 / 0.245 |
  | 1:5 | 1.41 / 0.244 | 1.47 / 0.255 |
  | 1:6 | 1.21 / 0.251 | 1.26 / 0.263 |
- [COMPUTED] Worked example, 10 m³ of modular brickwork in 1:6: bricks 5,000 + 5% = 5,250; dry mortar = 10 × 0.2305 × 1.33 = 3.066 m³; cement = 3.066/7 = 0.438 m³ = 12.6 bags; sand = 3.066 × 6/7 = 2.63 m³.
- [PRACTICE] Half-brick wall: [BLOG] about 48 bricks/m² for 230×115×75 + 10 mm ([EveryCalculators](https://everycalculators.com/brickwork-cement-calculator.html)); 58 bricks/m² and 0.6 bag/m² for a 115 mm wall ([InfraLens handbook](https://infralens.in/handbook/material-quantities)). The 0.6 bag figure looks far too high next to the arithmetic below; the 58 figure is unexplained. About 50/m² for a South African 222×106×73 brick ([OurPower](https://ourpower.co.za/tools/brick-calculator)).
- [COMPUTED] Half-brick wall arithmetic:
  - Modular 90 mm wall: face per brick = 0.2 × 0.1, so 50 bricks/m². Wet mortar = 0.09 − 50 × 0.001539 = 0.0131 m³/m².
  - 230×110×70 (110 mm, "4.5 inch") wall: 1/(0.24 × 0.08) = 52 bricks/m². Wet mortar = 0.11 − 52.08 × 0.001771 = 0.0178 m³/m². At 1:4 with ×1.33 that is about 0.0047 m³ cement = 0.14 bag/m².
- [BLOG] An India calculator gives "about 1,000–1,040 bricks per 100 sq ft of 9-inch wall" using 190×90×90 — [TotalCalcHub](https://totalcalchub.com/in/home-improvement/brick-calculator). Check: 100 sq ft = 9.29 m² × 0.2 m (nominal 9" modular wall) = 1.858 m³ × 500 = 929 bricks before wastage. Their figure seems to include wastage, or uses 0.23 m thickness.

### Inferences
- The 1.27 vs 1.33 dry-factor choice changes results by only about 5%. The much larger spreads between sources come from rounded mortar volumes (0.25 vs 0.30) and from errors.
- A brick and mortar page that shows each step (bricks → wet mortar → dry → ratio split → bags) is a clear way to stand out from the competing pages.

### Gaps
- The CPWD DAR coefficients (bricks per cum and mortar per cum for item 6.x) could not be verified: the CPWD/port DSR PDFs were unreachable.
- I could not confirm whether IS 2212 prescribes specific mortar mixes.

## Plaster: mortar per m², thickness, mixes, IS 1661 and CPWD

### Takeaway
Plaster quantity is area × thickness (wet), plus about 20% for joint and frog filling and undulations, times a dry factor of 1.27–1.33. For 100 m² of 12 mm plaster at 1:6 that comes to roughly 7.5–7.9 bags of cement and 1.6 m³ of sand. Published per-m² figures range from 0.066 to 0.092 bags, because sites differ on the 20% allowance and on wastage.

### Cited Findings
- [CODE-reported] IS 1661 thickness: single-coat 12 mm; two-coat work = 10–12 mm undercoat + 3–8 mm finish. Curing at least 7 days; at least 2 days between coats; rake joints about 10 mm and wet the surface before plastering — [InfraLens IS 1661](https://infralens.in/code/IS-1661); [IS 1661-1972](https://infralens.in/code/IS-1661-1972)
- [PRACTICE] Internal plaster about 12 mm; external 15–20 mm in two coats; ceiling about 6 mm — [InfraLens thumbrules](https://infralens.in/thumbrules/internal-plaster-thickness)
- [PRACTICE / conflicting] Mixes: internal 1:4 to 1:6, external richer at 1:3 to 1:4, cement-lime 1:1:6 ([InfraLens cement plaster](https://infralens.in/term/cement-plaster)). Another example uses a 12 mm base at 1:5 plus an 8 mm finish at 1:4 for external work (same site). A calculator site says 1:4 internal and 1:3 external ([EveryCalculators](https://everycalculators.com/cement-and-sand-ratio-for-plastering-calculator.html)). The brief's "1:4 ceiling, 1:6 walls" is common Indian practice, but I found no snippet tying it to IS 1661.
- [CODE-reported, partial] CPWD/DSR-pattern schedules list 12 mm cement plaster in 1:4 and 1:6 as separate sub-items, and 20 mm plaster as another item (item 13.x series). I could not read the exact item 13.4 wording — [Deendayal Port DSOR Vol 2 (DSR-based)](https://www.deendayalport.gov.in/wp-content/uploads/2023/01/DSOR-VOL-2-FINAL-COPY.pdf); an SBI tender BOQ has 12 mm plaster in 1:4 at item 13.1 — [SBI price bid](https://sbi.co.in/webfiles/uploads/files_2425/200920241209-PRICE%20BID%20CIVIL%20WORK.pdf)
- [PRACTICE] Method: add about 20% to the wet volume for joint filling, then a dry factor (+25% in one module) — [Scribd Module 2](https://www.scribd.com/document/803872337/Module-2); dry factor 1.27 ([EveryCalculators](https://everycalculators.com/plastering-cement-sand-calculation.html)); 1.33 or 1.35 at other sites; 1:4 example 0.019 m³ dry/m² → 0.11 bag/m² ([IndiaBix](https://www.indiabix.com/civil-engineering/estimating-and-costing/discussion-5081-1-4)); an IS 1542 plastering-calculation page also exists ([InfraLens IS 1542](https://infralens.in/knowledge/plastering-calculation-is-1542))
- [BLOG / conflicting] Published per-m² figures for 12 mm at 1:6: 0.066 bag (3.3 kg) + 0.0137 m³ sand/m², 6.56 bags/100 m², using ×1.33 with no 20% allowance ([HouseYog](https://www.houseyog.com/blog/cement-and-sand-required-for-plastering/)); 0.092 bag/m², plus 15% cement and 20% sand wastage ([InfraLens thumbrule](https://infralens.in/thumbrules/plaster-cement-per-sqm)); 0.230 bag/m² for 20 mm 1:4 (same site).
- [BLOG / conflicting, per 100 sq ft] about 30 kg at 12 mm 1:6 ([HouseYog](https://www.houseyog.com/blog/cement-and-sand-required-for-plastering/)); about 1 bag + 3.2 cft sand ([Brick&Bolt](https://www.bricknbolt.com/blogs-and-articles/how-much-cement-and-sand-are-required-for-plastering)); 1.86 bags at 1:4 ([Akij](https://akijresource.com/how-much-cement-required-for-100-square-feet-plaster)); "about 220 kg at 12 mm 1:4", reportedly from UltraTech ([UltraTech](https://ultratechcement.com/for-homebuilders/home-building-explained-single/descriptive-articles/what-is-plastering-ratio)). Check: 100 sq ft = 9.29 m² → wet 0.111 m³ ×1.2 ×1.33 = 0.178 m³ dry; /5 = 0.0356 m³ ≈ 51 kg. So the 220 kg and 1.86-bag figures are about 2–4 times too high. I saw the UltraTech figure only as a search summary, not on the page.
- [COMPUTED] 100 m², with 20% allowance, bag = 0.0347 m³, cement bags / sand m³:
  | Thickness | 1:4 (×1.27) | 1:4 (×1.33) | 1:6 (×1.27) | 1:6 (×1.33) |
  |---|---|---|---|---|
  | 12 mm | 10.5 / 1.46 | 11.0 / 1.53 | 7.5 / 1.57 | 7.9 / 1.64 |
  | 15 mm | 13.2 / 1.83 | 13.8 / 1.92 | 9.4 / 1.96 | 9.9 / 2.05 |
  | 20 mm | 17.6 / 2.44 | 18.4 / 2.55 | 12.6 / 2.61 | 13.1 / 2.74 |
- [COMPUTED] Worked example, 100 m² × 12 mm, 1:6: wet = 1.2 m³; +20% = 1.44 m³; ×1.27 = 1.829 m³ dry; cement = 1.829/7 = 0.261 m³ = 7.5 bags (×1440 kg/m³ = 376 kg); sand = 1.829 × 6/7 = 1.57 m³. Without the 20% allowance and ×1.33, cement = 6.57 bags, which matches HouseYog's 6.56.

### Inferences
- Most of the per-m² spread comes from whether the 20% allowance and a separate wastage allowance are both applied. A calculator should show these as separate toggles.
- Plaster thickness and mix are surface-dependent (internal, external, ceiling). Presets of 6, 12, 15 and 20 mm would match how people search.

### Gaps
- I could not read the IS 1661:1972 text directly; its ceiling thickness, mix guidance and any revision status are unverified. The CPWD Specifications 2019 Vol 2 chapter 13 clause text is not verified.
- The UltraTech page itself was not read; the 220 kg figure may be a misreading by the search summary.

## SERP and AI-answer picture, PAA, Hindi queries, gaps

### Takeaway
The pages answering these queries are mostly mid-authority Indian blogs (Brick&Bolt, HouseYog, CivilConcept, Akij), thin programmatic calculator farms (everycalculators.com, with dozens of near-duplicate URLs), a fast-growing code-aware site (infralens.in), and cement-brand pages (UltraTech, Prism). Civilsir, TheConstructor, GharPedia and DailyCivil did **not** appear in these US-region results; that does not mean they are absent from Google.co.in. AI answers converge on "500 bricks, 0.23 m³ wet, about 1.26 bags at 1:6", but disagree widely on plaster bags.

### Cited Findings
- Brick queries returned civilconcept, engineeringhulk, infralens, everycalculators and bricknbolt — [CivilConcept](https://www.civilconcept.com/how-to-calculate-number-of-bricks-in-one-cubic-meter/); [EngineeringHulk](https://engineeringhulk.com/brick-calculator/); [InfraLens](https://infralens.in/thumbrules/bricks-per-cum-brickwork)
- India calculators: [TotalCalcHub India brick calculator](https://totalcalchub.com/in/home-improvement/brick-calculator) (9" and 4.5" walls, 190×90×90, 1:6); [EveryCalculators India](https://everycalculators.com/brick-sand-cement-calculator-india.html) (some pages default to 230×115×75 and cite statistics I could not verify); [Prism Cement calculator](https://www.prismcement.com/cement-calculator)
- Plaster queries returned HouseYog, Brick&Bolt, InfraLens, Akij, UltraTech, Scribd docs and IndiaBix — links above.
- The Hindi query "1 cubic meter me kitni int" returned the same English pages (CivilConcept, Brick&Bolt), with no Hindi-language page in the results. "plaster me kitna cement lagta hai 100 sq ft" returned UltraTech, Akij, HouseYog and Brick&Bolt — search results above; [UltraTech](https://ultratechcement.com/for-homebuilders/home-building-explained-single/descriptive-articles/what-is-plastering-ratio)

### Inferences
- PAA-style questions (inferred, not observed): How many bricks in 1 m³ / 1 cubic foot / 100 sq ft of 9" wall? How much cement for 1 m³ brickwork in 1:6? How many bricks per m² of a 4.5" wall? Modular vs local brick size? How much cement for 100 sq ft of plaster? 12 mm vs 20 mm plaster? Ratio for internal and external plaster? Why multiply by 1.27 or 1.33? How many bags per 100 m² of plaster?
- Gaps to exploit:
  1. A brick-size input with presets. Most pages assume 190×90×90 even though 230×110×70/75 dominates many markets; the 434 vs 500 difference is a real buying error.
  2. Transparent, conflict-reconciling plaster numbers, with toggles for the 20% allowance, the dry factor and wastage, plus a note on why sources differ (0.066–0.092 bag/m²; inflated per-100-sq-ft figures).
  3. Hindi or Hinglish content. No Hindi page appeared for the Hindi queries.
  4. Sq ft and cft outputs alongside metric, and outputs in kg and bags.
  5. A clear label for code vs practice values. Few competitors cite IS 1077, IS 2212, IS 1661 or CPWD precisely; InfraLens is the exception and the main competitor on authority.
  6. Fixing errors seen on competitors (EngineeringHulk's mortar formula; Brick&Bolt's 1.30 m³ / 1.5 m³ sand example).

### Gaps
- WebSearch is US-region only, so the actual Google.co.in rankings, PAA boxes, AI Overview text and search volumes were not observed.
- The Civilsir, TheConstructor, GharPedia and DailyCivil pages for these queries were not surfaced, so I could not assess them.
- No keyword-volume data (no SEO tool access).
