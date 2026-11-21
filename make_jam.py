# -*- coding: utf-8 -*-
"""Builds the Jam with Track (basic) page from app.src.js plus pieces shared with the Play with Track V2 prototype:
   - index.html : the shared look (CSS of the V2 prototype without the game / social rules) + this version's shell
   - app.js     : app.src.js with the BLE block of the V2 prototype dropped in
   - media/     : lj_data.js without licks / style events, and the LJ001 + LJ002 media files reduced to the stems
   - assets/    : icons, fonts, logo
Run:  python3 make_jam.py"""
import io, os, re, json, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(os.path.dirname(HERE), 'Play with Track V2 (LJ001 assets)')
rd = lambda p: io.open(p, encoding='utf-8').read()
def wr(p, s):
    io.open(p, 'w', encoding='utf-8').write(s); print('wrote', os.path.relpath(p, HERE), len(s))

# ---------- CSS ----------
html = rd(os.path.join(V2, 'index.html'))
css = html[html.index('<style>') + 7: html.index('</style>')]
cut = css.find('/* ---- stage')
if cut > 0: css = css[:cut]
DROP = re.compile(r'^\.(trk|lick|chal|take|recb|pl|plc|cv|spr|icn|chb|chgrid|prof|lbr|pd|podium|resbox|statrow|covrow|vl|cat|tile|tabstrip|tabin|turn|own|lbgap|stars|field|inp|lane|scard|srow|dot\.lk|dot\.mu|dot u)\b')
css = '\n'.join(l for l in css.split('\n') if not DROP.match(l.strip()))
for need in ['.flbl', '.cta', '.chk', '.anl', '.mx ', '.prog', '.ropt', '.bgrid', '.seg', '.now', '.fbwrap', '.bar', '.tlph', '.sheet', '.blebtn', '.ft', '.cmp', '.ci']:
    if need not in css: sys.exit('missing CSS rule ' + need)
css += u"""/* ---- Jam with Track ---- */
.drop { border:2px dashed var(--line); border-radius:10px; padding:22px 16px; display:flex; flex-direction:column; align-items:center; gap:8px; width:100%; color:var(--green); text-align:center; }
.drop:hover, .drop.over { border-color:var(--green); background:rgba(173,254,0,.05); }
.drop b { font-size:16px; color:#fff; } .drop span:not(.ic) { font-size:12px; color:rgba(255,255,255,.5); line-height:1.5; } .drop em { margin-top:4px; background:var(--green); color:#000; font-size:14px; font-weight:700; font-style:normal; border-radius:6px; padding:8px 20px; }
.jrow { background:var(--panel); border-radius:8px; display:flex; align-items:stretch; } .jrow.soon { opacity:.45; }
.jrow .go { flex:1; min-width:0; display:flex; align-items:center; gap:12px; padding:11px 12px; text-align:left; color:var(--green); }
.jrow .ri { flex:1; min-width:0; color:#fff; } .jrow .tt { font-size:14px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .jrow .mm { font-size:11.5px; color:rgba(255,255,255,.5); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.jrow .du { font-size:11px; color:rgba(255,255,255,.4); } .jrow .x { width:40px; color:rgba(255,255,255,.45); font-size:13px; border-left:1px solid var(--line); } .jrow .x:hover { color:var(--red); }
.jrow .kb { width:38px; height:38px; border-radius:6px; background:var(--panel2); color:var(--green); font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.empty { font-size:12.5px; color:rgba(255,255,255,.45); background:var(--panel); border-radius:8px; padding:14px; line-height:1.5; }
.hint2 { font-size:10.5px; color:rgba(255,255,255,.4); text-align:center; }
.note { font-size:11.5px; line-height:1.55; color:rgba(255,255,255,.6); background:rgba(80,188,255,.08); border-radius:8px; padding:10px 12px; }
.lbl .chip.mini { margin-left:2px; } .chip.mini.on { background:var(--green); color:#000; }
.tlph { top:15px; }
.sheet > * { flex-shrink:0; }
.frow { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; align-items:center; } .frow::-webkit-scrollbar { display:none; } .frow .chip { flex-shrink:0; } .frow .cnt { margin-left:auto; padding-left:8px; font-size:11px; color:rgba(255,255,255,.45); white-space:nowrap; flex-shrink:0; }
.tgrid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
.tcard { background:var(--panel); border-radius:10px; overflow:hidden; display:flex; flex-direction:column; text-align:left; border:1px solid transparent; transition:border-color .12s, transform .12s; } .tcard:hover { border-color:var(--green); transform:translateY(-1px); }
.tcard .art { position:relative; width:100%; aspect-ratio:2/1; overflow:hidden; } .tcard .art svg { position:absolute; inset:0; width:100%; height:100%; }
.tcard .key { position:absolute; left:8px; bottom:6px; font-size:22px; font-weight:700; color:#fff; text-shadow:0 1px 4px rgba(0,0,0,.6); line-height:1; }
.tcard .go { position:absolute; right:8px; bottom:8px; width:30px; height:30px; border-radius:50%; background:var(--green); color:#000; font-style:normal; font-size:12px; display:flex; align-items:center; justify-content:center; padding-left:2px; box-shadow:0 2px 8px rgba(0,0,0,.4); }
.tcard .art em { position:absolute; right:6px; top:6px; font-style:normal; font-size:9.5px; font-weight:700; background:rgba(0,0,0,.7); color:#fff; border-radius:4px; padding:3px 6px; }
.tcard .tt { font-size:13.5px; font-weight:700; padding:8px 10px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .tcard .mm { font-size:11px; color:rgba(255,255,255,.5); padding:2px 10px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tcard .tags { display:flex; gap:5px; padding:7px 10px 10px; } .tcard.soon .art { filter:saturate(.55) brightness(.7); } .tcard.soon .tt, .tcard.soon .mm { opacity:.6; }
"""
page = u"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Jam with Track — Litejam (basic version)</title>
<style>%s</style>
</head>
<body>
<div class="stage">
  <div class="phone" id="phone">
    <div class="topbar"><img src="assets/logo.png" alt="LiteJam"><button class="blebtn off" id="bleBtn" data-act="bleOpen">🎸 Connect</button></div>
    <div class="tri"><i style="background:#FF2020"></i><i style="background:#ADFE00"></i><i style="background:#50BCFF"></i></div>
    <div class="tabs" id="tabs"></div>
    <div class="view" id="view"></div>
    <div class="nav" id="nav"></div>
    <div class="ovl sheetbg" id="sheetbg" data-act="closeSheet"><div class="sheet" id="sheet"></div></div>
    <div class="ovl center" id="countOvl"><div style="font-size:13px;color:rgba(255,255,255,.6)" id="countLbl">Count-in</div><div class="big" id="countNum">1</div></div>
    <div class="ovl center" id="loadOvl"><div style="font-size:15px;font-weight:700;color:var(--green)" id="loadTitle">Loading</div><div style="font-size:12px;color:rgba(255,255,255,.55)" id="loadTxt"></div><div class="prog"><i id="loadBar"></i></div></div>
    <div class="ovl center" id="anOvl"><div style="font-size:16px;font-weight:700;color:var(--green)">Analysing your track</div><div style="background:var(--panel);border-radius:8px;padding:8px 14px;font-size:12.5px;max-width:80%%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" id="anName"></div><div class="anl" id="anList"></div><div class="prog"><i id="anBar"></i></div><div style="font-size:11px;color:rgba(255,255,255,.45)">On this device — nothing is uploaded</div></div>
    <div class="toast" id="toast"></div>
    <input type="file" id="filePick" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" multiple hidden>
  </div>
  <aside class="notes" id="notes"></aside>
</div>
<script src="media/lj_data.js"></script>
<script src="media/lj001_media.js"></script>
<script src="media/lj002_media.js"></script>
<script src="dsp.js?v=%s"></script>
<script src="app.js?v=%s"></script>
</body>
</html>
"""
VER = '20261121a'
wr(os.path.join(HERE, 'index.html'), page % (css, VER, VER))

# ---------- app.js = app.src.js + the BLE block ----------
v2 = rd(os.path.join(V2, 'app.js'))
a = v2.index('/* ================= BLE'); b = v2.index('/* ---- leaderboard')
ble = v2[a:b].rstrip() + '\n'
def rep(s, old, new, name):
    if s.count(old) != 1: sys.exit('BLE patch failed: %s (%d)' % (name, s.count(old)))
    return s.replace(old, new)
ble = rep(ble, ", ['#8dff1a', 'Lick: play this note now'], ['#ffb000', 'Lick: next note · blue note in Blues'], ['#123a70', 'Lick: the other notes of the lick (dim)']]", ", ['#ffb000', 'Blue note in the Blues scale'], ['#8dff1a', 'Chord view: the 3rd'], ['#ffb000', 'Chord view: the 5th']]", 'legend')
ble = rep(ble, 'scales, chord tones, target notes and the lick notes in time with the track.', 'the scale, the notes of each chord and the target notes, changing with the track.', 'intro')
ble = rep(ble, "bleOpen: () => { S.ctx = {}; openSheet('ble'); },", "bleOpen: () => openSheet('ble'),", 'bleOpen')
src = rd(os.path.join(HERE, 'app.src.js'))
if src.count('/*__BLE__*/') != 1 or src.count('/*__COVER__*/') != 1: sys.exit('marker missing')
# cover art: the illustrated scene per style, the same drawings as the game version
c0 = v2.index('const SCENE_BG = {'); c1 = v2.index('function ledArt'); cov = v2[c0:c1].rstrip() + '\n'
cov = '\n'.join(l for l in cov.split('\n') if not l.startswith('const MASCOT'))
h0 = v2.index('function hash(s)'); hashfn = v2[h0: v2.index('\n', h0)]
r0 = v2.index('const REAL_CAT = {'); realcat = v2[r0: v2.index('\n', r0)]
cover = '/* ================= cover art (shared with the game version) ================= */\n' + realcat + '\n' + hashfn + '\n' + cov
wr(os.path.join(HERE, 'app.js'), src.replace('/*__BLE__*/', ble).replace('/*__COVER__*/', cover))

# ---------- media ----------
os.makedirs(os.path.join(HERE, 'media'), exist_ok=True)
d = rd(os.path.join(V2, 'media', 'lj_data.js')); j = json.loads(d[d.index('{'): d.rindex('}') + 1])
KEEP = ['id', 'title', 'timeSig', 'bpm', 'ppq', 'ticksPerBar', 'beatTicks', 'bars', 'endTick', 'keyPc', 'keySuffix', 'loop', 'loopName', 'sections', 'scales', 'followName', 'chords']
packs = {}
for k, p in j['packs'].items():
    q = {f: p[f] for f in KEEP}; q['channels'] = [c for c in p['channels'] if c[0] != 'guide']; packs[k] = q
wr(os.path.join(HERE, 'media', 'lj_data.js'), u'// Jam with Track: track list + chords, sections and loop points of the delivered Litejam Tracks (from the V2 prototype data, without licks and style events)\nwindow.LJ_DATA = ' + json.dumps({'tracks': j['tracks'], 'packs': packs}, ensure_ascii=False) + ';\n')
for tid in packs:
    m = rd(os.path.join(V2, 'media', tid.lower() + '_media.js')); mj = json.loads(m[m.index('{', m.index('LJ_MEDIA.' + tid)): m.rindex('}') + 1])
    keep = {c[0]: mj[c[0]] for c in packs[tid]['channels']}
    wr(os.path.join(HERE, 'media', tid.lower() + '_media.js'), u'// Jam with Track: %s producer stems only (AAC, from the V2 prototype media)\nwindow.LJ_MEDIA = window.LJ_MEDIA || {};\nwindow.LJ_MEDIA.%s = ' % (tid, tid) + json.dumps(keep) + ';\n')

# ---------- assets ----------
os.makedirs(os.path.join(HERE, 'assets'), exist_ok=True)
for f in os.listdir(os.path.join(V2, 'assets')):
    p = os.path.join(V2, 'assets', f)
    if os.path.isfile(p): shutil.copy2(p, os.path.join(HERE, 'assets', f))
print('assets', sorted(os.listdir(os.path.join(HERE, 'assets'))))
