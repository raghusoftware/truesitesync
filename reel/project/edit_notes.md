# True Site Sync reel v1: edit notes

1080×1920, 30 fps, H.264 + AAC, 35.0 s. Instagram safe zone: no text in the top 250 px, the bottom 400 px or the right 150 px.

## Final timeline (cuts follow the voiceover paragraphs)

The brief's scene times (0/3/7/13/18/25/31 s) didn't fit the voiceover once it was sped up no more than 1.1×. Each cut moved to the start of its voiceover line instead.

| Scene | Brief | Final | Visual | Headline (upper-middle) |
|---|---|---|---|---|
| 1 Hook | 0–3 | **0.0–4.8** | You in the site office, worried at your phone. Push-in and shake. Cool grade. | "Project done. ✅" 0.25 s · "Payment received. ✅" 1.5 s · "Profit = ???" 3.0 s, "???" turns red and shakes at 3.35 s |
| 2 Excel | 3–7 | **4.8–8.0** | Laptop with a generic site spreadsheet scrolling faster and faster, plus cursor (sheet drawn locally, no brand UI) | "Excel = control? 🤔" |
| 3 Site chaos | 7–13 | **8.0–15.7** | 4 cuts of 1.925 s with whip blur: diesel into JCB, cement bags, labour register, phone chat with bill photos | "Site data →" then WhatsApp 📱 / Registers 📒 / Diaries 📓 tick in one per cut |
| 4 Split screen | 13–18 | **15.7–20.0** | Left: same spreadsheet with red "Last updated: 7 days ago". Right: live site (worker carrying cement), LIVE dot. Music off, clock ticks. | "Excel = LAST WEEK ❌" / "Site = TODAY ⚡" |
| 5 Solution | 18–25 | **20.0–26.0** | Real app screens over a blurred, warm site. 20.0 project home (arrow to project name, glow on Attendance, glow on Received/Spent/To receive) · 22.5 labour attendance · 24.2 payments (glow on Payment In/Out/Balance) | "Every expense → linked to the project 🔗" |
| 6 Result | 25–31 | **26.0–30.8** | A: 26.0–28.6, you in a helmet at golden hour, smiling at your phone. B: 28.6–30.8, project home zooming in, glow on the money row. | "Know profit DURING the project." + "Not after. ✅" |
| 7 CTA | 31–35 | **30.8–35.0** | Dark-to-brand gradient, logo scales in with a glow, "True Site Sync", truesitesync.com types in, "Link in bio 👆" bounces. Last 0.5 s held still for the loop thumbnail. | n/a |

## Audio
- **Voiceover:** `audio/vo_final.wav`. Higgsfield Inworld TTS, voice **Manoj (Hindi)**, single take. Pauses tightened to 50 ms, then sped up 1.077× (under the 1.1× cap), no words cut. Normalised to -14 LUFS. Starts at 0.05 s, ends at 34.0 s. Raw takes: `vo_manoj.wav`, plus `vo_arjun.wav` (unused alternative, 47.5 s, too long).
- **Word timings:** `audio/vo_words.json` (from Higgsfield speech-to-text phrase timings, split per word by length).
- **Music:** Higgsfield Sonilo. `music_tense.m4a` plays 0–15.7 s. Silence 15.7–20.0 s. `music_uplift.m4a` plays from its 2.0 s mark at 20.0–35 s. Ducked about 25 dB under the voice. Ducked stem: `audio/stem_music_ducked.wav`.
- **SFX:** synthesised locally in `audio/sfx/`, cue list in `build/mix_audio.py` (`SFX`). Stem: `audio/stem_sfx.wav`.
  - 0.0 reversed cha-ching + bass hit · 0.5 phone ping · 4.8 record scratch · 5.0/6.5 scroll clicks
  - 7.85/9.78/11.7/13.63/15.55 whooshes on cuts · 8.0–15.6 site ambience (machinery + hammering)
  - 15.75–19.95 clock tick · 19.75 swoosh + 20.05 ding · UI clicks at 20.8/21.5/22.2/23.1/24.8
  - 26.1 chime · 28.7 cha-ching (forward) · 30.8 logo impact · 31.4 riser
- **Final mix:** `audio/mix_final.wav`, -14.1 LUFS integrated, true peak below -1.5 dBTP.

## Captions
Word-by-word, max 3 words, Montserrat ExtraBold, white with black outline, centred at y≈1405 (above the bottom 400 px). Yellow #FFD400 for: profit, Excel, last week, today, project, mid-project, True Site Sync.

## Asset sources
- **You:** `refs/` (your 4 photos). Face stills `keyframes/kf1.png` and `kf6.png` (Nano Banana 2, identity from all refs, formal shirt, helmet in kf6).
- **Scene 1 and 6A motion:** `clips/s1.mp4` and `clips/s6a.mp4` (Kling 3.0) if present. Otherwise the renderer animates the face stills with push-in and shake.
- **Scene 3 stills:** `keyframes/s3_0..3.png` (Seedream 5 Lite), animated locally.
- **App screens (real, demo data):** cropped from `assets/play/store-v2/` (project home, payments, materials, above the marketing callouts) and `assets/play/screens/raw-3b-attendance-grid.png`. No UI was AI-generated.
- **Logo:** `assets/logo.png`, unmodified.
- **Spreadsheet:** `screens/sheet_tall.png`, drawn by `build/make_sheet.py`.

## Rebuild
```
cd reel/project/build
python3 make_sfx.py && python3 make_sheet.py
python3 mix_audio.py
python3 render.py          # writes video_captions.mp4 / video_nocaptions.mp4
python3 finalize.py        # mux + cover + probe
```
