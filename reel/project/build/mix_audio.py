"""Mix VO + music (with drop-out 15.7–20.0s and ducking under VO) + SFX into a 35.0 s stereo track."""
import os, subprocess

P = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
A = lambda *x: os.path.join(P, 'audio', *x)
DUR = 35.0
VO_START = 0.05
DROP_START, DROP_END = 15.7, 20.0

# (file, start_s, gain_dB, trim_s or None)
SFX = [
    ('cha_ching_reversed.wav', 0.0, -12, None),
    ('bass_hit.wav', 0.0, -9, None),
    ('phone_ping.wav', 0.5, -14, None),
    ('record_scratch.wav', 4.8, -13, None),
    ('scroll_clicks.wav', 5.0, -20, None),
    ('scroll_clicks.wav', 6.5, -20, 1.4),
    ('site_ambience.wav', 8.0, -22, 7.6),
    ('whoosh_0.wav', 7.85, -14, None),
    ('whoosh_1.wav', 9.78, -14, None),
    ('whoosh_2.wav', 11.7, -14, None),
    ('whoosh_3.wav', 13.63, -14, None),
    ('whoosh_0.wav', 15.55, -15, None),
    ('clock_tick.wav', 15.75, -16, 4.2),
    ('whoosh_soft.wav', 19.75, -13, None),
    ('ding.wav', 20.05, -15, None),
    ('ui_click.wav', 20.8, -15, None),
    ('ui_click.wav', 21.5, -15, None),
    ('ui_click.wav', 22.2, -15, None),
    ('whoosh_soft.wav', 22.35, -17, None),
    ('ui_click.wav', 23.1, -15, None),
    ('whoosh_soft.wav', 24.05, -17, None),
    ('ui_click.wav', 24.8, -15, None),
    ('chime.wav', 26.1, -16, None),
    ('whoosh_soft.wav', 28.45, -17, None),
    ('cha_ching.wav', 28.7, -16, None),
    ('ui_click.wav', 29.7, -15, None),
    ('impact.wav', 30.8, -10, None),
    ('riser.wav', 31.4, -20, None),
]

def main():
    inputs = ['-i', A('vo_final.wav'), '-i', A('music_tense.m4a'), '-i', A('music_uplift.m4a')]
    for f, *_ in SFX:
        inputs += ['-i', A('sfx', f)]
    fc = []
    fc.append(f'[0:a]aformat=channel_layouts=stereo,adelay={int(VO_START*1000)}:all=1,apad=whole_dur={DUR}[vo]')
    fc.append('[vo]asplit=2[vomix][vokey]')
    # music: tense 0 → drop, silence, uplift from DROP_END to end
    fc.append(f'[1:a]aformat=channel_layouts=stereo,atrim=0:{DROP_START},afade=t=in:d=0.05,afade=t=out:st={DROP_START-0.35}:d=0.35,volume=-12dB[m1]')
    up_len = DUR - DROP_END
    fc.append(f'[2:a]aformat=channel_layouts=stereo,atrim=2.0:16.0,asetpts=PTS-STARTPTS,apad=whole_dur={up_len},afade=t=in:d=0.15,afade=t=out:st={up_len-1.4}:d=1.4,volume=-11dB,adelay={int(DROP_END*1000)}:all=1[m2]')
    fc.append(f'[m1][m2]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur={DUR}[mus]')
    # duck music under VO (≈ -10 dB more while VO speaks → music sits ~-26 dB under VO peaks)
    fc.append('[mus][vokey]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=250:makeup=1[musd]')
    labels = []
    for i, (f, st, g, trim) in enumerate(SFX):
        k = i + 3
        tr = f'atrim=0:{trim},afade=t=out:st={max(trim-0.3,0)}:d=0.3,' if trim else ''
        fc.append(f'[{k}:a]aformat=channel_layouts=stereo,{tr}volume={g}dB,adelay={int(st*1000)}:all=1[s{i}]')
        labels.append(f'[s{i}]')
    fc.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0:duration=longest[sfx]')
    fc.append('[musd]asplit=2[musd1][musst]')
    fc.append('[sfx]asplit=2[sfx1][sfxst]')
    fc.append(f'[vomix][musd1][sfx1]amix=inputs=3:normalize=0:duration=longest,atrim=0:{DUR},'
              'alimiter=limit=0.89:level=false,loudnorm=I=-14:TP=-1.5:LRA=9[out]')
    fc.append('[musst]atrim=0:35[mo]')
    fc.append('[sfxst]apad=whole_dur=35,atrim=0:35[so]')
    cmd = ['ffmpeg', '-v', 'error', '-y'] + inputs + ['-filter_complex', ';'.join(fc),
           '-map', '[out]', '-ar', '48000', '-ac', '2', A('mix_final.wav'),
           '-map', '[mo]', A('stem_music_ducked.wav'), '-map', '[so]', A('stem_sfx.wav')]
    subprocess.run(cmd, check=True)
    print('mixed')

if __name__ == '__main__':
    main()
