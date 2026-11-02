"""Mux audio, export final MP4s + cover.jpg, and run automated checks."""
import json, os, subprocess
from PIL import Image, ImageDraw, ImageFilter
import render as R

P = R.P
OUT = R.OUTDIR

def run(cmd):
    subprocess.run(cmd, check=True)

def mux(video, out):
    run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-i', os.path.join(P, 'audio', 'mix_final.wav'),
         '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
         '-t', '35', '-movflags', '+faststart', out])

def cover():
    A = R.load()
    fr = R.scene1(A, 2.2, None)
    fr = R.apply_vig(fr)
    cv = fr.convert('RGBA')
    dark = Image.new('RGBA', cv.size, (0, 0, 0, 70))
    cv.alpha_composite(dark)
    R.place(cv, R.text_img('Profit = ', 120), R.CX - 150, 620)
    R.place(cv, R.text_img('???', 150, color=R.RED), R.CX + 245, 620, rot=-6)
    R.place(cv, R.text_img('Project done. Payment received.', 50), R.CX, 760)
    logo = A['logo'].resize((130, 130), Image.LANCZOS)
    name = R.text_img('True Site Sync', 54)
    tw = name.width - 40
    left = R.CX - (130 + 16 + tw) / 2
    R.place(cv, logo, left + 65, 1380)
    R.place(cv, name, left + 130 + 16 + tw / 2, 1380)
    cv.convert('RGB').save(os.path.join(OUT, 'cover.jpg'), quality=92)

def probe(f):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,r_frame_rate,sample_rate',
                          '-of', 'json', f], capture_output=True, text=True).stdout
    return json.loads(out)

if __name__ == '__main__':
    mux(os.path.join(P, 'build', 'video_captions.mp4'), os.path.join(OUT, 'true_site_sync_reel_v1.mp4'))
    mux(os.path.join(P, 'build', 'video_nocaptions.mp4'), os.path.join(OUT, 'true_site_sync_reel_v1_nocaptions.mp4'))
    cover()
    for f in ['true_site_sync_reel_v1.mp4', 'true_site_sync_reel_v1_nocaptions.mp4']:
        print(f, json.dumps(probe(os.path.join(OUT, f))))
