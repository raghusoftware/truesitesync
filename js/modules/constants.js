/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Shared constants
 * ═══════════════════════════════════════════════════════════
 */

/** Unit weight (kg/m) of TMT steel bars by diameter (mm), for BBS calcs. */
export const BBS_UNIT_WEIGHTS = {
  6: 0.222, 8: 0.395, 10: 0.617, 12: 0.889, 16: 1.580, 20: 2.469,
  25: 3.858, 28: 4.834, 32: 6.313, 36: 7.990, 40: 9.864
};

// Indian GST state code (first 2 digits of a GSTIN) → state name.
export const GST_STATE = {
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand','06':'Haryana',
  '07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland',
  '14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand',
  '21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','25':'Daman & Diu','26':'Dadra & Nagar Haveli',
  '27':'Maharashtra','28':'Andhra Pradesh (Old)','29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala',
  '33':'Tamil Nadu','34':'Puducherry','35':'Andaman & Nicobar','36':'Telangana','37':'Andhra Pradesh','38':'Ladakh'
};
