/* Jam with Track — the basic practice version of Play with Track.
   Official Litejam backing tracks (producer stems) + your own uploads (one file or several stem files), with chords, scales, loop, speed, key and LEDs.
   Data: media/lj_data.js · Audio: media/lj00x_media.js (stems only) · Analysis and time-stretch: dsp.js */
(function () {
'use strict';
const DATA = window.LJ_DATA, MEDIA = window.LJ_MEDIA || {}, DSP = window.JWT_DSP;
const FW = 64, SH = 28, NFRET = 15, BARP = 62, MAXDUR = 600, MAXSTEMS = 6;
const NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const DEG = ['1','b2','2','b3','3','4','b5','5','b6','6','b7','7'];
const OPEN = [4, 11, 7, 2, 9, 4];            // string index 0 = high e
const QUAL = { dom7:[0,4,7,10], maj:[0,4,7], min:[0,3,7], min7:[0,3,7,10], maj7:[0,4,7,11] };
const QSUF = { maj:'', min:'m', dom7:'7', min7:'m7', maj7:'maj7' }, QNAME = { maj:'Major', min:'Minor', dom7:'7', min7:'m7', maj7:'maj7' };
const SCALES = { 'Minor Pentatonic':[0,3,5,7,10], 'Blues':[0,3,5,6,7,10], 'Natural Minor':[0,2,3,5,7,8,10], 'Major Pentatonic':[0,2,4,7,9], 'Major':[0,2,4,5,7,9,11],
  'Dorian':[0,2,3,5,7,9,10], 'Mixolydian':[0,2,4,5,7,9,10], 'Phrygian':[0,1,3,5,7,8,10] };
const PACK_SCALE = { pentMinor:'Minor Pentatonic', blues:'Blues', natMinor:'Natural Minor', pentMajor:'Major Pentatonic', major:'Major', follow:'follow' };
const FOLLOW = { dom7:'Mixolydian', maj:'Major Pentatonic', maj7:'Major Pentatonic', min:'Minor Pentatonic', min7:'Minor Pentatonic' };

const S = { tab:'jam', screen:'library', fb:'scale', scType:'Minor Pentatonic', scRoot:null, follow:false, pos:'full', labels:'notes', targets:true,
  loop:null, loopKind:null, abA:null, metro:false, countIn:true, speed:100, tr:0, ch:{}, sheet:null, ctx:null, edit:false, lf:{ style:'All', level:'All levels', ready:false }, lfKeep:false };
let T = null, UPL = [];                       // current track · the user's uploads

const $ = (id) => document.getElementById(id);
const mod = (n, m) => ((n % m) + m) % m;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const icon = (name, size) => `<span class="ic" style="--m:url('assets/${name}.png');width:${size}px;height:${size}px"></span>`;
let toastT; function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

/* ================= tracks ================= */
function officialTrack(id) {
  const p = DATA.packs[id], barLen = p.ticksPerBar / p.ppq * 60 / p.bpm;
  return { id, official:true, title:p.title, timeSig:p.timeSig, bpm:p.bpm, bpb:p.ticksPerBar / p.beatTicks, off:0, bars:p.bars, barLen, dur:p.bars * barLen, keyPc:p.keyPc, keySuffix:p.keySuffix,
    chords:p.chords.map(c => ({ pc:NOTE.indexOf(c.sym.match(/^[A-G]#?/)[0]), q:c.quality })), sections:p.sections, loopDef:{ a:p.loop.a / p.ticksPerBar, b:p.loop.b / p.ticksPerBar, name:p.loopName },
    stems:p.channels.map(c => ({ k:c[0], name:c[1], src:c[2] })), scales:p.scales.map(s => ({ type:PACK_SCALE[s[0]] || s[0], lvl:s[1], desc:s[2] })), followName:p.followName };
}
function uploadScales(u) {
  const f = { type:'follow', lvl:'Advanced', desc:'Changes with every chord, so you always land on notes that fit.' };
  if (u.blues) return [{ type:'Minor Pentatonic', lvl:'Beginner', desc:'Five notes that work over all the 7th chords of a blues.' }, { type:'Blues', lvl:'Intermediate', desc:'Minor pentatonic plus the blue note.' }, f];
  if (u.minor) return [{ type:'Minor Pentatonic', lvl:'Beginner', desc:'Five safe notes for a minor key.' }, { type:'Natural Minor', lvl:'Intermediate', desc:'All seven notes of the minor key.' }, f];
  return [{ type:'Major Pentatonic', lvl:'Beginner', desc:'Five safe notes for a major key.' }, { type:'Major', lvl:'Intermediate', desc:'All seven notes of the major key.' }, f];
}
function uploadTrack(u) {                     // u = the stored record
  const barLen = 60 / u.bpm * u.bpb;
  return Object.assign({}, u, { official:false, timeSig:u.bpb + (u.bpb === 6 ? '/8' : '/4'), barLen, keySuffix: u.blues ? ' Blues' : (u.minor ? ' minor' : ' major'), sections:[], loopDef:null,
    stems:u.files.map((f, i) => ({ k:'s' + i, name:f.stem, src:f.name })), scales:uploadScales(u), followName:'chord scales', rec:u });
}
const keyPc = () => mod(T.keyPc + S.tr, 12);
function chordAt(bar) {
  const c = T.chords[Math.max(0, Math.min(T.chords.length - 1, bar))];
  if (!c || c.nc) return { nc:true, label:'—', pc:keyPc(), iv:[], q:null };
  const pc = mod(c.pc + S.tr, 12); return { pc, label:NOTE[pc] + QSUF[c.q], iv:QUAL[c.q] || QUAL.maj, q:c.q };
}
function scaleNow(bar) {
  if (S.follow) { const c = chordAt(bar); if (!c.nc) { const n = FOLLOW[c.q] || 'Major Pentatonic'; return { root:c.pc, iv:SCALES[n], name:NOTE[c.pc] + ' ' + n, type:n }; } }
  const root = S.scRoot == null ? keyPc() : mod(S.scRoot + S.tr, 12); return { root, iv:SCALES[S.scType], name:NOTE[root] + ' ' + S.scType, type:S.scType };
}
function boxRange(root) { let r = mod(root - 4, 12); if (r === 0) r = 12; return [r, Math.min(NFRET, r + 3)]; }
const beatLen = () => T.barLen / T.bpb;
const barAt = (pos) => Math.max(0, Math.min(T.bars - 1, Math.floor((pos - T.off) / T.barLen + 1e-6)));
const barStart = (b) => Math.min(T.dur, T.off + b * T.barLen);
const loopStart = () => (S.loop.a === 0 ? Math.min(T.off, barStart(0)) : barStart(S.loop.a));
const loopEnd = () => (S.loop.b >= T.bars ? T.dur : barStart(S.loop.b));

/* ================= storage for uploads (IndexedDB keeps the audio files on this device) ================= */
const DB = { db:null,
  open() { return new Promise((res) => { try { const rq = indexedDB.open('ljjam', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('tracks', { keyPath:'id' });
    rq.onsuccess = () => { DB.db = rq.result; res(true); }; rq.onerror = () => res(false); } catch (e) { res(false); } }); },
  tx(mode, fn) { return new Promise((res) => { if (!DB.db) return res(null); try { const t = DB.db.transaction('tracks', mode), rq = fn(t.objectStore('tracks')); t.oncomplete = () => res(rq && rq.result); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } }); },
  all() { return DB.tx('readonly', s => s.getAll()); }, put(r) { return DB.tx('readwrite', s => s.put(r)); }, del(id) { return DB.tx('readwrite', s => s.delete(id)); } };
const saveUpload = (u) => DB.put(u);

/* ================= audio engine: positions are seconds of the original recording ================= */
const AU = { ctx:null, master:null, ch:{}, cache:{}, buf:{}, proc:{}, alpha:{}, rate:{}, procKey:'', mix:null, mixId:'', playing:false, pausedPos:0, segs:[], voices:[], timer:null, countStart:0, countUntil:0, countBeat:1, busy:false };
function initCtx() {
  if (AU.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; AU.ctx = new AC();
  AU.master = AU.ctx.createGain(); AU.master.gain.value = 0.9; AU.master.connect(AU.ctx.destination);
}
function wireStems() { Object.values(AU.ch).forEach(g => { try { g.disconnect(); } catch (e) {} }); AU.ch = {}; T.stems.forEach(s => { const g = AU.ctx.createGain(); g.connect(AU.master); AU.ch[s.k] = g; }); applyMix(true); }
function decodeUri(uri) { const bin = atob(uri.slice(uri.indexOf(',') + 1)), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Promise((res, rej) => AU.ctx.decodeAudioData(u8.buffer, res, rej)); }
const decodeBlob = (b) => b.arrayBuffer().then(ab => new Promise((res, rej) => AU.ctx.decodeAudioData(ab, res, rej)));
function busy(title, pct, sub) { $('loadTitle').textContent = title; $('loadBar').style.width = Math.round((pct || 0) * 100) + '%'; $('loadTxt').textContent = sub || ''; $('loadOvl').classList.add('show'); }
const idle = () => $('loadOvl').classList.remove('show');
async function ensureAudio() {
  initCtx(); const id = T.id;
  if (!AU.cache[id]) { const bufs = {}; let n = 0; busy(T.official ? 'Loading ' + T.title : 'Opening your track', 0);
    for (const s of T.stems) { bufs[s.k] = T.official ? await decodeUri(MEDIA[id][s.k]) : await decodeBlob(T.rec.files[+s.k.slice(1)].blob); n++; if (T.id === id) busy(T.official ? 'Loading ' + T.title : 'Opening your track', n / T.stems.length); }
    AU.cache[id] = bufs; idle(); }
  if (T.id !== id) return false;
  if (AU.bufId !== id) { AU.buf = AU.cache[id]; AU.bufId = id; AU.proc = {}; AU.procKey = ''; wireStems(); }
  return true;
}
const isDrums = (s) => /drum|perc|beat/i.test(s.name) || s.k === 'drums';
async function prepare() {                    // slower speed = stretch; other key = stretch + resample; drums keep their pitch
  if (!(await ensureAudio())) return false;
  const id = T.id, r = S.speed / 100, q = Math.pow(2, S.tr / 12), key = id + '|' + S.speed + '|' + S.tr; if (AU.procKey === key) return true;
  AU.proc = {}; const plans = {}, lbl = (S.speed < 100 ? 'Speed ' + S.speed + '%' : '') + (S.speed < 100 && S.tr ? ' · ' : '') + (S.tr ? 'Key ' + (S.tr > 0 ? '+' : '') + S.tr : '');
  for (let i = 0; i < T.stems.length; i++) { const s = T.stems[i], qk = S.tr && !isDrums(s) ? q : 1, al = qk / r; AU.alpha[s.k] = al; AU.rate[s.k] = qk;
    if (Math.abs(al - 1) < 1e-6) continue;
    if (AU.mixId !== id) { AU.mix = DSP.monoMix(T.stems.map(x => AU.buf[x.k]), 11025); AU.mixId = id; }
    const pk = al.toFixed(5); if (!plans[pk]) { busy('Preparing ' + lbl, 0, 'Keeps the pitch while the speed changes'); plans[pk] = await DSP.stretchPlan(AU.mix, al, (p) => { if (T.id === id) busy('Preparing ' + lbl, p * 0.9, 'Keeps the pitch while the speed changes'); }); if (T.id !== id) return false; }
    AU.proc[s.k] = DSP.stretchApply(AU.ctx, AU.buf[s.k], plans[pk]); }
  idle(); AU.procKey = key; return true;
}
function applyMix(now) {
  if (!AU.ctx || !T) return; const any = T.stems.some(s => S.ch[s.k].solo);
  T.stems.forEach(s => { const c = S.ch[s.k], g = (c.mute || (any && !c.solo)) ? 0 : c.vol / 100; if (!AU.ch[s.k]) return; if (now) AU.ch[s.k].gain.value = g; else AU.ch[s.k].gain.setTargetAtTime(g, AU.ctx.currentTime, 0.015); });
}
function click(t, accent) {
  const o = AU.ctx.createOscillator(), g = AU.ctx.createGain(); o.frequency.value = accent ? 1400 : 900; g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + 0.08); AU.voices.push({ src:o, g, end:t + 0.1 });
}
function newSeg(a0, t0) {
  const r = S.speed / 100, end = S.loop ? loopEnd() : T.dur, seg = { a0, t0, end, tEnd: t0 + (end - a0) / r, sched: a0 };
  AU.segs.push(seg); if (AU.segs.length > 4) AU.segs.shift();
  T.stems.forEach(s => { const b = AU.proc[s.k] || AU.buf[s.k]; if (!b) return; const al = AU.proc[s.k] ? AU.alpha[s.k] : 1, rate = AU.rate[s.k] || 1, off = a0 * al; if (off >= b.duration - 0.02) return;
    const src = AU.ctx.createBufferSource(), g = AU.ctx.createGain(); src.buffer = b; src.playbackRate.value = rate;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + 0.006); g.gain.setValueAtTime(1, Math.max(t0 + 0.006, seg.tEnd - 0.01)); g.gain.linearRampToValueAtTime(0, seg.tEnd);
    src.connect(g); g.connect(AU.ch[s.k]); src.start(t0, off); src.stop(seg.tEnd + 0.02); AU.voices.push({ src, g, end: seg.tEnd + 0.05 }); });
  return seg;
}
function sched() {
  if (!AU.playing) return; const now = AU.ctx.currentTime, r = S.speed / 100, hor = now + 0.2; AU.voices = AU.voices.filter(v => v.end > now);
  let seg = AU.segs[AU.segs.length - 1];
  for (let guard = 0; guard < 3; guard++) {
    const hp = Math.min(seg.end, seg.a0 + (hor - seg.t0) * r);
    if (hp > seg.sched) { if (S.metro) { const bl = beatLen(); for (let n = Math.ceil((seg.sched - T.off) / bl - 1e-6); T.off + n * bl < hp - 1e-6; n++) click(seg.t0 + (T.off + n * bl - seg.a0) / r, mod(n, T.bpb) === 0); } seg.sched = hp; }
    if (hp >= seg.end) { if (S.loop) { seg = newSeg(loopStart(), seg.tEnd); continue; } if (now >= seg.tEnd) stop(true); }
    break;
  }
}
function curSeg() { const now = AU.ctx.currentTime; let seg = AU.segs[0]; for (const s of AU.segs) if (s.t0 <= now) seg = s; return seg; }
function getPos() {
  if (!AU.playing || !AU.segs.length) return AU.pausedPos; const now = AU.ctx.currentTime, seg = curSeg();
  if (now < seg.t0) return seg.a0; return Math.min(seg.end - 0.001, seg.a0 + (now - seg.t0) * S.speed / 100);
}
function killVoices() { const now = AU.ctx.currentTime; AU.voices.forEach(v => { try { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.008); v.src.stop(now + 0.05); } catch (e) {} }); AU.voices = []; }
async function play(opts) {
  opts = opts || {}; if (AU.playing || AU.busy) return; AU.busy = true; const id = T.id; let ok = false;
  try { ok = await prepare(); } catch (e) { idle(); toast('Could not prepare the audio: ' + (e && e.message || e)); }
  AU.busy = false; if (!ok || T.id !== id || S.screen !== 'player') return;
  AU.ctx.resume(); let start = opts.from != null ? opts.from : AU.pausedPos;
  if (S.loop && (start < loopStart() - 1e-3 || start >= loopEnd() - 1e-3)) start = loopStart(); if (start >= T.dur - 0.05) start = 0;
  const now = AU.ctx.currentTime + 0.08; let t0 = now; AU.countUntil = 0;
  if (S.countIn && !opts.noCount) { const bs = beatLen() / (S.speed / 100); for (let i = 0; i < T.bpb; i++) click(now + i * bs, i === 0); t0 = now + T.bpb * bs; AU.countStart = now; AU.countUntil = t0; AU.countBeat = bs; }
  AU.playing = true; AU.segs = []; AU.pausedPos = start; newSeg(start, t0); clearInterval(AU.timer); AU.timer = setInterval(sched, 25); sched(); updTransport(); frame(true);
}
function stop(finished) {
  if (!AU.ctx) return; const p = AU.playing ? getPos() : AU.pausedPos; clearInterval(AU.timer); AU.playing = false; AU.countUntil = 0;
  AU.pausedPos = finished ? (S.loop ? loopStart() : 0) : p; killVoices(); $('countOvl').classList.remove('show'); updTransport(); frame(true);
}
function restart(pos) {                       // apply a seek / loop / speed / key change without a count-in
  if (!AU.playing) { if (pos != null) AU.pausedPos = pos; frame(true); return; }
  const p = pos != null ? pos : getPos(); clearInterval(AU.timer); AU.playing = false; killVoices(); play({ from:p, noCount:true });
}

/* ================= chrome ================= */
function renderChrome() {
  const t = (id, label, extra) => `<button class="tab ${S.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}"><span>${label}${extra || ''}</span><i></i></button>`;
  $('tabs').innerHTML = t('scale', 'Scale') + t('chromatic', 'Chromatic') + t('jam', 'Jam with Track', '<em class="new">NEW</em>');
  $('nav').innerHTML = [['Chord','icon_chord'],['Scale','icon_scale'],['Perform','icon_perform'],['Tuner','icon_tuner'],['Setting','icon_setting']].map(([l, i]) => `<div class="${l === 'Scale' ? 'on' : ''}">${icon(i, 22)}${l}</div>`).join('');
}
function renderView() {
  renderChrome();
  if (S.tab !== 'jam') { FB.show = false; ledSync(); $('view').innerHTML = `<div class="pad"><div class="sub" style="padding:48px 12px">${S.tab === 'scale' ? 'Scale' : 'Chromatic'} — unchanged, not part of this prototype. Open <b style="color:var(--green)">Jam with Track</b>.</div></div>`; return; }
  if (S.screen === 'library') { FB.show = false; ledSync(); return renderLibrary(); }
  renderPlayer();
}

/* ================= fretboard ================= */
function fbHTML(dots, hiFrets) {
  let h = '<div class="fbwrap"><div class="strl">' + ['E','B','G','D','A','E'].map(l => `<div>${l}</div>`).join('') + '</div><div class="fbscroll"><div class="fb">';
  for (let f = 1; f <= NFRET + 1; f++) h += `<div class="fl ${f === 1 ? 'nut' : ''}" style="left:${f * FW}px"></div>`;
  [3, 5, 7, 9, 15].forEach(f => { h += `<div class="in" style="left:${f * FW + FW / 2 - 5}px;top:${8 + 3 * SH - 5}px"></div>`; });
  [2, 4].forEach(k => { h += `<div class="in" style="left:${12 * FW + FW / 2 - 5}px;top:${8 + k * SH - 5}px"></div>`; });
  [1, 1, 1.5, 2, 2.5, 3].forEach((w, i) => { h += `<div class="st" style="top:${8 + i * SH + SH / 2 - w / 2}px;height:${w}px"></div>`; });
  dots.forEach(d => { h += `<div class="dot ${d.cls || ''}" style="left:${d.f * FW + FW / 2 - 11}px;top:${8 + d.s * SH + SH / 2 - 11}px">${d.label}</div>`; });
  h += '</div><div class="frl">';
  for (let f = 0; f <= NFRET; f++) h += `<div><span class="${hiFrets && f >= hiFrets[0] && f <= hiFrets[1] ? 'on' : ''}">${f}</span></div>`;
  return h + '</div></div></div>';
}
function scaleDots(root, iv, opt) {
  opt = opt || {}; const out = [];
  for (let s = 0; s < 6; s++) for (let f = 0; f <= NFRET; f++) {
    if (opt.range && (f < opt.range[0] || f > opt.range[1])) continue;
    const pc = (OPEN[s] + f) % 12, d = mod(pc - root, 12); if (!iv.includes(d)) continue;
    let cls = d === 0 ? 'r' : (opt.blueIv != null && d === opt.blueIv ? 'bn' : ''); if (opt.targetPcs && opt.targetPcs.includes(pc)) cls += ' tg';
    out.push({ s, f, label: S.labels === 'degrees' ? DEG[d] : NOTE[pc], cls });
  }
  return out;
}
function chordDots(c) {
  const out = [], cl = { 0:'r', 3:'i3', 4:'i3', 7:'i5', 10:'i7', 11:'i7' };
  for (let s = 0; s < 6; s++) for (let f = 0; f <= NFRET; f++) { const pc = (OPEN[s] + f) % 12, d = mod(pc - c.pc, 12); if (c.iv.includes(d)) out.push({ s, f, label: S.labels === 'degrees' ? DEG[d] : NOTE[pc], cls: cl[d] || '' }); }
  return out;
}

/*__BLE__*/

/*__COVER__*/

/* ================= library ================= */
const metaOf = (u) => `${NOTE[u.keyPc]}${u.blues ? ' Blues' : (u.minor ? ' minor' : ' major')} · ${Math.round(u.bpm)} BPM · ${u.bars} bars · ${u.files.length > 1 ? u.files.length + ' stems' : 'full mix'}`;
const isReady = (t) => !!(DATA.packs[t.id] && MEDIA[t.id]);
function renderLibrary() {
  const f = S.lf, styles = [...new Set(DATA.tracks.map(t => REAL_CAT[t.id]).filter(Boolean))];
  const list = DATA.tracks.filter(t => (f.style === 'All' || REAL_CAT[t.id] === f.style) && (f.level === 'All levels' || t.level === f.level) && (!f.ready || isReady(t)));
  const keep = $('view').scrollTop;
  $('view').innerHTML = `<div class="pad">
    <div><div class="h1">Jam with Track</div><div class="sub" style="margin-top:4px">Play along with a backing track. See the chords, the scale to use and where to play it — on screen and on your guitar's LEDs.</div></div>
    <button class="drop" id="drop" data-act="pick">${icon('file_plus_icon', 34)}<b>Upload your own track</b><span>MP3, WAV or M4A · up to 10 min<br>One file, or several stem files together (drums, bass, keys…)</span><em>Choose files</em></button>
    <div class="lbl">Your tracks <small>${UPL.length ? 'kept on this device' : ''}</small></div>
    ${UPL.length ? UPL.map(u => `<div class="jrow"><button class="go" data-act="openUpload" data-v="${u.id}">${icon('play_icon', 18)}<div class="ri"><div class="tt">${esc(u.title)}</div><div class="mm">${metaOf(u)}</div></div><span class="du">${fmt(u.dur)}</span></button><button class="x" data-act="delUpload" data-v="${u.id}" aria-label="Delete ${esc(u.title)}">✕</button></div>`).join('')
      : '<div class="empty">Nothing uploaded yet. Your tracks stay on this device — they are not sent anywhere.</div>'}
    <div class="lbl" id="f-official">Official backing tracks <small>by Litejam · studio stems</small></div>
    <div class="frow">${['All'].concat(styles).map(s => `<button class="chip ${f.style === s ? 'on' : ''}" data-act="libStyle" data-v="${s}">${s}</button>`).join('')}</div>
    <div class="frow">${['All levels', 'Beginner', 'Intermediate'].map(l => `<button class="chip ${f.level === l ? 'on' : ''}" data-act="libLevel" data-v="${l}">${l}</button>`).join('')}<button class="chip ${f.ready ? 'on' : ''}" data-act="libReady">▶ Ready to play</button><span class="cnt">${list.length} track${list.length === 1 ? '' : 's'}</span></div>
    ${list.length ? `<div class="tgrid">${list.map(t => { const ready = isReady(t), cat = REAL_CAT[t.id] || 'Upload', k = t.key.replace(' major', '').replace(' minor', 'm');
      return `<button class="tcard ${ready ? '' : 'soon'}" data-act="openOfficial" data-v="${t.id}"><div class="art" style="background:${SCENE_BG[cat] || SCENE_BG.Upload}"><svg viewBox="0 0 300 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${scene(cat, hash(t.id))}</svg><span class="key">${esc(k.replace(/ (Dorian|Phrygian|Mixolydian)/, ''))}</span>${ready ? '<i class="go">▶</i>' : '<em>Coming soon</em>'}</div>
        <div class="tt">${esc(t.style + ' in ' + k)}</div><div class="mm">${t.bpm} BPM · ${esc(t.prog)}</div><div class="tags"><span class="pill ${t.level === 'Beginner' ? 'g' : 'b'}">${t.level}</span><span class="pill x">${cat}</span></div></button>`; }).join('')}</div>`
      : '<div class="empty">No track matches these filters. <button class="chip" data-act="libClear" style="margin-left:6px">Show all</button></div>'}
  </div>`;
  if (S.lfKeep) { $('view').scrollTop = keep; S.lfKeep = false; }
}

/* ---- upload: decode → tempo and bar lines → chords → key ---- */
function stemNames(files) {
  if (files.length === 1) return ['Full mix'];
  const used = {}; return files.map(f => { const s = f.name.toLowerCase(), m = [[/drum|perc|beat/, 'Drums'], [/bass/, 'Bass'], [/vocal|vox|voice/, 'Vocals'], [/guitar|gtr/, 'Guitar'], [/key|piano|organ|synth|pad/, 'Keys'], [/other|inst/, 'Other']].find(x => x[0].test(s));
    let n = m ? m[1] : f.name.replace(/\.[^.]+$/, '').slice(0, 14); used[n] = (used[n] || 0) + 1; return used[n] > 1 ? n + ' ' + used[n] : n; });
}
const AN_STAGES = ['Reading the audio', 'Finding the tempo', 'Finding the bar lines and chords', 'Finding the key'];
function anDraw(cur, name) { $('anName').textContent = name; $('anList').innerHTML = AN_STAGES.map((s, i) => `<div class="${i < cur ? 'done' : (i === cur ? 'act' : '')}"><i>${i < cur ? '✓' : i + 1}</i>${s}</div>`).join(''); $('anBar').style.width = Math.round(cur / AN_STAGES.length * 100) + '%'; $('anOvl').classList.add('show'); }
async function addFiles(list) {
  const files = [...list].filter(f => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac|aif|aiff)$/i.test(f.name));
  if (!files.length) return toast('Please choose audio files (MP3, WAV or M4A).');
  if (files.length > MAXSTEMS) return toast('Up to ' + MAXSTEMS + ' stem files at a time.');
  if (AU.playing) stop(); initCtx(); const title = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : files[0].name.replace(/\.[^.]+$/, '').replace(/[ _-]*(drums?|bass|vocals?|guitar|keys?|piano|other)$/i, '') || 'My track';
  try { anDraw(0, title); const bufs = []; for (const f of files) bufs.push(await decodeBlob(f));
    const dur = Math.max(...bufs.map(b => b.duration)); if (dur > MAXDUR) { $('anOvl').classList.remove('show'); return toast('This track is ' + fmt(dur) + ' long. The limit is 10 minutes.'); }
    if (dur < 8) { $('anOvl').classList.remove('show'); return toast('This file is too short to analyse.'); }
    const an = await DSP.analyze(bufs, { onStage:(i) => anDraw(i, title) }), names = stemNames(files), id = 'U' + Date.now();
    const u = { id, title:title.slice(0, 40), added:Date.now(), bpm:an.bpm, off:an.off, bpb:an.bpb, bars:an.bars, chords:an.chords, keyPc:an.keyPc, minor:an.minor, blues:an.blues, dur:an.dur, files:files.map((f, i) => ({ name:f.name, stem:names[i], blob:f })) };
    UPL.unshift(u); AU.cache[id] = {}; bufs.forEach((b, i) => { AU.cache[id]['s' + i] = b; }); AU.mix = an.mix; AU.mixId = id; saveUpload(u);
    $('anOvl').classList.remove('show'); openTrack(uploadTrack(u));
    toast(`Found ${NOTE[u.keyPc]}${u.blues ? ' Blues' : (u.minor ? ' minor' : ' major')} · ${Math.round(u.bpm)} BPM · ${u.bars} bars. Tap ✎ Fix if the chords or the beat look wrong.`);
  } catch (e) { $('anOvl').classList.remove('show'); toast('Could not read this audio (' + (e && e.message || e) + '). Try MP3, WAV or M4A.'); }
}

/* ================= player ================= */
function openTrack(t) {
  if (AU.ctx && AU.playing) stop(); T = t; S.ch = {}; T.stems.forEach(s => { S.ch[s.k] = { vol:85, mute:false, solo:false }; });
  const first = T.scales[0]; Object.assign(S, { tab:'jam', screen:'player', fb:'scale', scType: first.type === 'follow' ? 'Minor Pentatonic' : first.type, scRoot:null, follow:first.type === 'follow', pos:'full', loop:null, loopKind:null, abA:null, speed:100, tr:0, edit:false, sheet:null });
  AU.pausedPos = 0; AU.segs = []; Object.assign(LAST, { bar:-1, beat:-1 }); renderView(); renderNotes(); ensureAudio().catch((e) => { idle(); toast('This browser could not decode the audio. Open in Chrome or Safari.'); });
}
function renderPlayer() {
  $('view').innerHTML = `<div class="pad" id="player">
    <div class="hd"><button class="back" data-act="back">‹</button>
      <div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(T.title)}</div><div style="font-size:11px;color:rgba(255,255,255,.5)">${T.official ? T.id + ' · Litejam Track' : 'Your upload · analysed on this device'} · ${T.timeSig} · ${T.bars} bars · ${T.stems.length > 1 ? T.stems.length + ' stems' : 'full mix'}</div></div>
      <div style="display:flex;gap:6px" id="kchips"></div></div>
    <div class="now" id="nowbar"></div>
    <div class="fbbar" id="fbbar"></div>
    <div id="fbBox"></div>
    <div id="legend" class="legend"></div>
    <div id="f-timeline"><div class="lbl">Chord timeline${T.official ? '' : '<button class="chip mini" data-act="chordEdit" id="ceBtn">✎ Edit chords</button><button class="chip mini" data-act="fixOpen">✎ Fix beat / key</button>'} <small id="timeLbl"></small></div><div class="tl" id="tl" style="margin-top:6px"></div></div>
    <div class="card" id="f-transport"></div>
    <div id="f-mixer" style="display:flex;flex-direction:column;gap:8px"></div>
  </div>`;
  updHeader(); updFretboard(true); updTimeline(); updTransport(); updMixer(); frame(true);
}
function updHeader() { if (!$('kchips')) return; $('kchips').innerHTML = `<div class="kchip" style="color:var(--green)">${NOTE[keyPc()]}${T.keySuffix}</div><div class="kchip" style="color:var(--blue)">${Math.round(T.bpm * S.speed / 100)} BPM</div>`; }
function updNow(bar) {
  const el = $('nowbar'); if (!el) return; let nb = bar + 1; if (S.loop && nb >= S.loop.b) nb = S.loop.a;
  el.innerHTML = `<div><div class="k">NOW</div><div class="c1">${chordAt(bar).label}</div><div class="beats" id="beats">${'<i></i>'.repeat(T.bpb)}</div></div>
    <div><div class="k" style="color:rgba(255,255,255,.35)">NEXT</div><div class="c2">${nb < T.bars ? chordAt(nb).label : '—'}</div><div style="height:14px"></div></div>`;
  LAST.beat = -1;
}
function updFretboard(scroll) {
  if (!$('fbBox')) return; const bar = barAt(getPos()), sc = scaleNow(bar), c = chordAt(bar), box = boxRange(sc.root);
  const seg = (v, l) => `<button class="${S.fb === v ? 'on' : ''}" data-act="fb" data-v="${v}">${l}</button>`;
  $('fbbar').innerHTML = `<div class="seg">${seg('scale', 'Scale')}${seg('chord', 'Chord')}</div><button class="scalechip" data-act="openScale"><span style="color:var(--blue)">♪</span><b>${S.follow ? 'Follow the chord · ' : ''}${sc.name}</b><em>Edit ›</em></button>`;
  let dots, hi = null, legend;
  if (S.fb === 'chord') { dots = c.nc ? [] : chordDots(c); legend = [['#FF2020','Root'],['#ADFE00','3rd'],['#FFCC00','5th'],['#50BCFF','7th']]; }
  else { const range = S.pos === 'box' ? box : null; if (range) hi = range; const tp = S.targets && !c.nc ? c.iv.map(i => (c.pc + i) % 12) : null;
    dots = scaleDots(sc.root, sc.iv, { range, targetPcs:tp, blueIv: sc.type === 'Blues' ? 6 : null });
    legend = [['#FF2020','Root note'],['#50BCFF','Scale note']]; if (sc.type === 'Blues') legend.push(['#FFCC00','Blue note']); if (tp) legend.push(['ring', 'Target: notes of ' + c.label]); }
  const prev = document.querySelector('#fbBox .fbscroll'), sl = prev ? prev.scrollLeft : 0;
  FB.dots = dots; FB.show = true; $('fbBox').innerHTML = fbHTML(dots, hi);
  const el = document.querySelector('#fbBox .fbscroll'); el.scrollLeft = scroll ? (hi ? Math.max(0, hi[0] * FW - 40) : (S.fb === 'scale' ? Math.max(0, box[0] * FW - 60) : 0)) : sl;
  $('legend').innerHTML = legend.map(([col, t]) => `<span><i style="${col === 'ring' ? 'background:#50BCFF;box-shadow:0 0 0 2px #fff' : 'background:' + col}"></i>${t}</span>`).join('');
  ledSync();
}
function updTimeline() {
  const el = $('tl'); if (!el) return; let h = `<div class="tlin" style="width:${T.bars * BARP + 4}px"><div class="bars">`;
  for (let b = 0; b < T.bars; b++) { const sec = T.sections.find(s => s.from === b + 1), inLoop = S.loop && b >= S.loop.a && b < S.loop.b;
    let mark = ''; if (S.loop && b === S.loop.a) mark = 'A'; if (S.loop && b + 1 === S.loop.b) mark = mark ? 'A=B' : 'B';
    h += `<button class="bar ${inLoop ? 'lp' : ''} ${S.edit ? 'ed' : ''}" data-act="${S.edit ? 'chordPick' : 'seek'}" data-v="${b}" data-b="${b}"><div class="s">${sec ? sec.name : ''}<em>${mark}</em></div><div class="c">${chordAt(b).label}<small>${b + 1}</small></div></button>`; }
  el.innerHTML = h + '</div><div class="tlph" id="tlPh" style="top:15px"></div></div>'; LAST.bar = -1;
}
function loopLabel() { if (!S.loop) return 'Loop off'; if (S.loopKind === 'def') return T.loopDef.name; if (S.loopKind === 'all') return 'Whole track'; const a = S.loop.a + 1, b = S.loop.b; return a === b ? 'Bar ' + a : 'Bars ' + a + '–' + b; }
function updTransport() {
  const el = $('f-transport'); if (!el) return;
  el.innerHTML = `<div class="trow">
      <div class="tbox"><button class="step" data-act="speed" data-v="-10" aria-label="Slower">−</button><span style="min-width:56px;text-align:center;color:${S.speed === 100 ? '#fff' : 'var(--green)'}">${S.speed}%</span><button class="step" data-act="speed" data-v="10" aria-label="Faster">+</button></div>
      <button class="playb" data-act="play" aria-label="${AU.playing ? 'Pause' : 'Play'}">${icon(AU.playing ? 'pause_icon' : 'play_icon', 22)}</button>
      <button class="tbox ${S.loop ? 'act' : ''}" data-act="openLoop">${icon('loop_icon', 15)}${loopLabel()}</button></div>
    <div class="opt"><div style="display:flex;gap:8px"><button class="tog ${S.metro ? 'on' : ''}" data-act="metro">${icon('metronome_icon', 14)}Metronome</button><button class="tog ${S.countIn ? 'on' : ''}" data-act="countIn">Count-in</button></div>
      <div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:rgba(255,255,255,.6)">Transpose</span>
        <button class="step" data-act="tr" data-v="-1" aria-label="Key down">−</button><span style="min-width:44px;text-align:center;font-size:13px;font-weight:700;color:${S.tr ? 'var(--green)' : '#fff'}">${S.tr ? (S.tr > 0 ? '+' : '') + S.tr + ' · ' + NOTE[keyPc()] : NOTE[keyPc()]}</span><button class="step" data-act="tr" data-v="1" aria-label="Key up">+</button></div></div>
    <div class="hint2">Speed keeps the pitch · Transpose keeps the speed${S.speed < 100 || S.tr ? ' · processed on this device when you press play' : ''}</div>`;
}
function updMixer() {
  const el = $('f-mixer'); if (!el) return; const any = T.stems.some(s => S.ch[s.k].solo);
  el.innerHTML = `<div class="lbl">${icon('speaker_icon', 15)} Stems <small>${T.official ? 'studio stems from the producer' : (T.stems.length > 1 ? 'your stem files' : 'one file — no separate stems')}</small></div>` + T.stems.map(s => { const c = S.ch[s.k];
    return `<div class="mx ${(c.mute || (any && !c.solo)) ? 'off' : ''}"><div class="n">${esc(s.name)}<small>${esc(s.src)}</small></div>
      <button class="b m ${c.mute ? 'on' : ''}" data-act="mute" data-v="${s.k}" aria-label="Mute ${esc(s.name)}">M</button><button class="b s ${c.solo ? 'on' : ''}" data-act="solo" data-v="${s.k}" aria-label="Solo ${esc(s.name)}">S</button>
      <input type="range" min="0" max="100" value="${c.vol}" data-vol="${s.k}" aria-label="${esc(s.name)} volume"><div class="v" id="v-${s.k}">${c.mute ? '—' : c.vol + '%'}</div></div>`; }).join('') +
    (!T.official && T.stems.length === 1 ? '<div class="note">This track is one audio file, so it plays as a full mix. Splitting a finished song into drums, bass and other parts needs the Litejam server and is not in this web prototype. If you already have the stems, upload them together and each one gets its own fader.</div>' : '');
}

/* ================= sheets ================= */
function openSheet(kind, ctx) { S.sheet = kind; if (ctx !== undefined) S.ctx = ctx; renderSheet(); $('sheetbg').classList.add('show'); }
function closeSheet() { S.sheet = null; S.abA = null; $('sheetbg').classList.remove('show'); }
function renderSheet() {
  const el = $('sheet'); let h = '';
  if (S.sheet === 'ble') { el.innerHTML = sheetBle(); return; }
  if (S.sheet === 'scale') { const bar = barAt(getPos()), sc = scaleNow(bar), box = boxRange(sc.root), kp = S.scRoot == null ? T.keyPc : S.scRoot;
    h = `<h3>Scale on fretboard <button data-act="closeSheet">✕</button></h3><p>${T.official ? 'Suggested for this track by the producer.' : 'Suggested from the key found in your track.'} The same notes light up on the guitar LEDs.</p>` +
      T.scales.map(s => { const on = s.type === 'follow' ? S.follow : (!S.follow && S.scRoot == null && S.scType === s.type), nm = s.type === 'follow' ? 'Follow the chord (' + T.followName + ')' : NOTE[keyPc()] + ' ' + s.type;
        return `<button class="ropt ${on ? 'on' : ''}" data-act="scale" data-v="${s.type}"><div><div class="rt">♪ ${nm}</div><div class="rd">${esc(s.desc)}</div></div><span class="rr pill ${s.lvl === 'Beginner' ? 'g' : 'b'}">${s.lvl}</span></button>`; }).join('') +
      `<div class="flbl">Any other scale</div><div class="bgrid" style="grid-template-columns:repeat(6,1fr)">${NOTE.map((n, i) => `<button class="${!S.follow && i === kp ? 'a' : ''}" data-act="scRoot" data-v="${i}">${NOTE[mod(i + S.tr, 12)]}</button>`).join('')}</div>
       <div class="chips">${Object.keys(SCALES).map(t => `<button class="chip ${!S.follow && S.scType === t ? 'on' : ''}" data-act="scType" data-v="${t}">${t}</button>`).join('')}</div>
       <div class="opt"><span style="font-size:13px">Position</span><div class="seg"><button class="${S.pos === 'full' ? 'on' : ''}" data-act="pos" data-v="full">Full neck</button><button class="${S.pos === 'box' ? 'on' : ''}" data-act="pos" data-v="box">Box 1 · frets ${box[0]}–${box[1]}</button></div></div>
       <div class="opt"><span style="font-size:13px">Labels</span><div class="seg"><button class="${S.labels === 'notes' ? 'on' : ''}" data-act="labels" data-v="notes">Notes</button><button class="${S.labels === 'degrees' ? 'on' : ''}" data-act="labels" data-v="degrees">Degrees</button></div></div>
       <div class="opt"><span style="font-size:13px">Target notes <span style="color:rgba(255,255,255,.5);font-size:11px">— ring the notes of the current chord</span></span><button class="tog ${S.targets ? 'on' : ''}" data-act="targets">${S.targets ? 'On' : 'Off'}</button></div>`; }
  else if (S.sheet === 'loop') { const cur = barAt(getPos()), ro = (on, v, t, d) => `<button class="ropt ${on ? 'on' : ''}" data-act="loopSet" data-v="${v}"><div><div class="rt" style="color:#fff">${t}</div><div class="rd">${d}</div></div></button>`;
    h = `<h3>Loop <button data-act="closeSheet">✕</button></h3>` + ro(!S.loop, 'off', 'Off — play the track once', T.bars + ' bars · ' + fmt(T.dur)) +
      (T.loopDef ? ro(S.loopKind === 'def', 'def', T.loopDef.name + ' · bars ' + (T.loopDef.a + 1) + '–' + T.loopDef.b, 'The loop the producer marked for this track') : ro(S.loopKind === 'all', 'all', 'Whole track', 'Start again when it ends')) +
      ro(false, 'cur4', 'From here · 4 bars', 'Bars ' + (cur + 1) + '–' + Math.min(T.bars, cur + 4) + ' — good for one chord change at a time') +
      `<div style="font-size:13px;margin-top:4px">Custom A–B <span style="color:rgba(255,255,255,.5);font-size:11px">— ${S.abA == null ? 'tap the first bar' : 'now tap the last bar'}</span></div><div class="bgrid">` +
      Array.from({ length:T.bars }, (_, b) => `<button class="${S.abA === b ? 'a' : (S.loopKind === 'ab' && S.loop && b >= S.loop.a && b < S.loop.b ? 'in' : '')}" data-act="ab" data-v="${b}">${b + 1}</button>`).join('') + '</div>'; }
  else if (S.sheet === 'chord') { const c = S.ctx, old = T.chords[c.bar], same = old && !old.nc ? T.chords.filter(x => !x.nc && x.pc === old.pc && x.q === old.q).length : 1;
    h = `<h3>Bar ${c.bar + 1} chord <button data-act="closeSheet">✕</button></h3><p>Detected from the audio. Pick the chord you hear.</p>
      <div class="bgrid" style="grid-template-columns:repeat(6,1fr)">${NOTE.map((n, i) => `<button class="${c.pc === i ? 'a' : ''}" data-act="chordSet" data-k="pc" data-v="${i}">${n}</button>`).join('')}</div>
      <div class="chips">${Object.keys(QNAME).map(q => `<button class="chip ${c.q === q ? 'on' : ''}" data-act="chordSet" data-k="q" data-v="${q}">${QNAME[q]}</button>`).join('')}</div>
      ${same > 1 ? `<button class="chk" data-act="chordAll"><i class="${c.all ? 'on' : ''}">${c.all ? '✓' : ''}</i><span>Change all ${same} bars that have ${NOTE[old.pc] + QSUF[old.q]}</span></button>` : ''}
      <button class="cta" data-act="chordSave">Save ${NOTE[c.pc] + QSUF[c.q]}</button>`; }
  else if (S.sheet === 'fix') { const u = T.rec;
    h = `<h3>Fix beat and key <button data-act="closeSheet">✕</button></h3><p>Read from the audio on this device. Turn the metronome on and press play: the click should sit on the beat, and the high click on beat 1 of each bar.</p>
      <div class="flbl">Tempo</div><div class="chips">${[['third', '÷3'], ['half', '÷2'], ['-1', '−1'], ['-0.1', '−0.1']].map(x => `<button class="chip" data-act="fixBpm" data-v="${x[0]}">${x[1]}</button>`).join('')}<span class="chip on">${(Math.round(u.bpm * 100) / 100)} BPM</span>${[['0.1', '+0.1'], ['1', '+1'], ['double', '×2'], ['triple', '×3']].map(x => `<button class="chip" data-act="fixBpm" data-v="${x[0]}">${x[1]}</button>`).join('')}</div>
      <div class="flbl">Beats in a bar</div><div class="seg" style="align-self:flex-start">${[2, 3, 4, 6].map(n => `<button class="${u.bpb === n ? 'on' : ''}" data-act="fixBpb" data-v="${n}">${n}</button>`).join('')}</div>
      <div class="flbl">Beat 1 of the first bar</div><div class="chips"><button class="chip" data-act="fixOff" data-v="-beat">◂ 1 beat</button><button class="chip" data-act="fixOff" data-v="-0.02">◂ 20 ms</button><span class="chip on">${u.off.toFixed(2)} s</span><button class="chip" data-act="fixOff" data-v="0.02">20 ms ▸</button><button class="chip" data-act="fixOff" data-v="beat">1 beat ▸</button></div>
      <button class="cta alt" data-act="fixChords">Read the chords again with this beat</button>
      <div class="flbl">Key</div><div class="bgrid" style="grid-template-columns:repeat(6,1fr)">${NOTE.map((n, i) => `<button class="${u.keyPc === i ? 'a' : ''}" data-act="fixKey" data-v="${i}">${n}</button>`).join('')}</div>
      <div class="seg" style="align-self:flex-start">${[['minor', 'Minor'], ['major', 'Major'], ['blues', 'Blues']].map(m => `<button class="${(u.blues ? 'blues' : (u.minor ? 'minor' : 'major')) === m[0] ? 'on' : ''}" data-act="fixMode" data-v="${m[0]}">${m[1]}</button>`).join('')}</div>
      <button class="cta alt" data-act="fixRedo">Analyse everything again</button>`; }
  el.innerHTML = h;
}
function regrid(keepChords) {                 // after a tempo / first-beat change on an upload
  const u = T.rec, was = AU.playing; if (was) stop(); u.bpm = Math.max(40, Math.min(240, u.bpm)); const bl = 60 / u.bpm * u.bpb; u.off = mod(u.off, bl);
  u.bars = Math.max(1, Math.floor((u.dur - u.off) / bl + 0.5)); while (u.chords.length < u.bars) u.chords.push(u.chords[u.chords.length - 1] || { nc:true }); u.chords.length = u.bars;
  Object.assign(T, { bpm:u.bpm, bpb:u.bpb, timeSig:u.bpb + (u.bpb === 6 ? '/8' : '/4'), off:u.off, bars:u.bars, chords:u.chords, barLen:bl }); S.loop = null; S.loopKind = null; AU.pausedPos = Math.min(AU.pausedPos, T.dur - 0.1);
  saveUpload(u); renderPlayer(); renderSheet(); if (!keepChords) toast('Beat grid changed. Tap “Read the chords again” to line the chords up.');
}
async function rereadChords(full) {
  const u = T.rec, id = T.id; if (AU.playing) stop(); if (!(await ensureAudio())) return; closeSheet();
  try { if (AU.mixId !== id) { AU.mix = DSP.monoMix(T.stems.map(s => AU.buf[s.k]), 11025); AU.mixId = id; }
    const an = await DSP.analyze(null, Object.assign({ mix:AU.mix, onStage:(i) => anDraw(i, u.title) }, full ? {} : { bpm:u.bpm, off:u.off, bpb:u.bpb }));
    $('anOvl').classList.remove('show'); if (T.id !== id) return;
    Object.assign(u, { bpm:an.bpm, bpb:an.bpb, off:an.off, bars:an.bars, chords:an.chords }); if (full) Object.assign(u, { keyPc:an.keyPc, minor:an.minor, blues:an.blues });
    saveUpload(u); const st = { speed:S.speed, tr:S.tr }; openTrack(uploadTrack(u)); toast(full ? 'Analysed again.' : 'Chords read again on the new beat.');
  } catch (e) { $('anOvl').classList.remove('show'); toast('Could not analyse: ' + (e && e.message || e)); }
}

/* ================= frame loop ================= */
const LAST = { bar:-1, beat:-1 };
function frame(force) {
  if (S.tab !== 'jam' || S.screen !== 'player' || !$('player') || !T) return;
  const pos = getPos(), bar = barAt(pos), beat = mod(Math.floor((pos - T.off) / beatLen() + 1e-6), T.bpb);
  if (bar !== LAST.bar || force) { LAST.bar = bar; updNow(bar);
    document.querySelectorAll('#tl .bar').forEach(b => b.classList.toggle('cur', +b.dataset.b === bar));
    if (S.fb === 'chord' || S.follow || (S.targets && S.fb === 'scale')) updFretboard(false);
    const tl = $('tl'); if (tl && AU.playing) tl.scrollLeft = Math.max(0, bar * BARP - 130); }
  if (beat !== LAST.beat) { LAST.beat = beat; const bs = $('beats'); if (bs) [...bs.children].forEach((d, i) => { d.className = (AU.playing && i === beat) ? ('on' + (i === 0 ? ' acc' : '')) : ''; }); }
  const ph = $('tlPh'); if (ph) ph.style.left = (2 + Math.max(0, (pos - T.off) / T.barLen) * BARP - 1) + 'px';
  const tlb = $('timeLbl'); if (tlb) tlb.textContent = fmt(pos) + ' / ' + fmt(T.dur) + ' · bar ' + (bar + 1);
  const co = $('countOvl'); if (AU.playing && AU.countUntil && AU.ctx.currentTime < AU.countUntil) { co.classList.add('show'); $('countLbl').textContent = 'Count-in · ' + T.timeSig; $('countNum').textContent = Math.min(T.bpb, Math.floor((AU.ctx.currentTime - AU.countStart) / AU.countBeat) + 1); } else co.classList.remove('show');
}
function loop() { frame(false); requestAnimationFrame(loop); }
requestAnimationFrame(loop); setInterval(() => frame(false), 120);

/* ================= actions ================= */
function setLoop(kind, a, b) { S.loopKind = kind; S.loop = kind ? { a, b } : null; updTimeline(); updTransport(); if (AU.playing) restart(kind ? loopStart() : getPos()); else if (kind) AU.pausedPos = loopStart(); frame(true); }
function retime() { const p = getPos(); updHeader(); updFretboard(false); updTimeline(); updTransport(); if (AU.playing) restart(p); }
const ACT = {
  tab: (d) => { if (d.v !== 'jam' && AU.playing) stop(); S.tab = d.v; renderView(); },
  pick: () => $('filePick').click(),
  libStyle: (d) => { S.lf.style = d.v; S.lfKeep = true; renderLibrary(); }, libLevel: (d) => { S.lf.level = d.v; S.lfKeep = true; renderLibrary(); },
  libReady: () => { S.lf.ready = !S.lf.ready; S.lfKeep = true; renderLibrary(); }, libClear: () => { S.lf = { style:'All', level:'All levels', ready:false }; S.lfKeep = true; renderLibrary(); },
  openOfficial: (d) => { if (!DATA.packs[d.v] || !MEDIA[d.v]) return toast(d.v + ' is in production. Slow Blues in A and Classic Rock in Em are ready.'); openTrack(officialTrack(d.v)); },
  openUpload: (d) => { const u = UPL.find(x => x.id === d.v); if (u) openTrack(uploadTrack(u)); },
  delUpload: (d) => { const u = UPL.find(x => x.id === d.v); if (!u) return; if (!window.confirm('Delete “' + u.title + '” from this device?')) return; UPL = UPL.filter(x => x.id !== d.v); DB.del(d.v); delete AU.cache[d.v]; renderLibrary(); },
  back: () => { stop(); S.screen = 'library'; renderView(); renderNotes(); },
  fb: (d) => { S.fb = d.v; updFretboard(true); },
  openScale: () => openSheet('scale'), openLoop: () => openSheet('loop'),
  closeSheet: (d, e, el) => { if (el.id === 'sheetbg' && e.target !== el) return; closeSheet(); },
  scale: (d) => { if (d.v === 'follow') S.follow = true; else { S.follow = false; S.scType = d.v; S.scRoot = null; } S.fb = 'scale'; renderSheet(); updFretboard(true); },
  scRoot: (d) => { S.follow = false; S.scRoot = +d.v === T.keyPc ? null : +d.v; S.fb = 'scale'; renderSheet(); updFretboard(true); },
  scType: (d) => { S.follow = false; S.scType = d.v; S.fb = 'scale'; renderSheet(); updFretboard(true); },
  pos: (d) => { S.pos = d.v; renderSheet(); updFretboard(true); }, labels: (d) => { S.labels = d.v; renderSheet(); updFretboard(false); },
  targets: () => { S.targets = !S.targets; renderSheet(); updFretboard(false); },
  seek: (d) => { const b = +d.v, t = b === 0 ? 0 : barStart(b); if (S.loop && (b < S.loop.a || b >= S.loop.b)) { S.loopKind = null; S.loop = null; updTimeline(); updTransport(); } AU.pausedPos = t; restart(t); },
  play: () => { if (AU.playing) stop(); else play(); },
  metro: () => { S.metro = !S.metro; updTransport(); }, countIn: () => { S.countIn = !S.countIn; updTransport(); },
  speed: (d) => { const v = Math.max(50, Math.min(100, S.speed + +d.v)); if (v === S.speed) return toast(v === 100 ? 'Full speed is the original recording.' : '50% is the slowest speed.'); const p = getPos(); S.speed = v; updHeader(); updTransport(); if (AU.playing) restart(p); else AU.pausedPos = p; },
  tr: (d) => { const v = Math.max(-6, Math.min(6, S.tr + +d.v)); if (v === S.tr) return; S.tr = v; retime(); },
  loopSet: (d) => { if (d.v === 'off') setLoop(null); else if (d.v === 'def') setLoop('def', T.loopDef.a, T.loopDef.b); else if (d.v === 'all') setLoop('all', 0, T.bars); else { const c = barAt(getPos()); setLoop('ab', c, Math.min(T.bars, c + 4)); } closeSheet(); },
  ab: (d) => { const b = +d.v; if (S.abA == null) { S.abA = b; renderSheet(); } else { const a = Math.min(S.abA, b), z = Math.max(S.abA, b); S.abA = null; setLoop('ab', a, z + 1); closeSheet(); } },
  mute: (d) => { S.ch[d.v].mute = !S.ch[d.v].mute; applyMix(); updMixer(); }, solo: (d) => { S.ch[d.v].solo = !S.ch[d.v].solo; applyMix(); updMixer(); },
  chordEdit: () => { S.edit = !S.edit; updTimeline(); const b = $('ceBtn'); if (b) { b.classList.toggle('on', S.edit); b.textContent = S.edit ? '✓ Done' : '✎ Edit chords'; } if (S.edit) toast('Tap a bar to change its chord.'); frame(true); },
  chordPick: (d) => { const c = T.chords[+d.v] || {}; openSheet('chord', { bar:+d.v, pc:c.nc ? T.keyPc : c.pc, q:c.nc ? 'maj' : c.q, all:false }); },
  chordSet: (d) => { S.ctx[d.k] = d.k === 'pc' ? +d.v : d.v; renderSheet(); }, chordAll: () => { S.ctx.all = !S.ctx.all; renderSheet(); },
  chordSave: () => { const c = S.ctx, old = T.chords[c.bar], nw = { pc:c.pc, q:c.q }; T.chords.forEach((x, i) => { if (i === c.bar || (c.all && old && !old.nc && !x.nc && x.pc === old.pc && x.q === old.q)) T.chords[i] = Object.assign({}, nw); });
    T.rec.chords = T.chords; saveUpload(T.rec); closeSheet(); updTimeline(); updFretboard(false); frame(true); },
  fixOpen: () => openSheet('fix'),
  fixBpm: (d) => { const u = T.rec, f = { third:1 / 3, half:0.5, double:2, triple:3 }[d.v]; u.bpm = f ? Math.round(u.bpm * f * 100) / 100 : Math.round((u.bpm + +d.v) * 100) / 100; regrid(); },
  fixBpb: (d) => { T.rec.bpb = +d.v; regrid(); },
  fixOff: (d) => { const u = T.rec, bl = 60 / u.bpm; u.off = u.off + (d.v === 'beat' ? bl : (d.v === '-beat' ? -bl : +d.v)); regrid(); },
  fixChords: () => rereadChords(false), fixRedo: () => rereadChords(true),
  fixKey: (d) => { const u = T.rec; u.keyPc = +d.v; saveUpload(u); openTrackKeep(); }, fixMode: (d) => { const u = T.rec; u.minor = d.v !== 'major' && d.v !== 'blues'; u.blues = d.v === 'blues'; saveUpload(u); openTrackKeep(); },
  demo: (d) => demo(d.v),
};
function openTrackKeep() { const sheet = S.sheet; openTrack(uploadTrack(T.rec)); if (sheet) openSheet(sheet); }
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (!el) return; const fn = ACT[el.dataset.act]; if (fn) fn(el.dataset, e, el); });
document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.vol; if (!k) return; S.ch[k].vol = +e.target.value; applyMix(); const v = $('v-' + k); if (v) v.textContent = S.ch[k].mute ? '—' : S.ch[k].vol + '%'; });
$('filePick').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f); });
document.addEventListener('dragover', (e) => { if (S.screen === 'library' && S.tab === 'jam') { e.preventDefault(); const d = $('drop'); if (d) d.classList.add('over'); } });
document.addEventListener('dragleave', () => { const d = $('drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', (e) => { if (S.screen !== 'library' || S.tab !== 'jam') return; e.preventDefault(); const d = $('drop'); if (d) d.classList.remove('over'); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

/* ================= notes (Thai) ================= */
const KEEP = [
  ['J1', 'Official backing tracks — ภาพปกและตัวกรอง', 'แทร็กที่ Litejam ผลิตเอง เล่นด้วย stem จริงจาก producer (กลอง เบส harmony) คอร์ดและจุดลูปตรวจโดยนักดนตรีแล้ว แสดงเป็นการ์ดพร้อมภาพฉากประจำ Style ชุดเดียวกับ Game Version กรองได้ตาม Style ระดับ และเฉพาะแทร็กที่พร้อมเล่น ตอนนี้เล่นได้ 2 แทร็ก อีก 8 แทร็กขึ้น Coming soon', 'official'],
  ['J2', 'อัปโหลดเพลงเอง — ไฟล์เดียวหรือหลาย stem', 'เลือกไฟล์เสียงจากเครื่อง (MP3, WAV, M4A ยาวไม่เกิน 10 นาที) ถ้าเลือกไฟล์เดียวจะเล่นเป็น full mix ถ้าเลือกหลายไฟล์พร้อมกัน (สูงสุด 6) แต่ละไฟล์เป็น 1 stem มี fader ของตัวเอง ตั้งชื่อ stem จากชื่อไฟล์ ไฟล์เก็บในเครื่องนี้เท่านั้น ไม่ได้ส่งออกไปไหน', 'upload'],
  ['J3', 'วิเคราะห์เพลงจริงบนเครื่อง', 'หา tempo เส้นบาร์ คอร์ดรายบาร์ และคีย์จากเสียงจริงของไฟล์ที่อัปโหลด ไม่ใช่ข้อมูลจำลอง ถ้าผลไม่ตรง แก้ได้: ✎ Edit chords แก้คอร์ดทีละบาร์หรือทุกบาร์ที่เป็นคอร์ดเดียวกัน และ ✎ Fix beat / key ปรับ BPM จังหวะแรกของบาร์ และคีย์ แล้วให้อ่านคอร์ดใหม่', 'upload'],
  ['J4', 'Chord timeline + NOW / NEXT', 'คอร์ดปัจจุบันตัวใหญ่ คอร์ดถัดไป จุดจังหวะ และแถบคอร์ดรายบาร์ แตะบาร์เพื่อไปเล่นจากตรงนั้น', 'play'],
  ['J5', 'Scale / Chord บนเฟรตบอร์ด + ไฟ LED', 'ดูสเกลที่ใช้โซโล หรือโน้ตของคอร์ดปัจจุบัน มีสเกลแนะนำ 3 ระดับ เลือกสเกลอื่นได้ทุกคีย์ มี Box 1, ป้ายโน้ตหรือ degree และ Target notes วงโน้ตของคอร์ดตอนนั้น ต่อกีตาร์ Litejam ผ่านปุ่ม Connect แล้วไฟ LED ขึ้นตามหน้าจอ', 'play'],
  ['J6', 'Loop', 'ลูปทั้งท่อนที่ producer กำหนด ลูป 4 บาร์จากจุดที่เล่นอยู่ หรือเลือก A–B เอง', 'play'],
  ['J7', 'Speed — ช้าลงโดยคีย์ไม่เปลี่ยน', 'ลดความเร็วได้ถึง 50% ทีละ 10% เสียงยังอยู่คีย์เดิม ใช้ได้ทั้งแทร็ก official และเพลงที่อัปโหลด ประมวลผลบนเครื่องตอนกด play', 'play'],
  ['J8', 'Transpose — เปลี่ยนคีย์ ±6', 'เปลี่ยนคีย์ของ backing track โดยความเร็วเท่าเดิม คอร์ด สเกล และไฟ LED เปลี่ยนตาม stem กลองไม่ถูกเปลี่ยนเสียง', 'play'],
  ['J9', 'Metronome + Count-in', 'เสียงคลิกตามจังหวะของเพลง และนับ 1 บาร์ก่อนเริ่ม', 'play'],
  ['J10', 'Stems mixer', 'Mute, Solo และ Volume ต่อ stem เช่นปิดเบสเพื่อฝึกเดินเบสเอง', 'play'],
];
const CUT = ['Guide licks, Call & response, All licks', 'Scored run, Leaderboard, โปรไฟล์และ Avatar', 'เวที โค้ช วงตัวละคร และผลตอบรับรายโน้ต (Game Version)', 'Jam & Record, วิดีโอ duet, แชร์ take', 'Playlist, Favourites, คลังจำลอง 1,200 เพลง และช่องค้นหา', 'Style mode (MIDI + samples) — แทนด้วย Speed / Transpose ที่ทำกับเสียงจริง', 'Normal / Pro view'];
function renderNotes() {
  $('notes').innerHTML = `<h1>Scale Mode · <span>Jam with Track</span></h1>
    <p class="lead">เวอร์ชันพื้นฐานของ Play with Track เปลี่ยนชื่อเป็น <b>Jam with Track</b> เหลือเฉพาะสิ่งที่ใช้ฝึกกีตาร์กับ backing track: แทร็ก official ของ Litejam และเพลงที่ผู้ใช้อัปโหลดเอง ตัด lick เกม และโซเชียลออกก่อน</p>
    <h2>สิ่งที่มีในเวอร์ชันนี้</h2>` + KEEP.map(f => `<div class="ft"><div class="top"><span class="id">${f[0]}</span><span class="nm">${f[1]}</span></div><p>${f[2]}</p><button class="try" data-act="demo" data-v="${f[3]}">${f[3] === 'upload' ? 'ไปหน้าอัปโหลด ›' : (f[3] === 'official' ? 'ดูรายการแทร็ก ›' : 'เปิด Classic Rock in Em ›')}</button></div>`).join('') +
    `<h2>สิ่งที่ตัดออกก่อน</h2><div class="ft"><p style="margin:0">${CUT.map(c => '• ' + c).join('<br>')}</p></div>
    <h2>ข้อจำกัดที่ควรรู้</h2><div class="ft"><p style="margin:0">• <b>แยก stem อัตโนมัติจากไฟล์เดียวยังไม่มี</b> เพราะต้องใช้โมเดลบนเซิร์ฟเวอร์ ในเว็บนี้ไฟล์เดียวเล่นเป็น full mix ส่วนผู้ใช้ที่มี stem อยู่แล้วอัปโหลดหลายไฟล์พร้อมกันได้<br>• การหา tempo สมมติว่าเพลงมี tempo คงที่และเป็น 4/4 เพลงที่อัดสดหรือเปลี่ยน tempo ต้องแก้เอง<br>• คอร์ดที่อ่านได้มี major, minor และ 7 ผู้ใช้แก้เป็น m7 หรือ maj7 เองได้<br>• Speed และ Transpose ประมวลผลบนเครื่อง เพลงยาวใช้เวลาไม่กี่วินาที คุณภาพเสียงพอสำหรับฝึก ไม่เท่าเสียงต้นฉบับ<br>• ไฟ LED ผ่าน BLE ใช้ได้บน Chrome / Edge ของคอมพิวเตอร์และ Android</p></div>
    <p class="foot">ไฟล์: <code style="color:#50BCFF">index.html</code> + <code style="color:#50BCFF">app.js</code> + <code style="color:#50BCFF">dsp.js</code> + <code style="color:#50BCFF">media/</code> (เฉพาะ stem ของ LJ001 และ LJ002)</p>`;
}
function demo(v) { if (AU.ctx && AU.playing) stop(); if (v === 'play') return openTrack(officialTrack('LJ002')); S.tab = 'jam'; S.screen = 'library'; renderView(); if (window.innerWidth <= 1020) window.scrollTo({ top:0, behavior:'smooth' }); }

/* ================= start ================= */
initBle(); renderNotes(); renderView();
DB.open().then(() => DB.all()).then((rows) => { if (rows && rows.length) { UPL = rows.sort((a, b) => b.added - a.added); if (S.screen === 'library') renderView(); } });
window.JWT = { S, AU, BLE, FB, DSP, DB, ledPayload, getPos, play, stop, addFiles, openTrack, officialTrack, uploadTrack, ACT, get T() { return T; }, get UPL() { return UPL; } };
})();
