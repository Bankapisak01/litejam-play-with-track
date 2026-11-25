/* Play › Backing Track — Litejam Play Mode prototype. BUILT FILE: edit play.part.js or make_play.py, then run python3 make_play.py */
(function () {
'use strict';
const DATA = window.LJ_DATA, MEDIA = window.LJ_MEDIA || {}, DSP = window.JWT_DSP;
const FW = 64, SH = 28, NFRET = 21, BARP = 62, MAXDUR = 600, MAXSTEMS = 6;
const NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const DEG = ['1','b2','2','b3','3','4','b5','5','b6','6','b7','7'];
const OPEN = [4, 11, 7, 2, 9, 4];            // string index 0 = high e
const QUAL = { dom7:[0,4,7,10], maj:[0,4,7], min:[0,3,7], min7:[0,3,7,10], maj7:[0,4,7,11] };
const QSUF = { maj:'', min:'m', dom7:'7', min7:'m7', maj7:'maj7' }, QNAME = { maj:'Major', min:'Minor', dom7:'7', min7:'m7', maj7:'maj7' };
const SCALES = { 'Minor Pentatonic':[0,3,5,7,10], 'Blues':[0,3,5,6,7,10], 'Natural Minor':[0,2,3,5,7,8,10], 'Major Pentatonic':[0,2,4,7,9], 'Major':[0,2,4,5,7,9,11],
  'Dorian':[0,2,3,5,7,9,10], 'Mixolydian':[0,2,4,5,7,9,10], 'Phrygian':[0,1,3,5,7,8,10] };
const PACK_SCALE = { pentMinor:'Minor Pentatonic', blues:'Blues', natMinor:'Natural Minor', pentMajor:'Major Pentatonic', major:'Major', follow:'follow' };
const FOLLOW = { dom7:'Mixolydian', maj:'Major Pentatonic', maj7:'Major Pentatonic', min:'Minor Pentatonic', min7:'Minor Pentatonic' };

const S = { page:'play', tab:'bt', nav:'app', screen:'library', ret:null, fb:'chord', q:'', lick:null, lm:'listen', score:null, mixOpen:false, recVideo:false, duet:true, from:null, scType:'Minor Pentatonic', scRoot:null, follow:false, pos:'full', labels:'notes', targets:true,
  loop:null, loopKind:null, abA:null, metro:false, countIn:true, speed:100, tr:0, ch:{}, sheet:null, ctx:null, edit:false, lf:{ style:'All', fav:false }, lfKeep:false };
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
    chords:p.chords.map(mkChord), sections:p.sections, loopDef:{ a:p.loop.a / p.ticksPerBar, b:p.loop.b / p.ticksPerBar, name:p.loopName },
    stems:p.channels.map(c => ({ k:c[0], name:c[1], src:c[2] })), scales:p.scales.map(s => ({ type:PACK_SCALE[s[0]] || s[0], lvl:s[1], desc:s[2] })), followName:p.followName, licks:mkLicks(p, barLen), duet:id === 'LJ002' };
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
    stems:u.files.map((f, i) => ({ k:'s' + i, name:f.stem, src:f.name })), scales:uploadScales(u), followName:'chord scales', rec:u, licks:[], duet:false });
}
const keyPc = () => mod(T.keyPc + S.tr, 12);
function chordAt(bar, half) {
  let c = T.chords[Math.max(0, Math.min(T.chords.length - 1, bar))]; if (half == null) half = bar === HALF.bar ? HALF.h : 0; if (c && c.h2 && half) c = c.h2;
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
  T.stems.forEach(s => { const c = S.ch[s.k]; let g = (c.mute || (any && !c.solo)) ? 0 : c.vol / 100; if (s.k === 'guide' && S.lick != null) g = Math.max(0.6, c.vol / 100); if (!AU.ch[s.k]) return; if (now) AU.ch[s.k].gain.value = g; else AU.ch[s.k].gain.setTargetAtTime(g, AU.ctx.currentTime, 0.015); });
}
function click(t, accent) {
  const o = AU.ctx.createOscillator(), g = AU.ctx.createGain(); o.frequency.value = accent ? 1400 : 900; g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + 0.08); AU.voices.push({ src:o, g, end:t + 0.1 });
}
function newSeg(a0, t0) {
  const r = S.speed / 100, end = S.loop ? loopEnd() : T.dur, seg = { a0, t0, end, tEnd: t0 + (end - a0) / r, sched: a0, pass: AU.pass, guide: guideOn(AU.pass) }; AU.pass++;
  AU.segs.push(seg); if (AU.segs.length > 4) AU.segs.shift();
  T.stems.forEach(s => { if (s.k === 'guide' && S.lick != null && !seg.guide) return; const b = AU.proc[s.k] || AU.buf[s.k]; if (!b) return; const al = AU.proc[s.k] ? AU.alpha[s.k] : 1, rate = AU.rate[s.k] || 1, off = a0 * al; if (off >= b.duration - 0.02) return;
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
    if (hp >= seg.end) { if (S.loop && !lastPass(seg)) { seg = newSeg(loopStart(), seg.tEnd); continue; } if (now >= seg.tEnd) endOfPlay(); }
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
  AU.busy = false; if (!ok || T.id !== id || S.screen !== 'player') { if (REC.arm) recStop(); return; }
  AU.ctx.resume(); let start = opts.from != null ? opts.from : AU.pausedPos;
  if (S.loop && (start < loopStart() - 1e-3 || start >= loopEnd() - 1e-3)) start = loopStart(); if (start >= T.dur - 0.05) start = 0;
  const now = AU.ctx.currentTime + 0.08; let t0 = now; AU.countUntil = 0;
  if ((S.countIn || opts.count) && !opts.noCount) { const bs = beatLen() / (S.speed / 100); for (let i = 0; i < T.bpb; i++) click(now + i * bs, i === 0); t0 = now + T.bpb * bs; AU.countStart = now; AU.countUntil = t0; AU.countBeat = bs; }
  if (!opts.noCount) AU.pass = 0; if (REC.arm) recBegin(t0); AU.playing = true; AU.segs = []; AU.pausedPos = start; newSeg(start, t0); clearInterval(AU.timer); AU.timer = setInterval(sched, 25); sched(); updTransport(); frame(true);
}
function stop(finished) {
  if (!AU.ctx) return; if (!finished) S.score = null; if (REC.on || REC.arm) recStop(); const p = AU.playing ? getPos() : AU.pausedPos; clearInterval(AU.timer); AU.playing = false; AU.countUntil = 0;
  AU.pausedPos = finished ? (S.loop ? loopStart() : 0) : p; killVoices(); $('countOvl').classList.remove('show'); updTransport(); updLicks(); frame(true);
}
function restart(pos) {                       // apply a seek / loop / speed / key change without a count-in
  if (!AU.playing) { if (pos != null) AU.pausedPos = pos; frame(true); return; }
  const p = pos != null ? pos : getPos(); clearInterval(AU.timer); AU.playing = false; killVoices(); AU.pass = Math.max(0, (AU.pass || 1) - 1); play({ from:p, noCount:true });
}

/* ================= fretboard ================= */
function fbHTML(dots, hiFrets) {
  let h = '<div class="fbwrap"><div class="strl">' + ['E','B','G','D','A','E'].map(l => `<div>${l}</div>`).join('') + '</div><div class="fbscroll"><div class="fb">';
  for (let f = 1; f <= NFRET + 1; f++) h += `<div class="fl ${f === 1 ? 'nut' : ''}" style="left:${f * FW}px"></div>`;
  [3, 5, 7, 9, 15, 17, 19, 21].forEach(f => { h += `<div class="in" style="left:${f * FW + FW / 2 - 5}px;top:${8 + 3 * SH - 5}px"></div>`; });
  [2, 4].forEach(k => { h += `<div class="in" style="left:${12 * FW + FW / 2 - 5}px;top:${8 + k * SH - 5}px"></div>`; });
  [1, 1, 1.5, 2, 2.5, 3].forEach((w, i) => { h += `<div class="st" style="top:${8 + i * SH + SH / 2 - w / 2}px;height:${w}px"></div>`; });
  dots.forEach(d => { h += `<div class="dot ${d.cls || ''}" data-k="${d.key || ''}" style="left:${d.f * FW + FW / 2 - 11}px;top:${8 + d.s * SH + SH / 2 - 11}px">${d.label}</div>`; });
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

/* ================= BLE: mirror the on-screen fretboard on a real Litejam guitar (Web Bluetooth) =================
   Same protocol as the Litejam app (lib/services/ble_service.dart → parseChordsToHex → characteristic EE04 of service 0x00EE):
   [colour groups] then per group [fret count] [fret, string bitmask]… [R, G, B], closed by "END" (0x45 0x4E 0x44).
   String bit 0 = string 1 (high e); fret 0 = the nut / open-string LED. Battery = FF02 of service 0x00FF. */
const BLE = { state:'off', dev:null, ch:null, name:'', bat:null, sync:true, busy:false, pending:null, last:'', sent:0, bytes:0, err:null };
const FB = { dots:[], on:new Set(), nx:null, show:false };
const LEDC = { r:[255, 0, 0], sc:[0, 110, 255], bn:[255, 170, 0], i3:[110, 255, 0], i5:[255, 170, 0], i7:[0, 110, 255], tg:[255, 255, 255], on:[110, 255, 0], nx:[255, 170, 0], dim:[0, 22, 60] };
const LED_CLEAR = [1, 1, 1, 1, 0, 0, 0, 0x45, 0x4E, 0x44];
function ledPayload(items) {                    // items: [{ s: 0..5 (0 = high e), f: fret, c: [r,g,b] }]
  const groups = new Map();
  items.forEach(d => { if (d.f < 0 || d.f > 24) return; const k = d.c.join(','); if (!groups.has(k)) groups.set(k, new Map()); const m = groups.get(k); m.set(d.f, (m.get(d.f) || 0) | (1 << d.s)); });
  if (!groups.size) return LED_CLEAR.slice();
  const out = [groups.size];
  groups.forEach((m, k) => { out.push(m.size); [...m.keys()].sort((a, b) => a - b).forEach(f => out.push(f, m.get(f) & 0x3f)); k.split(',').forEach(v => out.push(+v)); });
  out.push(0x45, 0x4E, 0x44); return out;
}
function ledItems() {                           // what the screen shows right now → LED colours
  if (!FB.show) return [];
  return FB.dots.map(d => { const c = d.cls || ''; if (c.includes('faint') || c.includes('mu')) return null;
    let col = LEDC.sc;
    if (c.includes('lk')) col = FB.on.has(d.key) ? LEDC.on : (FB.nx === d.key ? LEDC.nx : LEDC.dim);
    else if (/(^| )r( |$)/.test(c)) col = LEDC.r; else if (c.includes('tg')) col = LEDC.tg; else if (c.includes('bn')) col = LEDC.bn; else if (c.includes('i3')) col = LEDC.i3; else if (c.includes('i5')) col = LEDC.i5; else if (c.includes('i7')) col = LEDC.i7;
    return { s:d.s, f:d.f, c:col }; }).filter(Boolean);
}
function ledSync(force) { if (BLE.state !== 'on' || !BLE.ch) return; bleWrite(BLE.sync ? ledPayload(ledItems()) : LED_CLEAR.slice(), force); }
function bleWrite(arr, force) { const hex = arr.join(','); if (!force && hex === BLE.last && !BLE.pending) return; BLE.pending = arr; blePump(); }
async function blePump() {                       // one GATT write at a time; only the newest frame is kept while a write is in flight
  if (BLE.busy || !BLE.pending || !BLE.ch) return; BLE.busy = true;
  const arr = BLE.pending, buf = new Uint8Array(arr); BLE.pending = null;
  try { if (BLE.ch.writeValueWithoutResponse) await BLE.ch.writeValueWithoutResponse(buf); else await BLE.ch.writeValue(buf); BLE.last = arr.join(','); BLE.sent++; BLE.bytes = arr.length; BLE.err = null; }
  catch (e) { try { await BLE.ch.writeValue(buf); BLE.last = arr.join(','); BLE.sent++; BLE.bytes = arr.length; BLE.err = null; } catch (e2) { BLE.err = (e2 && e2.message) || String(e2); } }
  BLE.busy = false; if (BLE.pending) blePump();
}
function bleLost() { BLE.state = 'off'; BLE.ch = null; BLE.dev = null; BLE.bat = null; BLE.last = ''; BLE.pending = null; updBle(); if (S.sheet === 'ble') renderSheet(); toast('Guitar disconnected.'); }
async function bleConnect() {
  if (!navigator.bluetooth) { BLE.err = 'Web Bluetooth is not available in this browser.'; if (S.sheet === 'ble') renderSheet(); return; }
  try { BLE.state = 'connecting'; BLE.err = null; updBle(); if (S.sheet === 'ble') renderSheet();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮเแโใไ';
    const dev = await navigator.bluetooth.requestDevice({ filters:[...new Set(chars)].map(c => ({ namePrefix:c })), optionalServices:[0x00ee, 0x00ff] });
    BLE.dev = dev; BLE.name = dev.name || 'Litejam guitar'; dev.addEventListener('gattserverdisconnected', bleLost);
    const server = await dev.gatt.connect(), ctl = await server.getPrimaryService(0x00ee); BLE.ch = await ctl.getCharacteristic(0xee04);
    try { const st = await server.getPrimaryService(0x00ff), bc = await st.getCharacteristic(0xff02); BLE.bat = (await bc.readValue()).getUint8(0);
      await bc.startNotifications(); bc.addEventListener('characteristicvaluechanged', (e) => { BLE.bat = e.target.value.getUint8(0); updBle(); if (S.sheet === 'ble') renderSheet(); }); } catch (e) {}
    BLE.state = 'on'; BLE.last = ''; BLE.sent = 0; updBle(); ledSync(true); if (S.sheet === 'ble') renderSheet(); toast('Connected to ' + BLE.name + ' — the guitar LEDs now follow the screen.');
  } catch (e) { BLE.state = 'off'; BLE.ch = null; if (!e || e.name !== 'NotFoundError') { BLE.err = (e && e.message) || String(e); toast('Could not connect: ' + BLE.err); } updBle(); if (S.sheet === 'ble') renderSheet(); }
}
function updBle() { const b = $('bleBtn'); if (!b) return; b.className = 'blebtn ' + BLE.state;
  b.innerHTML = BLE.state === 'on' ? `<i></i>${esc(BLE.name.slice(0, 12))}${BLE.bat != null ? ' · ' + BLE.bat + '%' : ''}` : (BLE.state === 'connecting' ? '<i></i>Connecting…' : '🎸 Connect'); }
function sheetBle() {
  const ok = !!navigator.bluetooth, secure = window.isSecureContext;
  let h = '<h3>Litejam guitar <button data-act="closeSheet">✕</button></h3>';
  if (!ok || !secure) return h + `<p>This browser cannot use Bluetooth from a web page${secure ? '' : ' because the page is not served over https or localhost'}.</p>
    <div class="cmp"><div class="ci"><i class="y">✓</i><div><b>Works in</b><small>Chrome or Edge on Mac, Windows, Android and ChromeOS</small></div></div><div class="ci"><i class="n">✕</i><div><b>Does not work in</b><small>Safari and every browser on iPhone / iPad, Firefox</small></div></div></div>`;
  if (BLE.state === 'on') return h + `<div class="ropt on" style="cursor:default"><span style="font-size:24px">🎸</span><div><div class="rt" style="color:#fff">${esc(BLE.name)}</div><div class="rd">Connected${BLE.bat != null ? ' · battery ' + BLE.bat + '%' : ''} · ${BLE.sent} LED frames sent${BLE.bytes ? ' · last ' + BLE.bytes + ' bytes' : ''}</div></div></div>
    ${BLE.err ? `<p style="color:var(--red)">Last write failed: ${esc(BLE.err)}</p>` : ''}
    <div class="opt"><span style="font-size:13px">LED sync <span style="color:rgba(255,255,255,.5);font-size:11px">— the guitar shows what the fretboard shows</span></span><button class="tog ${BLE.sync ? 'on' : ''}" data-act="bleSync">${BLE.sync ? 'On' : 'Off'}</button></div>
    <div class="cmp"><div class="flbl" style="color:var(--green)">LED colours on the guitar</div>
      ${[['#ff2020', 'Root note'], ['#3b82f6', 'Scale note'], ['#ffffff', 'Target: chord tone of the current chord'], ['#ffb000', 'Blue note · chord 5th · lick: next note'], ['#8dff1a', 'Chord 3rd · lick: play this note now'], ['#123a70', 'Lick: the other notes (dim)']].map(c => `<div class="ci"><i style="width:12px;height:12px;border-radius:50%;background:${c[0]};margin-top:3px"></i><div><b style="font-weight:400">${c[1]}</b></div></div>`).join('')}</div>
    <div style="display:flex;gap:8px"><button class="cta alt" style="flex:1" data-act="bleTest">Test: light frets 0–12</button><button class="cta alt" style="flex:1" data-act="bleClear">LEDs off</button></div>
    <button class="cta alt" data-act="bleDisconnect" style="color:var(--red)">Disconnect</button>`;
  return h + `<p>Connect a real Litejam guitar and its fretboard LEDs follow this screen: the scale, the notes of each chord and the target notes, changing with the track.</p>
    <div class="cmp">${[['1', 'Switch the guitar on'], ['2', 'Close the Litejam app on your phone — the guitar accepts one connection at a time'], ['3', 'Tap Connect and pick your guitar in the browser’s list']].map(x => `<div class="ci"><i class="y">${x[0]}</i><div><b style="font-weight:400">${x[1]}</b></div></div>`).join('')}</div>
    ${BLE.err ? `<p style="color:var(--red)">${esc(BLE.err)}</p>` : ''}
    <button class="cta ${BLE.state === 'connecting' ? 'dis' : ''}" data-act="bleConnect">${BLE.state === 'connecting' ? 'Connecting…' : 'Connect guitar'}</button>
    <p>Uses Web Bluetooth: Chrome or Edge on a computer or Android phone. iPhone and iPad browsers cannot connect.</p>`;
}
function initBle() {
  updBle();
  Object.assign(ACT, {
    bleOpen: () => openSheet('ble'),
    bleConnect: () => { if (BLE.state === 'off') bleConnect(); },
    bleDisconnect: () => { try { bleWrite(LED_CLEAR.slice(), true); } catch (e) {} const d = BLE.dev; setTimeout(() => { try { if (d && d.gatt.connected) d.gatt.disconnect(); } catch (e) {} }, 250); },
    bleSync: () => { BLE.sync = !BLE.sync; ledSync(true); renderSheet(); },
    bleTest: () => { const items = []; for (let f = 0; f <= 12; f++) for (let s = 0; s < 6; s++) items.push({ s, f, c: f % 2 ? [0, 110, 255] : [110, 255, 0] }); bleWrite(ledPayload(items), true); setTimeout(() => { if (S.sheet === 'ble') renderSheet(); }, 400); },
    bleClear: () => { bleWrite(LED_CLEAR.slice(), true); setTimeout(() => { if (S.sheet === 'ble') renderSheet(); }, 400); },
  });
}


/* ================= cover art (shared with the game version) ================= */
const REAL_CAT = { LJ001:'Blues', LJ002:'Rock', LJ003:'Pop', LJ004:'Funk', LJ005:'Neo Soul', LJ006:'Jazz', LJ007:'Metal', LJ008:'Latin', LJ009:'Ambient', LJ010:'Rock' };
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const SCENE_BG = {
  Blues:'linear-gradient(165deg,#0a1040 0%,#1e40af 62%,#3b82f6 100%)', Rock:'linear-gradient(135deg,#190404 0%,#991b1b 55%,#f97316 100%)',
  Pop:'linear-gradient(135deg,#ec4899 0%,#fb923c 60%,#fde047 100%)', Funk:'linear-gradient(180deg,#3b0764 0%,#c2410c 68%,#f59e0b 100%)',
  'Neo Soul':'linear-gradient(180deg,#1e1b4b 0%,#9333ea 55%,#fdba74 100%)', Jazz:'linear-gradient(135deg,#0b1220 0%,#1e293b 100%)',
  Metal:'linear-gradient(180deg,#030303 0%,#27272a 62%,#52525b 100%)', Latin:'linear-gradient(135deg,#064e3b 0%,#16a34a 52%,#facc15 100%)',
  Ambient:'linear-gradient(180deg,#020617 0%,#0f3d3e 72%,#115e59 100%)', Country:'linear-gradient(180deg,#7c2d12 0%,#ea580c 46%,#fbbf24 100%)',
  'Thai Pop':'linear-gradient(135deg,#1e3a8a 0%,#7c3aed 52%,#ec4899 100%)', Reggae:'linear-gradient(180deg,#dc2626 0%,#facc15 50%,#16a34a 100%)',
  Upload:'linear-gradient(135deg,#2f2f36,#6b6b78)',
};
const spark = (x, y, r, fill, o) => `<path d="M${x} ${y - r} L${x + r * .22} ${y - r * .22} L${x + r} ${y} L${x + r * .22} ${y + r * .22} L${x} ${y + r} L${x - r * .22} ${y + r * .22} L${x - r} ${y} L${x - r * .22} ${y - r * .22}Z" fill="${fill}" opacity="${o || 1}"/>`;
const leaf = (x, y, ang, len, fill) => `<ellipse cx="${x + len}" cy="${y}" rx="${len}" ry="${len * .2}" fill="${fill}" transform="rotate(${ang} ${x} ${y})"/>`;
function scene(k, h) {
  const v = h % 7; let s = '';
  if (k === 'Blues') {                         // midnight city, moon, neon sound wave
    s += `<circle cx="174" cy="30" r="27" fill="#bfdbfe" opacity=".14"/><circle cx="174" cy="30" r="16" fill="#e0ecff"/><circle cx="168" cy="25" r="3" fill="#bfd3f5"/><circle cx="179" cy="35" r="2.2" fill="#bfd3f5"/>`;
    for (let i = 0; i < 10; i++) s += `<circle cx="${(i * 37 + v * 11) % 300}" cy="${6 + (i * 13) % 34}" r="${i % 3 ? .7 : 1.1}" fill="#fff" opacity=".7"/>`;
    const w = 'M0 62 H104 l6 -12 l7 24 l7 -32 l7 38 l7 -26 l6 12 l6 -4 H300';
    s += `<path d="${w}" fill="none" stroke="#67e8f9" stroke-width="6" opacity=".22" stroke-linejoin="round"/><path d="${w}" fill="none" stroke="#a5f3fc" stroke-width="1.8" stroke-linejoin="round"/>`;
    for (let i = 0; i < 17; i++) { const x = i * 18 - 3, hh = 14 + ((i * 5 + v * 3) % 5) * 5; s += `<rect x="${x}" y="${100 - hh}" width="16" height="${hh}" fill="#060a26"/>`;
      for (let q = 0; q < 3; q++) if ((i + q + v) % 3 === 0) s += `<rect x="${x + 3 + q * 4}" y="${100 - hh + 4 + ((i + q) % 2) * 5}" width="2" height="3" fill="#fde68a" opacity=".9"/>`; }
  } else if (k === 'Rock') {                   // lightning over an amp stack, halftone
    for (let i = 0; i < 8; i++) for (let q = 0; q < 8; q++) s += `<circle cx="${8 + i * 12}" cy="${8 + q * 12}" r="${Math.max(.6, 4.4 - i * .55)}" fill="#000" opacity=".22"/>`;
    for (let i = 0; i < 5; i++) s += `<polygon points="${300 - i * 34},0 ${318 - i * 34},0 ${118 - i * 34},100 ${104 - i * 34},100" fill="#fff" opacity=".05"/>`;
    s += `<rect x="212" y="30" width="70" height="70" rx="3" fill="#0a0a0a"/><rect x="217" y="46" width="60" height="50" fill="#1c1c1c"/><circle cx="233" cy="71" r="12" fill="#0a0a0a" stroke="#3a3a3a" stroke-width="2"/><circle cx="261" cy="71" r="12" fill="#0a0a0a" stroke="#3a3a3a" stroke-width="2"/><circle cx="233" cy="71" r="3" fill="#3a3a3a"/><circle cx="261" cy="71" r="3" fill="#3a3a3a"/>`;
    for (let i = 0; i < 5; i++) s += `<circle cx="${224 + i * 11}" cy="38" r="2.2" fill="#fde047"/>`;
    s += `<polygon points="166,6 130,56 150,56 136,98 182,42 159,42" fill="#000" opacity=".35"/><polygon points="162,2 126,52 146,52 132,94 178,38 155,38" fill="#fde047"/><polygon points="160,8 134,48 150,48" fill="#fff" opacity=".55"/>`;
  } else if (k === 'Pop') {                    // Memphis shapes, heart
    s += `<circle cx="150" cy="50" r="34" fill="#fff" opacity=".22"/><path d="M150 76 C112 50 128 20 150 40 C172 20 188 50 150 76Z" fill="#fff"/><path d="M150 68 C124 50 134 30 150 44 C166 30 176 50 150 68Z" fill="#f43f5e"/>`;
    s += `<path d="M16 34 q9 -14 18 0 t18 0 t18 0" fill="none" stroke="#1e3a8a" stroke-width="4" stroke-linecap="round"/><polygon points="248,14 280,58 226,60" fill="#22d3ee"/><rect x="34" y="62" width="50" height="16" rx="8" fill="#fff" opacity=".85" transform="rotate(-18 59 70)"/>`;
    s += `<circle cx="268" cy="80" r="10" fill="none" stroke="#fff" stroke-width="4"/><rect x="98" y="14" width="3" height="13" fill="#1e3a8a"/><rect x="93" y="19" width="13" height="3" fill="#1e3a8a"/><rect x="208" y="72" width="3" height="13" fill="#1e3a8a"/><rect x="203" y="77" width="13" height="3" fill="#1e3a8a"/>`;
    [[112, 82, '#fde047'], [196, 20, '#fff'], [122, 12, '#22d3ee'], [22, 86, '#fde047'], [232, 90, '#fff'], [70, 14, '#fff'], [186, 86, '#1e3a8a']].forEach((d, i) => { s += `<circle cx="${d[0]}" cy="${d[1]}" r="${2.4 + (i + v) % 3}" fill="${d[2]}"/>`; });
  } else if (k === 'Funk') {                   // 70s sunburst, retro arcs, disco ball
    for (let i = 0; i < 14; i += 2) { const a = Math.PI + i * Math.PI / 14, b = a + Math.PI / 14; s += `<polygon points="150,104 ${150 + Math.cos(a) * 240},${104 + Math.sin(a) * 240} ${150 + Math.cos(b) * 240},${104 + Math.sin(b) * 240}" fill="#fff" opacity=".09"/>`; }
    [['#fde047', 54], ['#fb923c', 44], ['#ef4444', 34], ['#a855f7', 24]].forEach(c => { s += `<circle cx="150" cy="102" r="${c[1]}" fill="none" stroke="${c[0]}" stroke-width="9"/>`; });
    s += `<line x1="150" y1="0" x2="150" y2="12" stroke="#e5e7eb" stroke-width="1"/><circle cx="150" cy="25" r="14" fill="#e5e7eb"/><circle cx="145" cy="20" r="5" fill="#fff" opacity=".8"/>`;
    for (let i = 1; i < 4; i++) s += `<ellipse cx="150" cy="25" rx="14" ry="${i * 3.6}" fill="none" stroke="#6b7280" stroke-width=".7"/><ellipse cx="150" cy="25" rx="${i * 3.6}" ry="14" fill="none" stroke="#6b7280" stroke-width=".7"/>`;
    s += spark(118, 18, 7, '#fff') + spark(184, 36, 5, '#fff') + spark(60, 40, 5, '#fde047', .9) + spark(240, 30, 6, '#fde047', .9);
  } else if (k === 'Neo Soul') {               // a vinyl record setting like the sun
    s += `<circle cx="52" cy="28" r="22" fill="#fff" opacity=".07"/><circle cx="252" cy="24" r="15" fill="#fff" opacity=".09"/>` + spark(92, 20, 4, '#fff', .8) + spark(214, 36, 3.5, '#fff', .8) + spark(120, 42, 2.5, '#fde68a', .9);
    s += `<circle cx="150" cy="80" r="46" fill="#0d0820"/>`; [40, 34, 28, 22].forEach(r => { s += `<circle cx="150" cy="80" r="${r}" fill="none" stroke="#fff" stroke-width=".8" opacity=".16"/>`; });
    s += `<path d="M118 62 A38 38 0 0 1 150 42" fill="none" stroke="#fff" stroke-width="3" opacity=".22" stroke-linecap="round"/><circle cx="150" cy="80" r="15" fill="#f472b6"/><circle cx="150" cy="80" r="9" fill="#fb923c"/><circle cx="150" cy="80" r="2.4" fill="#0d0820"/>`;
    [[84, 3], [90, 3.5], [96, 4]].forEach(l => { s += `<rect x="0" y="${l[0]}" width="300" height="${l[1] * .5}" fill="#1e1b4b" opacity=".55"/>`; });
  } else if (k === 'Jazz') {                   // Blue-Note style blocks, piano keys, a sax curve
    s += `<rect x="0" y="0" width="62" height="100" fill="#f3e6c4"/><circle cx="31" cy="30" r="15" fill="#0b1220"/><rect x="12" y="58" width="38" height="5" fill="#d4a84a"/><rect x="12" y="68" width="26" height="5" fill="#0b1220"/><rect x="12" y="78" width="32" height="5" fill="#0b1220"/>`;
    s += `<path d="M300 0 V74 A74 74 0 0 1 226 0Z" fill="#d4a84a"/><circle cx="208" cy="50" r="10" fill="#ef4444"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="${72 + i * 5}" y="0" width="1.4" height="100" fill="#f3e6c4" opacity=".4"/>`;
    s += `<g transform="rotate(-10 150 72)"><rect x="104" y="56" width="92" height="30" fill="#f8fafc"/>`; for (let i = 1; i < 8; i++) s += `<rect x="${104 + i * 11.5 - .4}" y="56" width=".8" height="30" fill="#94a3b8"/>`;
    [0, 1, 3, 4, 5].forEach(i => { s += `<rect x="${104 + i * 11.5 + 8}" y="56" width="7" height="18" fill="#0b1220"/>`; }); s += '</g>';
    s += `<path d="M124 8 C124 38 172 26 172 48 C172 62 150 62 148 50" fill="none" stroke="#d4a84a" stroke-width="7" stroke-linecap="round"/><circle cx="124" cy="8" r="5" fill="#d4a84a"/>`;
  } else if (k === 'Metal') {                  // blood moon behind jagged peaks
    s += `<circle cx="150" cy="44" r="36" fill="#b91c1c" opacity=".22"/><circle cx="150" cy="44" r="24" fill="#b91c1c"/><circle cx="143" cy="38" r="5" fill="#991b1b"/><circle cx="158" cy="52" r="3.5" fill="#991b1b"/>`;
    for (let i = 0; i < 10; i++) s += `<polygon points="${i * 30},0 ${i * 30 + 15},${12 + ((i * 7 + v) % 3) * 8} ${i * 30 + 30},0" fill="#000" opacity=".85"/>`;
    s += `<polyline points="92,0 100,24 93,31 105,54" fill="none" stroke="#e5e7eb" stroke-width="1.4"/><polyline points="214,0 208,20 216,28 206,46" fill="none" stroke="#e5e7eb" stroke-width="1.2" opacity=".8"/>`;
    s += `<polygon points="0,100 0,62 30,40 55,66 85,32 118,64 150,40 182,66 214,30 246,62 272,42 300,60 300,100" fill="#3f3f46"/><polygon points="85,32 78,44 92,42" fill="#71717a"/><polygon points="214,30 206,42 221,41" fill="#71717a"/>`;
    s += `<polygon points="0,100 0,80 22,58 40,84 70,54 96,86 126,62 150,88 178,58 204,84 232,56 262,86 284,64 300,78 300,100" fill="#0a0a0a"/>`;
  } else if (k === 'Latin') {                  // sun, palm leaves, tile diamonds
    s += `<circle cx="150" cy="44" r="34" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 6" opacity=".8"/><circle cx="150" cy="44" r="23" fill="#fde047"/><circle cx="150" cy="44" r="15" fill="#fb923c" opacity=".55"/>`;
    for (let i = 0; i < 16; i++) s += `<polygon points="${i * 20},92 ${i * 20 + 10},84 ${i * 20 + 20},92 ${i * 20 + 10},100" fill="#fff" opacity="${i % 2 ? .14 : .26}"/>`;
    [-12, -34, -56, -78].forEach((a, i) => { s += leaf(18, 104, a, 50 - i * 3, i % 2 ? '#065f46' : '#064e3b') + leaf(282, 104, 180 - a, 50 - i * 3, i % 2 ? '#065f46' : '#064e3b'); });
    [[92, 22], [212, 64], [236, 18]].forEach(p => { for (let q = 0; q < 5; q++) s += `<circle cx="${p[0] + Math.cos(q * 1.256) * 5}" cy="${p[1] + Math.sin(q * 1.256) * 5}" r="3.4" fill="#fb7185"/>`; s += `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="#fde047"/>`; });
  } else if (k === 'Ambient') {                // aurora over mountains
    for (let i = 0; i < 16; i++) s += `<circle cx="${(i * 41 + v * 17) % 300}" cy="${4 + (i * 11) % 44}" r="${i % 4 ? .6 : 1.1}" fill="#fff" opacity=".75"/>`;
    s += `<circle cx="176" cy="18" r="6.5" fill="#f1f5f9"/><circle cx="173.5" cy="16" r="6.5" fill="#06121f"/>`;
    s += `<path d="M0 44 C60 12 110 62 170 32 S260 12 300 36 L300 56 C250 34 200 64 150 52 S60 44 0 64Z" fill="#5eead4" opacity=".36"/><path d="M0 34 C70 54 120 16 190 44 S270 50 300 24 L300 40 C260 64 200 30 150 44 S50 60 0 48Z" fill="#a78bfa" opacity=".28"/><path d="M0 56 C80 40 140 70 210 50 S280 46 300 54 L300 64 C250 58 200 78 140 66 S40 62 0 70Z" fill="#67e8f9" opacity=".2"/>`;
    s += `<polygon points="0,100 0,84 40,66 75,82 120,58 160,80 200,62 245,84 275,70 300,80 300,100" fill="#020617"/><polygon points="120,58 112,66 128,65" fill="#e2e8f0" opacity=".55"/><polygon points="200,62 193,69 207,68" fill="#e2e8f0" opacity=".55"/><polygon points="40,66 34,72 46,71" fill="#e2e8f0" opacity=".45"/>`;
  } else if (k === 'Country') {                // desert road into a setting sun
    s += `<circle cx="150" cy="60" r="42" fill="#fde68a" opacity=".25"/><circle cx="150" cy="60" r="30" fill="#fef3c7"/>`;
    s += `<path d="M196 22 l6 4 l6 -4" fill="none" stroke="#431407" stroke-width="1.3"/><path d="M214 30 l5 3 l5 -3" fill="none" stroke="#431407" stroke-width="1.1"/>`;
    s += `<polygon points="0,72 0,48 28,48 32,56 54,56 60,72" fill="#7c2d12"/><polygon points="236,72 244,52 270,52 276,44 300,44 300,72" fill="#7c2d12"/><rect x="0" y="70" width="300" height="30" fill="#431407"/>`;
    s += `<polygon points="128,100 172,100 154,70 146,70" fill="#1c1917"/>`; [[74, 3.2, 8], [84, 4, 9], [95, 5, 6]].forEach(d => { s += `<rect x="${150 - d[1] / 4}" y="${d[0]}" width="${d[1] / 2}" height="${d[2]}" fill="#fde047"/>`; });
    s += `<rect x="78" y="42" width="8" height="34" rx="4" fill="#14532d"/><path d="M78 60 h-8 a4 4 0 0 1 -4 -4 v-8" fill="none" stroke="#14532d" stroke-width="6" stroke-linecap="round"/><path d="M86 56 h7 a4 4 0 0 0 4 -4 v-10" fill="none" stroke="#14532d" stroke-width="6" stroke-linecap="round"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="${196 + i * 12}" y="62" width="2.4" height="13" fill="#fed7aa"/>`; s += `<rect x="194" y="65" width="54" height="1.8" fill="#fed7aa"/><rect x="194" y="70" width="54" height="1.8" fill="#fed7aa"/>`;
  } else if (k === 'Thai Pop') {               // Bangkok night: neon signs, tiered roof silhouette
    s += `<path d="M0 12 Q150 30 300 10" fill="none" stroke="#0b1026" stroke-width="1" opacity=".7"/><path d="M0 20 Q150 40 300 16" fill="none" stroke="#0b1026" stroke-width="1" opacity=".5"/>`;
    s += `<circle cx="150" cy="44" r="29" fill="none" stroke="#f9a8d4" stroke-width="9" opacity=".2"/><circle cx="150" cy="44" r="29" fill="none" stroke="#fbcfe8" stroke-width="2.4"/>`;
    s += `<rect x="20" y="24" width="56" height="24" rx="6" fill="none" stroke="#67e8f9" stroke-width="2.2"/><rect x="28" y="32" width="26" height="2.6" fill="#67e8f9"/><rect x="28" y="38" width="38" height="2.6" fill="#67e8f9" opacity=".7"/><rect x="230" y="28" width="46" height="32" rx="7" fill="none" stroke="#fde047" stroke-width="2.2"/><circle cx="253" cy="44" r="7" fill="none" stroke="#fde047" stroke-width="2"/>`;
    s += `<polygon points="148.6,40 150,20 151.4,40" fill="#0b1026"/><polygon points="126,62 150,36 174,62" fill="#111a44"/><polygon points="112,82 150,52 188,82" fill="#0d1436"/><polygon points="100,100 100,84 150,66 200,84 200,100" fill="#0b1026"/>`;
    s += `<path d="M112 82 q-9 -1 -13 -10" fill="none" stroke="#0d1436" stroke-width="3" stroke-linecap="round"/><path d="M188 82 q9 -1 13 -10" fill="none" stroke="#0d1436" stroke-width="3" stroke-linecap="round"/><path d="M126 62 q-7 -1 -10 -8" fill="none" stroke="#111a44" stroke-width="2.6" stroke-linecap="round"/><path d="M174 62 q7 -1 10 -8" fill="none" stroke="#111a44" stroke-width="2.6" stroke-linecap="round"/>`;
    [[0, 30], [30, 22], [56, 34], [218, 30], [246, 20], [272, 34]].forEach((b, i) => { s += `<rect x="${b[0]}" y="${100 - b[1]}" width="${i % 3 === 1 ? 26 : 30}" height="${b[1]}" fill="#0b1026"/><rect x="${b[0] + 6}" y="${100 - b[1] + 6}" width="4" height="5" fill="#f9a8d4" opacity=".9"/><rect x="${b[0] + 16}" y="${100 - b[1] + 12}" width="4" height="5" fill="#67e8f9" opacity=".8"/>`; });
    s += spark(96, 20, 5, '#fff') + spark(206, 14, 4, '#fff') + spark(196, 66, 3, '#fde047');
  } else if (k === 'Reggae') {                 // sun splash, palm, sound-system speaker, waves
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + .26; s += `<polygon points="${150 + Math.cos(a - .1) * 30},${48 + Math.sin(a - .1) * 30} ${150 + Math.cos(a) * 46},${48 + Math.sin(a) * 46} ${150 + Math.cos(a + .1) * 30},${48 + Math.sin(a + .1) * 30}" fill="#fff7d6" opacity=".75"/>`; }
    s += `<circle cx="150" cy="48" r="24" fill="#fff7d6"/><circle cx="150" cy="48" r="16" fill="#fde047" opacity=".7"/>`;
    s += `<rect x="28" y="46" width="40" height="54" rx="3" fill="#1c1917"/><circle cx="48" cy="62" r="9" fill="#0c0a09" stroke="#44403c" stroke-width="2"/><circle cx="48" cy="84" r="12" fill="#0c0a09" stroke="#44403c" stroke-width="2"/><circle cx="48" cy="84" r="3.5" fill="#44403c"/>`;
    s += `<path d="M232 104 C228 74 236 52 248 38" fill="none" stroke="#1c1917" stroke-width="5" stroke-linecap="round"/>`; [200, 232, 262, 300, 334, 168].forEach((a, i) => { s += leaf(248, 38, a, 30 - (i % 2) * 4, '#052e16'); });
    s += `<path d="M0 90 q12 -8 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 V100 H0Z" fill="#052e16" opacity=".55"/><path d="M-12 96 q12 -7 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 V100 H-12Z" fill="#052e16"/>`;
  } else { for (let i = 0; i < 26; i++) { const hh = 12 + ((h >> (i % 20)) & 7) * 9; s += `<rect x="${44 + i * 8.4}" y="${50 - hh / 2}" width="4.6" height="${hh}" rx="2.3" fill="#fff" opacity=".32"/>`; } }
  return s;
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
  el.innerHTML = h || sheetExtra();
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

/* =====================================================================================================
   Play › Backing Track — everything that is specific to Play Mode.
   The audio engine, fretboard, upload analysis and the scale / loop / chord / fix sheets come from
   "Jam with Track (basic)/app.src.js" (make_play.py splices them in front of this file).
   ===================================================================================================== */

/* ================= user data (this device) ================= */
const U = (() => { const d = { fav:{}, recent:[], best:{}, like:{}, save:{}, profile:null }; try { return Object.assign(d, JSON.parse(localStorage.getItem('ljplay.v1') || '{}')); } catch (e) { return d; } })();
const saveU = () => { try { localStorage.setItem('ljplay.v1', JSON.stringify(U)); } catch (e) {} };
const DELIVERED = {};                         // delivered on the producer Drive but not ingested yet (none right now)
const HALF = { bar:-1, h:0 };                 // which half of the current bar is playing (for bars that hold two chords)
const mkChord = (c) => { const pcOf = (s) => NOTE.indexOf(s.match(/^[A-G]#?/)[0]), o = { pc:pcOf(c.sym), q:c.quality }; if (c.sym2) o.h2 = { pc:pcOf(c.sym2), q:c.quality2 }; return o; };
function syncHalf() { const pos = getPos(), bar = barAt(pos), c = T.chords[bar]; HALF.bar = bar; HALF.h = c && c.h2 && pos - barStart(bar) >= T.barLen / 2 - 1e-4 ? 1 : 0; return bar; }
const isReady = (t) => !!(DATA.packs[t.id] && MEDIA[t.id]);
const metaOf = (u) => `${NOTE[u.keyPc]}${u.blues ? ' Blues' : (u.minor ? ' minor' : ' major')} · ${Math.round(u.bpm)} BPM · ${u.bars} bars · ${u.files.length > 1 ? u.files.length + ' stems' : 'full mix'}`;
const shortKey = (t) => t.key.replace(' major', '').replace(' minor', 'm');
const trackDur = (t) => { const p = DATA.packs[t.id]; return p ? p.bars * p.ticksPerBar / p.ppq * 60 / p.bpm : 0; };

/* ================= licks ================= */
function mkLicks(p, barLen) {
  const tk = barLen / p.ticksPerBar;
  return (p.licks || []).map((l, i) => { const rel = l.notes.length && l.startTick > 0 && l.notes[0][0] < l.startTick - 1, off = rel ? l.startTick : 0;
    return { i, name:'Lick ' + (i + 1), a:l.startBar - 1, b:l.endBar, level:l.level, tech:l.techniques || [], chords:l.chords || [],
      notes:l.notes.map(n => ({ t:(n[0] + off) * tk, d:Math.max(0.12, n[1] * tk), s:n[2] - 1, f:n[3], bend:n[5], dead:!!n[6], vib:!!n[7] })) }; });
}
function lickFret(n) { if (n.dead) return n.f; let f = n.f + S.tr; if (f < 0) f += 12; if (f > NFRET) f -= 12; return f; }
function guideOn(pass) { if (S.lick == null) return true; if (S.score) return false; return S.lm === 'listen' ? true : (S.lm === 'copy' ? pass % 2 === 0 : false); }
function lastPass(seg) { if (S.score) return true; if ((REC.on || REC.arm) && REC.limit) return seg.pass + 1 >= REC.limit; return false; }
function endOfPlay() { const sc = S.score; stop(true); if (sc) scoreDone(sc); }
function lickStart(i, mode, opt) {
  opt = opt || {}; if (AU.ctx && AU.playing) stop(); const l = T.licks[i];
  S.lick = i; S.lm = mode; S.score = opt.score ? { lick:i } : null; S.loopKind = 'lick'; S.loop = { a:l.a, b:l.b }; S.fb = 'lick'; AU.pausedPos = loopStart(); LAST.lk = '';
  applyMix(true); updFretboard(true); updTab(); updTimeline(); updTransport(); updLicks(); updRec(); frame(true); if (!opt.hold) play({ count:true });
}
function lickOff() { if (S.lick == null) return; S.lick = null; S.score = null; if (S.fb === 'lick') S.fb = 'chord'; FB.on = new Set(); FB.nx = null; applyMix(true); updTab(); updLicks(); updRec(); updFretboard(true); }
function scoreDone(sc) {
  const v = 68 + Math.floor(Math.random() * 30), b = U.best[T.id] = U.best[T.id] || {}, old = b[sc.lick] || 0, isBest = v > old; if (isBest) { b[sc.lick] = v; saveU(); }
  S.score = null; updLicks(); frame(true); openSheet('result', { lick:sc.lick, v, old, isBest });
}

/* ================= preview in the list ================= */
const PV = { id:null, nodes:[], tm:0 };
function pvStop() { clearTimeout(PV.tm); PV.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); PV.nodes = []; const was = PV.id; PV.id = null; return was; }
function relist() { const b = $('blist'); if (b) b.innerHTML = listHTML(); }
async function preview(id) {
  const was = pvStop(); if (was === id) return relist(); if (AU.ctx && AU.playing) stop(); initCtx(); AU.ctx.resume(); PV.id = id; relist(); const t = officialTrack(id);
  try { if (!AU.cache[id]) { const bufs = {}; for (const s of t.stems) bufs[s.k] = await decodeUri(MEDIA[id][s.k]); AU.cache[id] = bufs; } } catch (e) { PV.id = null; relist(); return toast('Could not load the preview.'); }
  if (PV.id !== id || S.screen !== 'library') return; const now = AU.ctx.currentTime + 0.05, len = Math.min(15, t.dur);
  t.stems.forEach(s => { if (s.k === 'guide') return; const src = AU.ctx.createBufferSource(), g = AU.ctx.createGain(); src.buffer = AU.cache[id][s.k];
    g.gain.setValueAtTime(0.8, now); g.gain.setValueAtTime(0.8, now + len - 0.6); g.gain.linearRampToValueAtTime(0, now + len); src.connect(g); g.connect(AU.master); src.start(now); src.stop(now + len + 0.05); PV.nodes.push(src); });
  PV.tm = setTimeout(() => { pvStop(); relist(); }, len * 1000 + 100);
}

/* ================= chrome: header, segments, bottom nav ================= */
const SEGS = [['songs', 'Songs'], ['bt', 'Backing Track'], ['glow', 'GlowTab'], ['jam', 'Jam']];
const NAVS = { app:[['chord', 'Chord', 'icon_chord'], ['scale', 'Scale', 'icon_scale'], ['play', 'Play', 'play_icon'], ['learn', 'Learn', 'icon_perform'], ['device', 'Device', 'icon_setting']],
  figma:[['play', 'Play', 'play_icon'], ['learn', 'Learn', 'icon_perform'], ['jam', 'Jam', 'icon_tuner'], ['profile', 'Profile', 'icon_chord'], ['device', 'Device', 'icon_setting']] };
const PAGE_NAME = { play:'Play', jam:'Jam', scale:'Scale', chord:'Chord', learn:'Learn', device:'Device', profile:'Profile' };
function renderChrome() {
  const inPlayer = S.screen === 'player' && T, segs = S.nav === 'app' ? SEGS : SEGS.slice(0, 3);
  $('phone').classList.toggle('inplayer', !!inPlayer); $('phone').classList.toggle('notabs', S.page !== 'play');
  $('ptitle').innerHTML = `${PAGE_NAME[S.page]}${S.page === 'play' ? '<em class="beta">Beta</em>' : ''}`;
  $('tabs').innerHTML = segs.map(([id, label]) => `<button class="tab ${S.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}"><span>${label}${id === 'bt' ? '<em class="new">NEW</em>' : ''}</span><i></i></button>`).join('');
  $('nav').innerHTML = NAVS[S.nav].map(([id, l, i]) => `<div class="${S.page === id ? 'on' : ''}" data-act="nav" data-v="${id}">${icon(i, 22)}${l}</div>`).join('');
}
function renderView() {
  renderChrome();
  if (S.screen === 'player' && T) return renderPlayer();
  FB.show = false; ledSync();
  if (S.page === 'jam' || (S.page === 'play' && S.tab === 'jam')) return renderJam();
  if (S.page === 'scale') return renderScaleStub();
  if (S.page !== 'play') { $('view').innerHTML = `<div class="pad"><div class="sub" style="padding:48px 12px">${PAGE_NAME[S.page]} — unchanged, not part of this prototype.<br>Open <b style="color:var(--green)">Play › Backing Track</b>.</div></div>`; return; }
  if (S.tab === 'songs') return renderSongs();
  if (S.tab === 'glow') return renderGlow();
  renderLibrary();
}

/* ================= Songs + GlowTab (existing segments, shown for context only) ================= */
const SONGS = [['คิดถึง - SILLY FOOLS', 'Eb', 120, '04:53', 0], ['เพียงรัก', 'Eb', 187, '04:30', 0], ['Avenged Sevenfold - Nightmare', 'Dm', 130, '06:15', 1], ['Oasis - Don\'t Look Back In Anger', 'C', 81, '04:47', 0], ['Champagne Supernova (Remastered)', 'A', 75, '07:29', 0]];
function renderSongs() {
  $('view').innerHTML = `<div class="pad"><div class="search"><span>⌕</span><input placeholder="Find songs to play" disabled></div>
    <div class="frow"><span class="chip">Type: <b style="color:#fff">All</b></span><span class="chip">♡ Favorite</span></div>
    <div class="lbl plain">Recently viewed</div>
    ${SONGS.map((s, i) => `<div class="srow"><button class="main" data-act="songStub"><span class="cov yt" style="background:hsl(${i * 67 + 200},35%,26%)">▶</span><div class="ri"><div class="tt">${esc(s[0])}</div><div class="mm">Key ${s[1]} · ${s[2]} BPM · ${s[3]}</div><div class="tags">${s[4] ? '<span class="pill b">Tab</span>' : ''}<span class="pill g">Lyrics</span></div></div></button><button class="hv">♡</button></div>`).join('')}
    <button class="cross" data-act="tab" data-v="bt"><b>New · Backing Track</b><span>Studio tracks made for soloing — stems, licks, record and share. No vocals, no YouTube.</span><em>Open ›</em></button>
    <div class="note">Songs = chords read from a YouTube link. This segment is the current app and is not changed by this prototype.</div></div>`;
}
function renderGlow() {
  $('view').innerHTML = `<div class="pad"><div class="search"><span>⌕</span><input placeholder="Find tabs" disabled></div>
    <div class="lbl plain">Official tabs <small>in development</small></div>
    ${[['Bach — Prelude in C', 'Fingerstyle · C · 72 BPM'], ['In My Life', 'Fingerstyle · A · 104 BPM'], ['Move The Sky', 'Signature · Em · 120 BPM']].map((s, i) => `<div class="srow"><button class="main" data-act="glowStub"><span class="cov yt" style="background:hsl(${i * 80 + 90},30%,24%)">♪</span><div class="ri"><div class="tt">${s[0]}</div><div class="mm">${s[1]}</div><div class="tags"><span class="pill b">Tab</span><span class="pill y">LED</span></div></div></button><button class="hv">♡</button></div>`).join('')}
    <div class="note">GlowTab is being built in its own project. It is shown here only to place Backing Track between Songs and GlowTab. Shared with Backing Track: the same player frame (timeline · transport · fretboard) and the same <b>Jam & Record</b> card.</div></div>`;
}

/* ================= Backing Track library ================= */
function coverHTML(cat, id) { return `<span class="cov" style="background:${SCENE_BG[cat] || SCENE_BG.Upload}"><svg viewBox="100 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${scene(cat, hash(id))}</svg></span>`; }
function trackRow(t) {
  const ready = isReady(t), cat = REAL_CAT[t.id], p = DATA.packs[t.id], k = shortKey(t), on = PV.id === t.id;
  const pills = ready ? `<span class="pill g">Stems</span>${p.licks && p.licks.length ? `<span class="pill b">${p.licks.length} licks</span>` : ''}${t.id === 'LJ002' ? '<span class="pill y">Duet</span>' : ''}` : `<span class="pill x">${DELIVERED[t.id] ? 'Delivered · in QA' : 'Coming soon'}</span>`;
  return `<div class="srow ${ready ? '' : 'soon'}"><button class="main" data-act="openOfficial" data-v="${t.id}">${coverHTML(cat, t.id)}<div class="ri"><div class="tt">${esc(t.style + ' in ' + k)}</div><div class="mm">Key ${esc(k)} · ${t.bpm} BPM${ready ? ' · ' + fmt(trackDur(t)) : ''} · ${t.level}</div><div class="tags">${pills}</div></div></button>
    ${ready ? `<button class="pv ${on ? 'on' : ''}" data-act="preview" data-v="${t.id}" aria-label="${on ? 'Stop preview' : 'Preview'}">${on ? '■' : '▶'}</button>` : ''}<button class="hv ${U.fav[t.id] ? 'on' : ''}" data-act="fav" data-v="${t.id}" aria-label="Favourite">${U.fav[t.id] ? '♥' : '♡'}</button></div>`;
}
function listHTML() {
  const f = S.lf, q = S.q.trim().toLowerCase();
  const list = DATA.tracks.filter(t => (f.style === 'All' || REAL_CAT[t.id] === f.style) && (!f.fav || U.fav[t.id]) && (!q || q.split(/\s+/).every(w => (t.style + ' ' + t.key + ' ' + t.scale + ' ' + t.level + ' ' + t.bpm + ' ' + REAL_CAT[t.id]).toLowerCase().includes(w))));
  return list.length ? list.map(trackRow).join('') : `<div class="empty">No track matches. <button class="chip" data-act="libClear" style="margin-left:6px">Show all</button></div>`;
}
function renderLibrary() {
  const f = S.lf, styles = [...new Set(DATA.tracks.map(t => REAL_CAT[t.id]).filter(Boolean))], keep = $('view').scrollTop;
  const rec = U.recent.map(id => DATA.tracks.find(t => t.id === id)).filter(t => t && isReady(t))[0];
  $('view').innerHTML = `<div class="pad">
    <div class="search"><span>⌕</span><input id="q" placeholder="Find backing tracks — style, key, scale" value="${esc(S.q)}"></div>
    <div class="frow"><button class="chip ${f.fav ? 'on' : ''}" data-act="libFav">♡ Favorite</button>${['All'].concat(styles).map(s => `<button class="chip ${f.style === s ? 'on' : ''}" data-act="libStyle" data-v="${s}">${s}</button>`).join('')}</div>
    <div class="banner"><b>Official Litejam Tracks</b> — preview, play with stems and licks, record your jam and share it.</div>
    ${rec ? `<button class="cont" data-act="openOfficial" data-v="${rec.id}">${coverHTML(REAL_CAT[rec.id], rec.id)}<div class="ri"><div class="k">CONTINUE</div><div class="tt">${esc(rec.style + ' in ' + shortKey(rec))}</div></div><em>▶</em></button>` : ''}
    <div class="lbl plain" id="f-official">Official tracks <small>by Litejam · studio stems</small></div>
    <div id="blist" style="display:flex;flex-direction:column;gap:8px">${listHTML()}</div>
    <div class="lbl plain" id="f-upload">Your tracks <small>${UPL.length ? 'kept on this device' : ''}</small></div>
    ${UPL.map(u => `<div class="srow"><button class="main" data-act="openUpload" data-v="${u.id}"><span class="cov yt" style="background:#2c2c2c;color:var(--green)">${NOTE[u.keyPc]}${u.minor ? 'm' : ''}</span><div class="ri"><div class="tt">${esc(u.title)}</div><div class="mm">${metaOf(u)}</div><div class="tags"><span class="pill x">Your upload</span></div></div></button><button class="hv" data-act="delUpload" data-v="${u.id}" aria-label="Delete">✕</button></div>`).join('')}
    <button class="drop slim" id="drop" data-act="pick">${icon('file_plus_icon', 24)}<b>Upload your own backing track</b><span>MP3, WAV, M4A · one file or several stems · chords, key and tempo are read on this device</span></button>
  </div>`;
  if (S.lfKeep) { $('view').scrollTop = keep; S.lfKeep = false; }
}

/* ================= Scale mode (mock of the existing tab + the new links to Backing Track and Jam) ================= */
S.sc = { root:9, type:'Minor Pentatonic', pos:'box' };
const SCG = { 'Minor Pentatonic':'min', 'Blues':'min', 'Natural Minor':'min', 'Dorian':'min', 'Phrygian':'min', 'Major Pentatonic':'maj', 'Major':'maj', 'Mixolydian':'maj' };
const trackGroup = (id) => /Minor/.test(PACK_SCALE[DATA.packs[id].scales[0][0]] || '') ? 'min' : 'maj';
function scaleFits() {                         // official tracks this scale works on; other keys are offered with the key changed to match
  const g = SCG[S.sc.type]; return DATA.tracks.filter(t => isReady(t) && trackGroup(t.id) === g).map(t => { let tr = mod(S.sc.root - DATA.packs[t.id].keyPc, 12); if (tr > 6) tr -= 12; return { t, tr }; }).sort((x, y) => Math.abs(x.tr) - Math.abs(y.tr));
}
function renderScaleStub() {
  const sc = S.sc, box = boxRange(sc.root), range = sc.pos === 'box' ? box : null, name = NOTE[sc.root] + ' ' + sc.type, fits = scaleFits(), g = SCG[sc.type], keep = $('view').scrollTop;
  const dots = scaleDots(sc.root, SCALES[sc.type], { range, blueIv: sc.type === 'Blues' ? 6 : null });
  const posts = FEED.filter(p => p.tid && DATA.packs[p.tid] && trackGroup(p.tid) === g).slice(0, 3);
  $('view').innerHTML = `<div class="pad">
    <div class="frow"><span class="chip on">Scale</span><span class="chip">Chromatic</span><span class="chip">Scale Flow</span><span class="cnt">existing tab · mock</span></div>
    <div class="bgrid" style="grid-template-columns:repeat(6,1fr)">${NOTE.map((n, i) => `<button class="${sc.root === i ? 'a' : ''}" data-act="scKey" data-v="${i}">${n}</button>`).join('')}</div>
    <div class="frow">${Object.keys(SCALES).map(t => `<button class="chip ${sc.type === t ? 'on' : ''}" data-act="scKind" data-v="${t}">${t}</button>`).join('')}</div>
    <div class="opt"><div style="font-size:17px;font-weight:700;color:var(--blue)">${name}</div><div class="seg"><button class="${sc.pos === 'full' ? 'on' : ''}" data-act="scPos" data-v="full">Full neck</button><button class="${sc.pos === 'box' ? 'on' : ''}" data-act="scPos" data-v="box">Box 1</button></div></div>
    <div id="scFb">${fbHTML(dots, range)}</div>
    <div class="row3" style="grid-template-columns:1fr 1fr"><button class="abtn" data-act="scStub">Practice</button><button class="abtn" data-act="scStub">Challenge · XP</button></div>
    <div class="newsec"><div class="lbl plain"><em class="new">NEW</em> Jam with this scale <small>${fits.length} backing track${fits.length === 1 ? '' : 's'}</small></div>
      <div class="cap">Take ${name} to a real band. The track opens in Play › Backing Track with this scale${sc.pos === 'box' ? ' and Box 1' : ''} already on the fretboard and the LEDs.</div>
      ${fits.length ? fits.map(({ t, tr }) => `<div class="srow"><button class="main" data-act="fromScale" data-v="${t.id}" data-tr="${tr}">${coverHTML(REAL_CAT[t.id], t.id)}<div class="ri"><div class="tt">${esc(t.style)} in ${NOTE[sc.root]}${g === 'min' ? 'm' : ''}</div><div class="mm">${t.bpm} BPM · ${t.level}</div><div class="tags">${tr ? `<span class="pill y">Key changed ${tr > 0 ? '+' : ''}${tr} from ${esc(shortKey(t))}</span>` : '<span class="pill g">Original key</span>'}</div></div></button>
        <button class="pv on" data-act="fromScale" data-v="${t.id}" data-tr="${tr}" aria-label="Jam">▶</button><button class="pv rec" data-act="fromScaleRec" data-v="${t.id}" data-tr="${tr}" aria-label="Record a jam">●</button></div>`).join('') : '<div class="empty">No official track for this kind of scale yet.</div>'}
      <div class="hint2">▶ jam along · <span style="color:var(--red)">●</span> open with video recording ready, then post to Jam</div></div>
    <div class="newsec"><div class="lbl plain"><em class="new">NEW</em> From Jam <small>people playing ${g === 'min' ? 'minor' : 'major'} scales</small><button class="chip mini" data-act="nav" data-v="jam" style="margin-left:auto">See all ›</button></div>
      ${posts.length ? posts.map(p => `<div class="tkrow"><button class="main" data-act="openOfficial" data-v="${p.tid}"><span class="av" style="width:30px;height:30px;font-size:13px;background:hsl(${hash(p.who) % 360},45%,38%)">${esc(p.who[0])}</span><div class="ri"><div class="tt">${esc(p.who)} · ${esc(DATA.packs[p.tid].title)}</div><div class="mm">${esc(p.chips.join(' · '))}${p.duet ? ' · duet' : ''}</div></div></button><button class="chip" data-act="openOfficial" data-v="${p.tid}">▶ Play</button></div>`).join('') : '<div class="empty">No jams in this kind of scale yet — be the first.</div>'}</div>
    <div class="note">Scale mode keeps the lesson: forms, Practice, Challenge and XP. It has no backing-track player of its own any more — every track plays in Play › Backing Track, so takes, favourites and best scores live in one place.</div></div>`;
  FB.dots = dots; FB.show = true; const el = document.querySelector('#scFb .fbscroll'); if (el) el.scrollLeft = Math.max(0, box[0] * FW - 60); ledSync();
  if (S.lfKeep) { $('view').scrollTop = keep; S.lfKeep = false; }
}

/* ================= player ================= */
function openTrack(t, opt) {
  opt = opt || {}; if (AU.ctx && AU.playing) stop(); pvStop(); const ret = S.screen === 'player' ? S.ret : { page:S.page, tab:S.tab };
  T = t; S.ch = {}; T.stems.forEach(s => { S.ch[s.k] = { vol:85, mute:s.k === 'guide', solo:false }; });
  const first = T.scales[0]; Object.assign(S, { page:'play', tab:'bt', screen:'player', ret, fb:opt.fb || 'chord', scType: first.type === 'follow' ? 'Minor Pentatonic' : first.type, scRoot:null, follow:first.type === 'follow', pos:opt.pos || 'full',
    loop:null, loopKind:null, abA:null, speed:100, tr:opt.tr || 0, edit:false, sheet:null, lick:null, lm:'listen', score:null, from:opt.from || null, mixOpen:false, jam:opt.jam || null });
  if (opt.scType) { S.follow = false; S.scType = opt.scType; }
  if (t.official) { U.recent = [t.id].concat(U.recent.filter(x => x !== t.id)).slice(0, 6); saveU(); }
  AU.pausedPos = 0; AU.segs = []; Object.assign(LAST, { bar:-1, beat:-1, lk:'', turn:'' }); renderView(); renderNotes(); $('view').scrollTop = 0;
  ensureAudio().catch(() => { idle(); toast('This browser could not decode the audio. Open in Chrome or Safari.'); });
}
function renderPlayer() {
  if (S.jam) return renderJamSession();
  $('view').innerHTML = `<div class="pad" id="player">
    <div class="hd"><button class="back" data-act="back">‹</button>
      <div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(T.title)}</div><div style="font-size:11px;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${T.official ? 'Official Litejam Track' : 'Your upload · analysed on this device'} · ${T.timeSig} · ${T.bars} bars</div></div>
      <div style="display:flex;gap:6px" id="kchips"></div>${T.official ? `<button class="hv big ${U.fav[T.id] ? 'on' : ''}" id="favBtn" data-act="fav" data-v="${T.id}">${U.fav[T.id] ? '♥' : '♡'}</button>` : ''}</div>
    ${S.from === 'scale' ? `<div class="fromb"><span>From <b>Scale mode</b> · ${NOTE[keyPc()]} ${esc(S.scType)}${S.pos === 'box' ? ' · Box 1' : ''} kept${S.tr ? ' · key changed ' + (S.tr > 0 ? '+' : '') + S.tr : ''}</span><button class="chip mini" data-act="nav" data-v="scale">‹ Back to Scale</button></div>` : ''}
    <div id="recBox"></div>
    <div class="now" id="nowbar"></div>
    <div id="f-timeline"><div class="lbl">Chord timeline${T.official ? '' : '<button class="chip mini" data-act="chordEdit" id="ceBtn">✎ Edit chords</button><button class="chip mini" data-act="fixOpen">✎ Fix beat / key</button>'} <small id="timeLbl"></small></div><div class="tl" id="tl" style="margin-top:6px"></div></div>
    <div class="card" id="f-transport"></div>
    <div id="f-fret" style="display:flex;flex-direction:column;gap:10px"><div class="fbbar" id="fbbar"></div><div id="turn"></div><div id="fbBox"></div><div id="tabBox"></div><div id="legend" class="legend"></div>
      <button class="linkrow" data-act="scaleLink" id="scLink"></button></div>
    <div id="f-licks" class="sec"></div>
    <div id="f-rec" class="sec"></div>
    <div id="f-mixer" class="sec"></div>
  </div>`;
  updHeader(); updFretboard(true); updTab(); updTimeline(); updTransport(); updLicks(); updRec(); updMixer(); frame(true);
}
function updHeader() { if (!$('kchips')) return; $('kchips').innerHTML = `<div class="kchip" style="color:var(--green)">${NOTE[keyPc()]}${T.keySuffix}</div><div class="kchip" style="color:var(--blue)">${Math.round(T.bpm * S.speed / 100)} BPM</div>`; }
function updNow(bar) {
  const el = $('nowbar'); if (!el) return; let nb = bar + 1; if (S.loop && nb >= S.loop.b) nb = S.loop.a; const split = T.chords[bar] && T.chords[bar].h2 && !HALF.h;
  el.innerHTML = `<div><div class="k">NOW</div><div class="c1">${chordAt(bar).label}</div><div class="beats" id="beats">${'<i></i>'.repeat(T.bpb)}</div></div>
    <div><div class="k" style="color:rgba(255,255,255,.35)">NEXT</div><div class="c2">${split ? chordAt(bar, 1).label : (nb < T.bars ? chordAt(nb, 0).label : '—')}</div><div style="height:14px"></div></div>`;
  LAST.beat = -1;
}
function updFretboard(scroll) {
  if (!$('fbBox')) return; const bar = syncHalf(), sc = scaleNow(bar), c = chordAt(bar), box = boxRange(sc.root);
  const seg = (v, l) => `<button class="${S.fb === v ? 'on' : ''}" data-act="fb" data-v="${v}">${l}</button>`, lickOn = S.fb === 'lick' && S.lick != null;
  $('fbbar').innerHTML = `<div class="seg">${seg('chord', 'Chord')}${seg('scale', 'Scale')}${S.lick != null ? seg('lick', 'Lick') : ''}</div>` +
    (lickOn ? `<div class="scalechip"><span style="color:var(--green)">♪</span><b style="color:var(--green)">${T.licks[S.lick].name} · bars ${T.licks[S.lick].a + 1}–${T.licks[S.lick].b}</b></div>`
      : `<button class="scalechip" data-act="openScale"><span style="color:var(--blue)">♪</span><b>${S.follow ? 'Follow the chord · ' : ''}${sc.name}</b><em>Edit ›</em></button>`);
  let dots, hi = null, legend;
  if (lickOn) { const seen = {}; dots = []; T.licks[S.lick].notes.forEach(n => { if (n.dead) return; const f = lickFret(n), key = n.s + '-' + f; if (seen[key]) return; seen[key] = 1; dots.push({ s:n.s, f, key, label:NOTE[(OPEN[n.s] + f) % 12], cls:'lk' }); });
    const fs = dots.map(d => d.f); hi = [Math.min(...fs), Math.max(...fs)]; legend = [['#8dff1a', 'Play now'], ['#ffb000', 'Next note'], ['#1d4f8f', 'Other notes of the lick']]; LAST.lk = ''; }
  else if (S.fb === 'chord') { dots = c.nc ? [] : chordDots(c); legend = [['#FF2020', 'Root'], ['#ADFE00', '3rd'], ['#FFCC00', '5th'], ['#50BCFF', '7th']]; }
  else { const range = S.pos === 'box' ? box : null; if (range) hi = range; const tp = S.targets && !c.nc ? c.iv.map(i => (c.pc + i) % 12) : null;
    dots = scaleDots(sc.root, sc.iv, { range, targetPcs:tp, blueIv: sc.type === 'Blues' ? 6 : null });
    legend = [['#FF2020', 'Root note'], ['#50BCFF', 'Scale note']]; if (sc.type === 'Blues') legend.push(['#FFCC00', 'Blue note']); if (tp) legend.push(['ring', 'Target: notes of ' + c.label]); }
  if (!lickOn) { FB.on = new Set(); FB.nx = null; }
  const prev = document.querySelector('#fbBox .fbscroll'), sl = prev ? prev.scrollLeft : 0;
  FB.dots = dots; FB.show = true; $('fbBox').innerHTML = fbHTML(dots, hi);
  const el = document.querySelector('#fbBox .fbscroll'); el.scrollLeft = scroll ? (hi ? Math.max(0, hi[0] * FW - 40) : (S.fb === 'scale' ? Math.max(0, box[0] * FW - 60) : 0)) : sl;
  $('legend').innerHTML = legend.map(([col, t]) => `<span><i style="${col === 'ring' ? 'background:#50BCFF;box-shadow:0 0 0 2px #fff' : 'background:' + col}"></i>${t}</span>`).join('');
  const lk = $('scLink'); if (lk) lk.innerHTML = `<span>🎯</span><div><b>Learn ${esc(sc.name)} in Scale mode</b><small>Forms, Practice and Challenge for this scale — then come back and jam</small></div><em>›</em>`;
  ledSync();
}
function updTab() {
  const el = $('tabBox'); if (!el) return; if (S.lick == null) { el.innerHTML = ''; return; }
  const l = T.licks[S.lick], a = barStart(l.a), len = (l.b - l.a) * T.barLen, BW = 170, W = (l.b - l.a) * BW; let h = `<div class="tab2" id="tabScroll"><div class="tabin2" style="width:${W + 24}px">`;
  for (let s = 0; s < 6; s++) h += `<i class="ln" style="top:${12 + s * 14}px"></i>`;
  for (let b = 0; b <= l.b - l.a; b++) h += `<i class="bl" style="left:${12 + b * BW}px"></i>`;
  l.notes.forEach((n, j) => { h += `<b data-j="${j}" style="left:${14 + (n.t - a) / len * W}px;top:${5 + n.s * 14}px">${n.dead ? 'x' : lickFret(n)}${n.bend ? '<sup>b</sup>' : ''}${n.vib ? '<sup>~</sup>' : ''}</b>`; });
  el.innerHTML = h + `<i class="ph" id="tabPh"></i></div></div>`;
}
function updTimeline() {
  const el = $('tl'); if (!el) return; let h = `<div class="tlin" style="width:${T.bars * BARP + 4}px"><div class="bars">`;
  for (let b = 0; b < T.bars; b++) { const sec = T.sections.find(s => s.from === b + 1), inLoop = S.loop && b >= S.loop.a && b < S.loop.b;
    let mark = ''; if (S.loop && b === S.loop.a) mark = 'A'; if (S.loop && b + 1 === S.loop.b) mark = mark ? 'A=B' : 'B';
    h += `<button class="bar ${inLoop ? 'lp' : ''} ${S.edit ? 'ed' : ''}" data-act="${S.edit ? 'chordPick' : 'seek'}" data-v="${b}" data-b="${b}"><div class="s">${sec ? sec.name : ''}<em>${mark}</em></div><div class="c ${T.chords[b] && T.chords[b].h2 ? 'sp' : ''}">${T.chords[b] && T.chords[b].h2 ? `<span>${chordAt(b, 0).label}</span><span>${chordAt(b, 1).label}</span>` : chordAt(b, 0).label}<small>${b + 1}</small></div></button>`; }
  el.innerHTML = h + '</div><div class="tlph" id="tlPh" style="top:15px"></div></div>'; LAST.bar = -1;
}
function loopLabel() { if (!S.loop) return 'Loop off'; if (S.loopKind === 'lick') return T.licks[S.lick].name; if (S.loopKind === 'def') return T.loopDef.name; if (S.loopKind === 'all') return 'Whole track'; const a = S.loop.a + 1, b = S.loop.b; return a === b ? 'Bar ' + a : 'Bars ' + a + '–' + b; }
function updTransport() {
  updJam(); const el = $('f-transport'); if (!el) return;
  el.innerHTML = `<div class="trow">
      <div class="tbox"><button class="step" data-act="speed" data-v="-10" aria-label="Slower">−</button><span style="min-width:56px;text-align:center;color:${S.speed === 100 ? '#fff' : 'var(--green)'}">${S.speed}%</span><button class="step" data-act="speed" data-v="10" aria-label="Faster">+</button></div>
      <button class="playb" data-act="play" aria-label="${AU.playing ? 'Pause' : 'Play'}">${icon(AU.playing ? 'pause_icon' : 'play_icon', 22)}</button>
      <button class="tbox ${S.loop ? 'act' : ''}" data-act="openLoop">${icon('loop_icon', 15)}${loopLabel()}</button></div>
    <div class="opt"><div style="display:flex;gap:8px"><button class="tog ${S.metro ? 'on' : ''}" data-act="metro">${icon('metronome_icon', 14)}Metronome</button><button class="tog ${S.countIn ? 'on' : ''}" data-act="countIn">Count-in</button></div>
      <div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:rgba(255,255,255,.6)">Key</span>
        <button class="step" data-act="tr" data-v="-1" aria-label="Key down">−</button><span style="min-width:44px;text-align:center;font-size:13px;font-weight:700;color:${S.tr ? 'var(--green)' : '#fff'}">${S.tr ? (S.tr > 0 ? '+' : '') + S.tr + ' · ' + NOTE[keyPc()] : NOTE[keyPc()]}</span><button class="step" data-act="tr" data-v="1" aria-label="Key up">+</button></div></div>
    <div class="hint2">Speed keeps the pitch · Key keeps the speed · works on the real recording${S.speed < 100 || S.tr ? ' · prepared on this device when you press play' : ''}</div>`;
}
function updMixer() {
  const el = $('f-mixer'); if (!el) return; const any = T.stems.some(s => S.ch[s.k].solo), n = T.stems.filter(s => S.ch[s.k].mute).length;
  el.innerHTML = `<button class="fold" data-act="mixToggle">${icon('speaker_icon', 15)}<b>Stems mixer</b><small>${T.stems.length} parts${n ? ' · ' + n + ' muted' : ''}</small><em>${S.mixOpen ? '▾' : '▸'}</em></button>` + (!S.mixOpen ? '' : T.stems.map(s => { const c = S.ch[s.k];
    return `<div class="mx ${(c.mute || (any && !c.solo)) ? 'off' : ''}"><div class="n">${esc(s.name)}<small>${s.k === 'guide' ? 'the artist\'s solo — off by default' : esc(s.src)}</small></div>
      <button class="b m ${c.mute ? 'on' : ''}" data-act="mute" data-v="${s.k}" aria-label="Mute ${esc(s.name)}">M</button><button class="b s ${c.solo ? 'on' : ''}" data-act="solo" data-v="${s.k}" aria-label="Solo ${esc(s.name)}">S</button>
      <input type="range" min="0" max="100" value="${c.vol}" data-vol="${s.k}" aria-label="${esc(s.name)} volume"><div class="v" id="v-${s.k}">${c.mute ? '—' : c.vol + '%'}</div></div>`; }).join('') +
    (!T.official && T.stems.length === 1 ? '<div class="note">One audio file plays as a full mix. Splitting a finished song into parts needs the Litejam server and is not in this prototype.</div>' : ''));
}
function updLicks() {
  const el = $('f-licks'); if (!el) return;
  if (!T.licks.length) { el.innerHTML = T.official ? '' : `<div class="lbl">Guide licks</div><div class="empty">Guide licks, duet and scores come with Official Litejam Tracks. On your own upload you still get chords, scales, loop, speed, key and recording.</div>`; return; }
  const caps = { listen:'The artist plays the lick on every pass. Watch the tab and the LEDs.', copy:'The artist plays, then the same bars come back for you — again and again.', mine:'Backing only. The tab and LEDs still show the notes.' };
  el.innerHTML = `<div class="lbl">Guide licks <small>played by the artist · tab + LED</small></div>` + T.licks.map((l, i) => { const open = S.lick === i, best = (U.best[T.id] || {})[i], fr = l.notes.filter(n => !n.dead).map(lickFret);
    const mb = (m, t) => `<button class="abtn ${m} ${S.lm === m && !S.score ? 'on' : ''}" data-act="lickMode" data-v="${m}">${t}</button>`;
    return `<div class="lk ${open ? 'open' : ''}"><div class="lkh"><span class="num">${i + 1}</span><div class="ri"><div class="tt">${l.name} <small>bars ${l.a + 1}–${l.b}</small></div><div class="mm">${l.chords.join(' · ')} · frets ${Math.min(...fr)}–${Math.max(...fr)} · ${l.level}</div></div>${best ? `<span class="best">★ ${best}</span>` : ''}
      ${open ? `<button class="chip" data-act="lickClose">✕ Done</button>` : `<button class="abtn go sm" data-act="lickOpen" data-v="${i}">▶ Practise</button>`}</div>
      ${open ? `<div class="lkb"><div class="row3">${mb('listen', '👂 Listen')}${mb('copy', '🔁 Copy me')}${mb('mine', '🎸 My turn')}</div><div class="cap">${S.score ? 'Scored run: one pass, backing only, full speed.' : caps[S.lm]}</div>
        <button class="abtn gold ${S.score ? 'on' : ''}" data-act="lickScore">🏆 Play for score${best ? ' · best ' + best : ''}</button></div>` : ''}</div>`; }).join('');
}

/* ================= Jam & Record ================= */
const REC = { on:false, arm:false, started:false, mr:null, chunks:[], stream:null, dest:null, nodes:[], limit:0, meta:null, takes:[], cv:null, vid:null, raf:0, tm:0 };
function recPlan() {
  if (S.jam && S.lick != null) return { label:'Jam with ' + ARTISTS[S.jam.a].name, limit:4, note:'artist, you, artist, you' };
  if (S.lick != null) { const copy = S.lm !== 'mine'; return { label:T.licks[S.lick].name + (copy ? ' · Copy me' : ' · My turn'), limit:copy ? 4 : 2, note:copy ? 'the artist plays the lick, then you answer — 2 rounds' : 'backing only — the lick bars twice' }; }
  if (S.loop) return { label:loopLabel(), limit:2, note:'the loop plays twice' };
  return { label:'Whole track', limit:0, note:'from the top to the end · ' + fmt(T.dur / (S.speed / 100)) };
}
function pickMime(video) { const c = video ? ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']; return c.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || ''; }
async function recStart() {
  if (REC.on || REC.arm) return; if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Recording needs microphone access (Chrome, Safari or Edge).');
  if (AU.ctx && AU.playing) stop(); initCtx(); const tid = T.id; let stream = null, video = S.recVideo;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false }, video: video ? { facingMode:'user' } : false }); }
  catch (e) { if (video) { try { stream = await navigator.mediaDevices.getUserMedia({ audio:true }); video = false; toast('Camera not available — recording audio only.'); } catch (e2) {} } }
  if (!stream) return toast('Microphone access was refused. Allow it in the browser to record.');
  if (S.screen !== 'player' || !T || T.id !== tid) { stream.getTracks().forEach(t => t.stop()); return; }
  if (S.lick != null && S.lm === 'listen') S.lm = 'copy';
  const plan = recPlan(), dest = AU.ctx.createMediaStreamDestination(), mic = AU.ctx.createMediaStreamSource(stream), mg = AU.ctx.createGain(); mg.gain.value = 1.4; mic.connect(mg); mg.connect(dest);
  if (T.official) AU.master.connect(dest);
  const tracks = dest.stream.getAudioTracks().slice(), duet = !!(video && S.duet && T.duet && S.lick != null && S.lm === 'copy'); let cv = null, vid = null;
  if (video) { vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.srcObject = stream; vid.play().catch(() => {}); cv = document.createElement('canvas'); cv.width = 720; cv.height = 1280; tracks.push(cv.captureStream(30).getVideoTracks()[0]); }
  const mime = pickMime(video); let mr; try { mr = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType:mime } : undefined); } catch (e) { stream.getTracks().forEach(t => t.stop()); return toast('This browser cannot record in this format.'); }
  Object.assign(REC, { arm:true, on:false, started:false, mr, chunks:[], stream, dest, nodes:[mic, mg], limit:plan.limit, cv, vid,
    meta:{ tid:T.id, title:T.title, label:plan.label, video, duet, official:T.official, key:NOTE[keyPc()] + T.keySuffix, bpm:Math.round(T.bpm * S.speed / 100), scale:S.fb === 'scale' || S.from === 'scale' ? scaleNow(barAt(getPos())).name : '', t0:0 } });
  mr.ondataavailable = (e) => { if (e.data && e.data.size) REC.chunks.push(e.data); }; mr.onstop = recSaved;
  if (video) { const rb = $('recBox'); rb.innerHTML = '<div class="camwrap"></div>'; rb.firstChild.appendChild(cv); composeLoop(); $('view').scrollTop = 0; }
  updRec(); updLicks(); const from = S.loop ? loopStart() : 0; AU.pausedPos = from; play({ from, count:true });
}
function recBegin(t0) {                       // called by play() once the count-in is scheduled
  REC.arm = false; REC.on = true; clearTimeout(REC.tm);
  REC.tm = setTimeout(() => { if (!REC.on || !REC.mr) return; try { REC.mr.start(); REC.started = true; REC.meta.t0 = Date.now(); } catch (e) {} updRec(); }, Math.max(0, (t0 - AU.ctx.currentTime) * 1000 - 80)); updRec();
}
function recStop() {
  clearTimeout(REC.tm); const mr = REC.mr, started = REC.started; REC.on = false; REC.arm = false;
  if (mr && started && mr.state !== 'inactive') { try { mr.stop(); } catch (e) { recCleanup(true); } } else if (mr) recCleanup(true);
  updRec();
}
function recCleanup(discard) {
  cancelAnimationFrame(REC.raf); if (REC.stream) REC.stream.getTracks().forEach(t => t.stop()); if (REC.dest) { try { AU.master.disconnect(REC.dest); } catch (e) {} } REC.nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
  Object.assign(REC, { mr:null, stream:null, dest:null, nodes:[], vid:null, cv:null, started:false }); const rb = $('recBox'); if (rb) rb.innerHTML = ''; if (discard) toast('Recording cancelled — nothing saved.');
}
function recSaved() {
  const m = REC.meta, type = REC.chunks[0] ? REC.chunks[0].type : '', blob = new Blob(REC.chunks, { type }), dur = (Date.now() - m.t0) / 1000; recCleanup(false);
  if (dur < 1 || !blob.size) return toast('That take was too short to keep.');
  const tk = Object.assign({ id:'K' + Date.now(), url:URL.createObjectURL(blob), blob, type, ext:/mp4/.test(type) ? (m.video ? 'mp4' : 'm4a') : 'webm', dur, when:Date.now(), name:m.title + ' · ' + m.label, posted:false }, m);
  REC.takes.unshift(tk); updRec(); openSheet('take', tk.id);
}
function composeLoop() {                      // the 9:16 picture that is recorded and shared
  const cv = REC.cv; if (!cv) return; const g = cv.getContext('2d'), m = REC.meta, W = 720, top = 200, ph = 860, seg = AU.playing && AU.segs.length ? curSeg() : null;
  g.fillStyle = '#111'; g.fillRect(0, 0, W, 1280); g.textAlign = 'left';
  g.fillStyle = '#ADFE00'; g.font = '700 28px Lato, sans-serif'; g.fillText('LITEJAM', 36, 66); g.fillStyle = '#fff'; g.font = '700 36px Lato, sans-serif'; g.fillText(m.title, 36, 118);
  g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '24px Lato, sans-serif'; g.fillText(m.key + ' · ' + m.bpm + ' BPM · ' + m.label, 36, 158);
  const cam = (x, y, w, h) => { const v = REC.vid; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = '#222'; g.fillRect(x, y, w, h);
    if (v && v.videoWidth) { const sc = Math.max(w / v.videoWidth, h / v.videoHeight), dw = v.videoWidth * sc, dh = v.videoHeight * sc; g.translate(x + w, y); g.scale(-1, 1); g.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh); } g.restore(); };
  if (m.duet) { const on = !!(seg && seg.guide); artistDraw(g, 0, top, 356, ph, on ? 'play' : (seg ? 'cheer' : 'idle'), S.jam ? ARTISTS[S.jam.a].name : 'Artist'); g.textAlign = 'center';
    cam(364, top, 356, ph); g.font = '700 22px Lato, sans-serif'; g.fillStyle = on ? '#ADFE00' : 'rgba(255,255,255,.4)'; g.fillText(on ? 'PLAYING THE LICK' : 'LISTENING', 178, top + 44); g.fillStyle = !on && seg ? '#ADFE00' : 'rgba(255,255,255,.4)'; g.fillText(!on && seg ? 'YOUR TURN' : 'YOU', 542, top + 44); g.textAlign = 'left'; }
  else cam(0, top, W, ph);
  g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '20px Lato, sans-serif'; g.fillText('NOW', 36, top + ph + 52); g.fillStyle = '#ADFE00'; g.font = '700 68px Lato, sans-serif'; g.fillText(T ? chordAt(barAt(getPos())).label : '', 36, top + ph + 122);
  g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '22px Lato, sans-serif'; g.fillText('Jam on Litejam · #Litejam', W - 36, top + ph + 112);
  if (REC.started) { g.fillStyle = '#FF2020'; g.beginPath(); g.arc(W - 120, 58, 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 22px Lato, sans-serif'; g.fillText('REC', W - 36, 66); }
  g.textAlign = 'left'; REC.raf = requestAnimationFrame(composeLoop);
}
function takeRow(tk) { return `<div class="tkrow"><button class="main" data-act="takeOpen" data-v="${tk.id}"><span>${tk.video ? '🎥' : '🎙'}</span><div class="ri"><div class="tt">${esc(tk.label)}${tk.duet ? ' · duet' : ''}</div><div class="mm">${fmt(tk.dur)} · ${esc(tk.key)} · ${tk.bpm} BPM${tk.posted ? ' · posted' : ''}</div></div></button><button class="chip" data-act="takeOpen" data-v="${tk.id}">↗ Share</button></div>`; }
function updRec() {
  updJam(); const el = $('f-rec'); if (!el || !T) return; const p = recPlan(), busy = REC.on || REC.arm, mine = REC.takes.filter(t => t.tid === T.id), duetOk = T.duet && S.lick != null && S.lm !== 'mine';
  el.innerHTML = `<div class="lbl"><span style="color:var(--red)">●</span> Jam & Record <small>record · save · share</small></div>
    <div class="card rc"><div class="opt"><div class="seg"><button class="${S.recVideo ? '' : 'on'}" data-act="recType" data-v="a">🎙 Audio</button><button class="${S.recVideo ? 'on' : ''}" data-act="recType" data-v="v">🎥 Video 9:16</button></div>
        ${T.duet ? `<button class="tog ${S.duet && S.recVideo ? 'on' : ''}" data-act="duet">Duet with artist</button>` : ''}</div>
      <div class="cap">This take: <b>${esc(p.label)}</b> — ${p.note}.${T.duet && S.recVideo && S.duet ? (duetOk ? ' The artist is on the left, you on the right.' : ' <span style="color:var(--yellow)">For the duet, open a lick and choose Copy me.</span>') : ''}</div>
      <button class="abtn rec ${busy ? 'on' : ''}" data-act="rec">${busy ? (REC.started ? '■ Stop & save take' : 'Get ready… tap to cancel') : '● Start recording'}</button>
      ${mine.map(takeRow).join('')}
      <div class="hint2">Use headphones so the microphone hears only your guitar.${T.official ? '' : ' Your own upload is not mixed into the shared file — only your playing.'}</div></div>`;
}

/* ================= Jam hub: artists · my takes · feed ================= */
const ARTISTS = [{ tid:'LJ002', lick:0, name:'Artist A', tag:'Classic Rock duet', sub:'Lick 1 · bars 1–4', n:128 }, { tid:'LJ001', lick:0, name:'Artist B', tag:'Slow Blues call & response', sub:'Lick 1 · bars 1–2', n:86 }, { tid:'LJ005', lick:0, name:'Artist C', tag:'Neo Soul call & response', sub:'Lick 1 · bars 1–3', n:41 }, { tid:'LJ004', lick:0, name:'Artist D', tag:'Funk Groove in D Dorian', sub:'in production', n:0 }];
const FEED = [{ id:'p1', who:'Mint', handle:'@mint.plays', creator:true, ago:'2h', text:'Slow blues turnaround over the official track. A Minor Pentatonic all the way — try it with me.', kind:'bt', tid:'LJ001', chips:['A Blues', '70 BPM', 'A Minor Pentatonic'], dur:'0:45', likes:124, com:18 },
  { id:'p2', who:'Non', handle:'@non.gtr', creator:false, ago:'5h', text:'Duet with the artist on Classic Rock in Em. Second take, still chasing that bend.', kind:'bt', tid:'LJ002', duet:true, chips:['E minor', '110 BPM', 'Duet'], dur:'0:35', likes:57, com:6 },
  { id:'p3', who:'Ploy', handle:'@ployfinger', creator:true, ago:'1d', text:'Fingerstyle arrangement — sharing the tab, LEDs follow every note.', kind:'glow', chips:['GlowTab', 'C major', '72 BPM'], dur:'1:12', likes:210, com:31 },
  { id:'p4', who:'Tee', handle:'@tee.chords', creator:false, ago:'2d', text:'Campfire version of a song from the Songs tab. Chords only, capo 2.', kind:'song', chips:['Song', 'Key C', '81 BPM'], dur:'0:58', likes:33, com:2 }];
function postHTML(p) {
  const liked = U.like[p.id], saved = U.save[p.id], cat = p.tid ? REAL_CAT[p.tid] : (p.kind === 'glow' ? 'Jazz' : 'Pop');
  const media = p.take ? (p.take.video ? `<video class="tkv" src="${p.take.url}" controls playsinline></video>` : `<audio class="tka" src="${p.take.url}" controls></audio>`)
    : `<div class="pmedia" style="background:${SCENE_BG[cat] || '#222'}"><svg viewBox="0 0 300 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${scene(cat, hash(p.id))}</svg><i>▶</i><em>${p.dur}</em>${p.duet ? '<u>DUET</u>' : ''}</div>`;
  const cta = p.kind === 'bt' ? `<button class="cta" data-act="jamTrack" data-v="${p.tid}">🎸 Jam this too</button>` : `<button class="cta alt" data-act="${p.kind === 'glow' ? 'glowStub' : 'songStub'}">▶ Open in ${p.kind === 'glow' ? 'GlowTab' : 'Songs'}</button>`;
  return `<div class="post"><div class="ph2"><span class="av" style="background:hsl(${p.hue != null ? p.hue : hash(p.who) % 360},45%,38%)">${esc(p.who[0].toUpperCase())}</span><div class="ri"><div class="tt">${esc(p.who)}${p.creator ? '<span class="pill g" style="margin-left:6px">CREATOR</span>' : ''}${p.mine ? '<span class="pill b" style="margin-left:6px">YOU</span>' : ''}</div><div class="mm">${esc(p.handle)} · ${p.ago}</div></div></div>
    <div class="ptxt">${esc(p.text)}</div>${media}<div class="chips">${p.chips.map((c, i) => `<span class="chip mini" style="${i < 2 ? 'color:var(--green)' : ''}">${esc(c)}</span>`).join('')}</div>${cta}
    <div class="pf"><button class="${liked ? 'on' : ''}" data-act="like" data-v="${p.id}">${liked ? '♥' : '♡'} ${p.likes + (liked ? 1 : 0)}</button><span>💬 ${p.com}</span><button class="${saved ? 'on' : ''}" data-act="savePost" data-v="${p.id}" style="margin-left:auto">${saved ? '🔖 Saved' : '🔖'}</button></div></div>`;
}
function jamInfo(a) {                         // what one jam is, in plain numbers
  const p = DATA.packs[a.tid], t = DATA.tracks.find(x => x.id === a.tid); if (!p || !MEDIA[a.tid]) return { ok:false, title:t ? t.style : a.tid, t };
  const l = p.licks[a.lick], bars = l.endBar - l.startBar + 1, barLen = p.ticksPerBar / p.ppq * 60 / p.bpm; return { ok:true, title:p.title, bars, sec:Math.round(bars * barLen * 4), level:l.level, bpm:p.bpm, t };
}
function renderJam() {
  const first = ARTISTS.findIndex(a => jamInfo(a).ok), shown = FEED.filter(p => p.kind === 'bt');
  $('view').innerHTML = `<div class="pad">
    <div class="jhero"><div class="jt">Jam = play with an artist,<br>record it, share it.</div>
      <div class="j3"><div><b>1</b><span>Listen</span><small>The artist plays a short phrase</small></div><i>›</i><div><b>2</b><span>Answer</span><small>The same bars come back for you</small></div><i>›</i><div><b>3</b><span>Record</span><small>A short clip you can share</small></div></div>
      <button class="cta" data-act="jamArtist" data-v="${first}">▶ Start your first jam</button><div class="hint2">Takes about 2 minutes · you can practise before you record</div></div>
    ${first >= 0 ? `<button class="jinv" data-act="inviteOpen" data-v="${first}"><canvas id="jthumb" width="162" height="288"></canvas><div class="ri"><div class="k2" style="color:var(--green)">ARTIST INVITE · 20 s VIDEO</div><div class="tt" style="white-space:normal">${esc(ARTISTS[first].name)} invites you to jam</div><div class="mm">${esc(jamInfo(ARTISTS[first]).title)}</div><span class="chip on" style="display:inline-block;margin-top:9px">▶ Watch the invite</span></div></button>` : ''}
    <div class="lbl plain">Pick a jam</div>
    ${ARTISTS.map((a, i) => { const j = jamInfo(a), cat = REAL_CAT[a.tid];
      return `<button class="jcard ${j.ok ? '' : 'soon'}" data-act="jamArtist" data-v="${i}"><span class="jart" style="background:${SCENE_BG[cat]}"><svg viewBox="100 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${scene(cat, hash(a.tid))}</svg><span class="av" style="background:hsl(${i * 110 + 280},45%,38%)">${a.name.slice(-1)}</span></span>
        <div class="ri"><div class="tt">${esc(j.title)}</div><div class="mm">with ${esc(a.name)}${j.ok ? ' · ' + j.bpm + ' BPM · ' + j.level : ''}</div><div class="jflow">${j.ok ? `<span class="ja">Artist ${j.bars} bar${j.bars > 1 ? 's' : ''}</span><i>›</i><span class="jb">You ${j.bars} bar${j.bars > 1 ? 's' : ''}</span><em>clip ≈ ${j.sec} s</em>` : '<em>Coming soon</em>'}</div></div>${j.ok ? '<em class="go">Jam</em>' : ''}</button>`; }).join('')}
    <div class="lbl plain">My jams <small>${REC.takes.length ? REC.takes.length + ' recorded' : ''}</small></div>
    ${REC.takes.length ? REC.takes.map(takeRow).join('') : '<div class="empty">Your recorded jams appear here, ready to share.</div>'}
    <div class="lbl plain">From other players <small>tap to jam the same track</small></div>
    ${shown.map(postHTML).join('')}
    <div class="note">Mock-up: people, posts and counts are placeholders.</div></div>`;
  const th = $('jthumb'); if (th) artistDraw(th.getContext('2d'), 0, 0, th.width, th.height, 'idle', '');
}

/* ================= artist video (mock): a pixel character on a stage stands in for the real clip ================= */
const assetUrl = (n) => (window.LJ_ASSET && window.LJ_ASSET[n]) || 'assets/' + n + '.png';
const SPR = {}; ['art_idle', 'art_play', 'art_power'].forEach(n => { const im = new Image(); im.onload = () => { const c = $('jthumb'); if (c) artistDraw(c.getContext('2d'), 0, 0, c.width, c.height, 'idle', ''); }; im.src = assetUrl(n); SPR[n] = im; });
function artistDraw(g, x, y, w, h, st, label) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); const cx = x + w / 2, fy = y + h * 0.8, gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#1d0b17'); gr.addColorStop(0.62, '#5a1622'); gr.addColorStop(1, '#12070a'); g.fillStyle = gr; g.fillRect(x, y, w, h);
  const sp = g.createRadialGradient(cx, y + h * 0.5, 8, cx, y + h * 0.5, w * 0.85); sp.addColorStop(0, st === 'play' ? 'rgba(255,214,130,.5)' : 'rgba(255,214,130,.24)'); sp.addColorStop(1, 'rgba(255,214,130,0)'); g.fillStyle = sp; g.fillRect(x, y, w, h);
  [0.05, 0.71].forEach(k => { const ax = x + w * k, aw = w * 0.24, ah = h * 0.17; g.fillStyle = '#0d0608'; g.fillRect(ax, fy - ah, aw, ah); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = Math.max(1, w / 180); g.beginPath(); g.arc(ax + aw / 2, fy - ah / 2, aw * 0.3, 0, 7); g.stroke(); });
  g.fillStyle = '#0a0506'; g.fillRect(x, fy, w, y + h - fy); g.fillStyle = 'rgba(255,214,130,.10)'; g.beginPath(); g.ellipse(cx, fy + h * 0.012, w * 0.34, h * 0.022, 0, 0, 7); g.fill();
  const im = SPR[st === 'play' ? 'art_play' : (st === 'cheer' ? 'art_power' : 'art_idle')], f = Math.floor(performance.now() / (st === 'play' ? 90 : 150)) % 8, sz = Math.min(w * 1.0, h * 0.55);
  if (im && im.complete && im.naturalWidth) { g.imageSmoothingEnabled = false; g.drawImage(im, f * 128, 0, 128, 128, cx - sz / 2, fy - sz * 0.95, sz, sz); g.imageSmoothingEnabled = true; }
  if (label) { const fs = Math.max(11, Math.round(w / 17)); g.font = '700 ' + fs + 'px Lato, sans-serif'; g.textAlign = 'left'; const tw = g.measureText(label).width; g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(x + w * 0.04, y + h - fs * 2.5, tw + fs * 1.2, fs * 1.8); g.fillStyle = '#fff'; g.fillText(label, x + w * 0.04 + fs * 0.6, y + h - fs * 1.25);
    g.font = '700 ' + Math.round(fs * 0.62) + 'px Lato, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText('MOCKUP · artist video', x + w * 0.96, y + h - fs * 1.25); }
  g.restore();
}
const INV = { a:0, cv:null, on:false, done:false, fix:null, t0:0, bar:0, n:0, dur:0, nodes:[], out:null, raf:0, tm:0 };
function inviteDraw() {
  const cv = INV.cv; if (!cv) return; const g = cv.getContext('2d'), W = 540, H = 960, a = ARTISTS[INV.a], p = DATA.packs[a.tid], l = p.licks[a.lick], bl = INV.bar, n = INV.n;
  const t = INV.fix != null ? INV.fix : (INV.on ? AU.ctx.currentTime - INV.t0 : (INV.done ? INV.dur : 0)), ph = t >= INV.dur ? 'end' : (t < bl ? 'hi' : (t < bl * (1 + n) ? 'play' : 'you'));
  artistDraw(g, 0, 0, W, H, ph === 'play' ? 'play' : (ph === 'hi' ? 'idle' : 'cheer'), a.name);
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, W, 132); g.textAlign = 'left'; g.fillStyle = '#ADFE00'; g.font = '700 21px Lato, sans-serif'; g.fillText('LITEJAM · JAM INVITE', 28, 44);
  g.fillStyle = '#fff'; g.font = '700 34px Lato, sans-serif'; g.fillText(p.title, 28, 86); g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '20px Lato, sans-serif'; g.fillText(NOTE[p.keyPc] + p.keySuffix + ' · ' + Math.round(p.bpm) + ' BPM', 28, 116);
  const cap = { hi:['Hey! Jam with me', 'on ' + p.title], play:['I play ' + n + ' bars…', 'listen and watch my hands'], you:['…now it is YOUR turn', 'the same ' + n + ' bars, band only'], end:['Ready?', 'Tap “Jam with me”'] }[ph];
  g.fillStyle = ph === 'you' ? '#ADFE00' : '#fff'; g.beginPath(); g.roundRect(28, 156, W - 56, 104, 18); g.fill(); g.beginPath(); g.moveTo(250, 258); g.lineTo(270, 292); g.lineTo(296, 258); g.fill();
  g.fillStyle = '#000'; g.font = '700 32px Lato, sans-serif'; g.fillText(cap[0], 50, 204); g.fillStyle = 'rgba(0,0,0,.65)'; g.font = '21px Lato, sans-serif'; g.fillText(cap[1], 50, 238);
  if (ph === 'you') { g.textAlign = 'center'; g.globalAlpha = 0.75 + 0.25 * Math.sin(performance.now() / 160); g.fillStyle = '#ADFE00'; g.font = '700 54px Lato, sans-serif'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 262, W, 76); g.fillStyle = '#ADFE00'; g.fillText('🎸 YOUR TURN', W / 2, H - 206); g.globalAlpha = 1; g.textAlign = 'left'; }
  const k = ph === 'hi' || ph === 'end' ? -1 : Math.min(n - 1, Math.floor((t - bl) / bl) % n), ch = k < 0 ? '' : p.chords[l.startBar - 1 + k]; if (ch) { g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(W - 150, 300, 122, 96, 14); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '16px Lato, sans-serif'; g.fillText('NOW', W - 132, 326); g.fillStyle = '#ADFE00'; g.font = '700 44px Lato, sans-serif'; g.fillText(ch.sym, W - 132, 376); }
  const bx = 28, by = H - 148, bw = W - 56, parts = [[1, 'Intro', '#777'], [n, 'Artist · ' + n + ' bars', '#50BCFF'], [n, 'You · ' + n + ' bars', '#ADFE00']], tot = 1 + 2 * n; let x = bx;
  parts.forEach(([len, name, col], i) => { const w = bw * len / tot - 6, t0 = bl * (i === 0 ? 0 : (i === 1 ? 1 : 1 + n)), fr = Math.max(0, Math.min(1, (t - t0) / (len * bl)));
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.roundRect(x, by, w, 14, 7); g.fill(); if (fr > 0) { g.fillStyle = col; g.beginPath(); g.roundRect(x, by, Math.max(14, w * fr), 14, 7); g.fill(); }
    g.fillStyle = fr > 0 && fr < 1 ? '#fff' : 'rgba(255,255,255,.6)'; g.font = (fr > 0 && fr < 1 ? '700 ' : '') + '17px Lato, sans-serif'; g.fillText(name, x, by + 40); x += w + 6; });
}
function inviteLoop() { if (!INV.cv) return; inviteDraw(); INV.raf = requestAnimationFrame(inviteLoop); }
function inviteStop() { clearTimeout(INV.tm); INV.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); INV.nodes = []; INV.on = false; }
function invitePlay() {
  inviteStop(); const a = ARTISTS[INV.a], p = DATA.packs[a.tid], l = p.licks[a.lick], bufs = AU.cache[a.tid], bl = INV.bar, n = INV.n, ls = (l.startBar - 1) * bl, intro = ls - bl >= 0 ? ls - bl : (p.bars - 1) * bl, now = AU.ctx.currentTime + 0.12;
  if (!INV.out) { INV.out = AU.ctx.createGain(); INV.out.connect(AU.master); }
  const sch = (buf, when, off, dur) => { if (!buf) return; const src = AU.ctx.createBufferSource(), g = AU.ctx.createGain(); src.buffer = buf; g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.85, when + 0.01); g.gain.setValueAtTime(0.85, when + dur - 0.02); g.gain.linearRampToValueAtTime(0, when + dur); src.connect(g); g.connect(INV.out); src.start(when, off, dur + 0.01); INV.nodes.push(src); };
  p.channels.forEach(c => { if (c[0] === 'guide') return sch(bufs.guide, now + bl, ls, n * bl); sch(bufs[c[0]], now, intro, bl); sch(bufs[c[0]], now + bl, ls, n * bl); sch(bufs[c[0]], now + bl * (1 + n), ls, n * bl); });
  INV.t0 = now; INV.on = true; INV.done = false; INV.tm = setTimeout(() => { INV.on = false; INV.done = true; }, (INV.dur + 0.15) * 1000);
}
async function inviteOpen(i, opt) {
  opt = opt || {}; const a = ARTISTS[i]; if (!a || !jamInfo(a).ok) return toast('This invite is coming soon.'); if (AU.ctx && AU.playing) stop(); pvStop(); inviteStop();
  let el = $('invOvl'); if (!el) { el = document.createElement('div'); el.id = 'invOvl'; $('phone').appendChild(el); }
  el.innerHTML = `<canvas id="invCv" width="540" height="960"></canvas><div class="invbtn"><button class="cta" data-act="inviteJam">🎸 Jam with me</button><div class="row2b"><button class="abtn" data-act="inviteReplay">↻ Watch again</button><button class="abtn" data-act="inviteClose">✕ Close</button></div></div>`; el.classList.add('show');
  const p = DATA.packs[a.tid], l = p.licks[a.lick]; Object.assign(INV, { a:i, cv:$('invCv'), bar:p.ticksPerBar / p.ppq * 60 / p.bpm, n:l.endBar - l.startBar + 1, on:false, done:false, fix:opt.fix == null ? null : opt.fix }); INV.dur = INV.bar * (1 + 2 * INV.n);
  if (typeof INV.fix === 'string') INV.fix = { hi:0.5, play:1.6, you:1 + INV.n + 0.6, end:99 }[INV.fix] * INV.bar; cancelAnimationFrame(INV.raf); inviteLoop(); if (INV.fix != null) return;
  initCtx(); AU.ctx.resume(); try { if (!AU.cache[a.tid]) { const bufs = {}, t = officialTrack(a.tid); for (const st of t.stems) bufs[st.k] = await decodeUri(MEDIA[a.tid][st.k]); AU.cache[a.tid] = bufs; } } catch (e) { return toast('Could not load the invite.'); }
  if (INV.cv && INV.a === i) invitePlay();
}
function inviteClose() { inviteStop(); cancelAnimationFrame(INV.raf); INV.cv = null; const el = $('invOvl'); if (el) { el.classList.remove('show'); el.innerHTML = ''; } }
async function inviteRecord(i) {                // dev helper: the invite as a video file (canvas + audio)
  await inviteOpen(i || 0); const dest = AU.ctx.createMediaStreamDestination(); INV.out.connect(dest); const st = new MediaStream([INV.cv.captureStream(30).getVideoTracks()[0], dest.stream.getAudioTracks()[0]]), mime = pickMime(true), mr = new MediaRecorder(st, mime ? { mimeType:mime, videoBitsPerSecond:2500000 } : undefined), ch = [];
  mr.ondataavailable = (e) => { if (e.data.size) ch.push(e.data); }; inviteStop(); mr.start(); invitePlay(); await new Promise(r => setTimeout(r, (INV.dur + 1.6) * 1000)); await new Promise(r => { mr.onstop = r; mr.stop(); }); try { INV.out.disconnect(dest); } catch (e) {} return new Blob(ch, { type:ch[0] ? ch[0].type : mime });
}

/* ================= Jam session: one lick, three steps (Listen → Try it → Record) ================= */
const JSTEP = [['Listen', 'Listen first', 'The artist plays the phrase on a loop. Watch the tab: green is the note being played, yellow is the next one.'],
  ['Try it', 'Now answer the artist', 'The artist plays, then the same bars come back with the band only — that is your turn. It keeps going round until you stop.'],
  ['Record', 'Record your jam', 'Two rounds are recorded: artist, you, artist, you. It stops by itself and you get a clip to share.']];
function renderJamSession() {
  const a = ARTISTS[S.jam.a], st = S.jam.step;
  $('view').innerHTML = `<div class="pad jam" id="player">
    <div class="hd"><button class="back" data-act="back">‹</button><div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Jam with ${esc(a.name)}</div><div style="font-size:11px;color:rgba(255,255,255,.5)">${esc(T.title)} · ${NOTE[keyPc()]}${T.keySuffix} · ${Math.round(T.bpm)} BPM</div></div></div>
    <div class="jsteps">${JSTEP.map((x, i) => `<button class="jst ${st === i + 1 ? 'on' : (st > i + 1 ? 'done' : '')}" data-act="jamStep" data-v="${i + 1}"><b>${st > i + 1 ? '✓' : i + 1}</b>${x[0]}</button>`).join('<i></i>')}</div>
    <div id="recBox"></div>
    <div id="jhow"></div>
    <div class="now" id="nowbar"></div><div id="turn"></div>
    <div class="fbbar" id="fbbar" style="display:none"></div><div id="fbBox"></div><div id="tabBox"></div><div id="legend" class="legend"></div>
    <div id="jctl" class="sec"></div>
    <button class="linkrow" data-act="jamFull"><span>🎛</span><div><b>Open the full player</b><small>Mixer, loop, key, the other licks, scores</small></div><em>›</em></button>
  </div>`;
  updFretboard(true); updTab(); updJam(); frame(true);
}
function updJam() {
  const how = $('jhow'), ctl = $('jctl'); if (!how || !ctl || !S.jam || !T) return; const a = ARTISTS[S.jam.a], l = T.licks[a.lick], st = S.jam.step, n = l.b - l.a, bw = n + ' bar' + (n > 1 ? 's' : ''), x = JSTEP[st - 1];
  const busy = REC.on || REC.arm, sec = Math.round(n * T.barLen * 4 / (S.speed / 100)), mine = REC.takes.filter(t => t.tid === T.id);
  const who = st === 1 ? `<span class="ja">🎸 Artist plays · ${bw}</span><i>↻</i>` : `<span class="ja">🎸 Artist plays · ${bw}</span><i>›</i><span class="jb">🙋 You answer · ${bw}</span><i>${st === 3 ? '×2' : '↻'}</i>`;
  how.innerHTML = `<div class="jtitle">${x[1]}</div><div class="cap">${x[2]}</div><div class="jwho" id="jwho" data-t="${LAST.turn.split(' ')[0]}">${who}</div>`;
  const speed = `<div class="opt"><span style="font-size:12.5px;color:rgba(255,255,255,.7)">Speed</span><div class="seg"><button class="${S.speed === 70 ? 'on' : ''}" data-act="jamSpeed" data-v="70">🐢 Slow</button><button class="${S.speed === 100 ? 'on' : ''}" data-act="jamSpeed" data-v="100">Normal</button></div></div>`;
  if (st < 3) ctl.innerHTML = `${st === 2 ? speed : ''}<button class="abtn big ${AU.playing ? 'stop' : 'go'}" data-act="jamPlay">${AU.playing ? '■ Stop' : (st === 1 ? '▶ Listen' : '▶ Play along')}</button>
      <button class="abtn next" data-act="jamStep" data-v="${st + 1}">${st === 1 ? 'Next: try it yourself ›' : 'I am ready — record ›'}</button>`;
  else ctl.innerHTML = busy ? `<button class="abtn rec on" data-act="rec">${REC.started ? '■ Stop & save' : 'Get ready… tap to cancel'}</button>`
    : `${speed}<div class="row2"><button class="abtn rec" data-act="jamRec" data-v="v">🎥 Record video</button><button class="abtn recA" data-act="jamRec" data-v="a">🎙 Audio only</button></div>
       <div class="hint2">Clip ≈ ${sec} s · counts you in first · use headphones so the mic hears only your guitar${T.duet ? ' · video shows the artist beside you' : ''}</div>
       ${mine.length ? `<div class="lbl plain" style="margin-top:4px">Your jams on this track</div>` + mine.map(takeRow).join('') : ''}`;
}

/* ================= sheets added by Play Mode ================= */
function sheetExtra() {
  if (S.sheet === 'result') { const c = S.ctx, stars = c.v >= 90 ? 3 : (c.v >= 78 ? 2 : 1);
    return `<h3>${T.licks[c.lick].name} · score <button data-act="closeSheet">✕</button></h3><div class="resbig"><b>${c.v}</b><span>${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span><small>${c.isBest ? (c.old ? 'New best · was ' + c.old : 'First score on this lick') : 'Your best is ' + c.old}</small></div>
      <p>Prototype: the number is a stand-in. The real score needs note detection from the guitar. Only your best per lick is kept — no XP, no leaderboard, one score at full speed.</p>
      <button class="cta" data-act="lickScore">🏆 Try again</button><button class="cta alt" data-act="closeSheet">Done</button>`; }
  const media = (tk) => tk.video ? `<video class="tkv" src="${tk.url}" controls playsinline></video>` : `<audio class="tka" src="${tk.url}" controls></audio>`;
  const pav = (pr, sz) => `<span class="av" style="background:hsl(${pr.hue},50%,40%);${sz ? 'width:' + sz + 'px;height:' + sz + 'px' : ''}">${esc((pr.name || '?')[0].toUpperCase())}</span>`;
  if (S.sheet === 'take') { const tk = REC.takes.find(t => t.id === S.ctx); if (!tk) return '<h3>Jam <button data-act="closeSheet">✕</button></h3><p>This jam is gone.</p>';
    return `<h3>Your jam is ready 🎉 <button data-act="closeSheet">✕</button></h3><p>${esc(tk.name)} · ${fmt(tk.dur)}</p>${media(tk)}
      ${tk.posted ? `<button class="cta alt" data-act="postSee">✓ Posted — see it in Jam</button>` : `<button class="cta" data-act="takePost" data-v="${tk.id}">⬆ Post to Jam</button>`}
      <button class="cta alt" data-act="takeShare" data-v="${tk.id}">↗ Share to TikTok, Reels, LINE…</button>
      <div class="lrow"><a href="${tk.url}" download="litejam-${tk.tid}-${tk.id}.${tk.ext}">⬇ Save file</a><button data-act="takeDel" data-v="${tk.id}">🗑 Delete</button></div>
      <p><b style="color:#fff">Post to Jam</b> = other Litejam players see it and can jam the same track. <b style="color:#fff">Share</b> = send the file to another app.${tk.official ? '' : ' Your own upload cannot be posted, and the file holds only your playing.'}${tk.video ? '' : ' TikTok, Reels and Shorts need a video.'}</p>`; }
  if (S.sheet === 'profile') { const c = S.ctx;
    return `<h3>Who is posting? <button data-act="closeSheet">✕</button></h3><p>Only needed once, and only for posting. Playing, recording and sharing to other apps work without it.</p>
      <div class="flbl">Name shown on your posts</div><input class="inp" id="pfName" maxlength="24" placeholder="Your name" value="${esc(c.name || '')}">
      <div class="flbl">Colour</div><div class="pfrow">${[95, 200, 280, 20, 330].map(h => `<button class="pfc ${c.hue === h ? 'on' : ''}" data-act="pfHue" data-v="${h}" style="background:hsl(${h},50%,40%)" aria-label="Colour"></button>`).join('')}</div>
      <button class="cta" data-act="pfSave">Continue</button><p>In the app this step is the normal Litejam sign-in (Google, phone, LINE…). A guest is asked here, at the first post — not before.</p>`; }
  if (S.sheet === 'compose') { const tk = REC.takes.find(t => t.id === S.ctx), pr = U.profile; if (!tk) return '';
    return `<h3>Post to Jam <button data-act="closeSheet">✕</button></h3><p>This is what other players will see.</p>
      <div class="post" style="background:var(--panel)"><div class="ph2">${pav(pr)}<div class="ri"><div class="tt">${esc(pr.name)}</div><div class="mm">now · <button class="lnk" data-act="pfEdit">change name</button></div></div></div>
        <input class="inp" id="shCap" value="${esc('Jamming on ' + tk.title + ' 🎸')}" aria-label="Caption">${media(tk)}
        <div class="chips"><span class="chip mini" style="color:var(--green)">${esc(tk.key)}</span><span class="chip mini" style="color:var(--green)">${tk.bpm} BPM</span><span class="chip mini">${esc(tk.title)}</span><span class="mm2" style="align-self:center">added for you</span></div></div>
      <button class="cta" data-act="postNow" data-v="${tk.id}">Post now</button><p>Others get a “Jam this too” button that opens the same track with the artist.</p>`; }
  if (S.sheet === 'posted') { const tk = REC.takes.find(t => t.id === S.ctx);
    return `<h3>Posted ✓ <button data-act="closeSheet">✕</button></h3><div class="resbig"><b style="font-size:54px">🎉</b><small style="font-size:14px;color:#fff">Your jam is in the Jam feed</small><small>Mock-up — nothing left this device.</small></div>
      <button class="cta" data-act="postSee">See my post</button>${tk ? `<button class="cta alt" data-act="takeShare" data-v="${tk.id}">↗ Share it outside too</button>` : ''}`; }
  if (S.sheet === 'scaleLink') { const sc = scaleNow(barAt(getPos()));
    return `<h3>Play ⇄ Scale mode <button data-act="closeSheet">✕</button></h3><p>One track library and one player, two doors.</p>
      <div class="ropt"><div><div class="rt" style="color:var(--green)">Play › Backing Track (you are here)</div><div class="rd">Play the track like a song: chords first, mixer, speed, key, licks, record and share.</div></div></div>
      <div class="ropt"><div><div class="rt">Scale mode</div><div class="rd">Learn ${esc(sc.name)}: forms, Practice, Challenge, XP. Its “Jam with this scale” card opens this same player with the scale, key and position kept — Scale mode has no player of its own.</div></div></div>
      <button class="cta" data-act="toScale">Go to Scale mode · ${esc(sc.name)} ›</button>`; }
  if (S.sheet === 'post') { return `<h3>Post to Jam <button data-act="closeSheet">✕</button></h3><p>Pick one of your takes.</p>${REC.takes.length ? REC.takes.map(tk => `<div class="tkrow"><button class="main" data-act="takePost" data-v="${tk.id}"><span>${tk.video ? '🎥' : '🎙'}</span><div class="ri"><div class="tt">${esc(tk.name)}</div><div class="mm">${fmt(tk.dur)}${tk.posted ? ' · already posted' : ''}</div></div></button></div>`).join('') : '<div class="empty">You have no takes yet. Record one from any backing track first.</div><button class="cta" data-act="tab" data-v="bt">Browse backing tracks</button>'}`; }
  return '';
}

/* ================= frame loop ================= */
const LAST = { bar:-1, beat:-1, lk:'', turn:'' };
function frame(force) {
  if (S.screen !== 'player' || !$('player') || !T) return;
  const pos = getPos(), bar = syncHalf(), slot = bar * 2 + HALF.h, beat = mod(Math.floor((pos - T.off) / beatLen() + 1e-6), T.bpb);
  if (slot !== LAST.bar || force) { LAST.bar = slot; updNow(bar);
    document.querySelectorAll('#tl .bar').forEach(b => b.classList.toggle('cur', +b.dataset.b === bar));
    if (S.fb === 'chord' || (S.fb === 'scale' && (S.follow || S.targets))) updFretboard(false);
    const tl = $('tl'); if (tl && AU.playing) tl.scrollLeft = Math.max(0, bar * BARP - 130); }
  if (beat !== LAST.beat) { LAST.beat = beat; const bs = $('beats'); if (bs) [...bs.children].forEach((d, i) => { d.className = (AU.playing && i === beat) ? ('on' + (i === 0 ? ' acc' : '')) : ''; }); }
  const ph = $('tlPh'); if (ph) ph.style.left = (2 + Math.max(0, (pos - T.off) / T.barLen) * BARP - 1) + 'px';
  const tlb = $('timeLbl'); if (tlb) tlb.textContent = fmt(pos) + ' / ' + fmt(T.dur) + ' · bar ' + (bar + 1);
  const counting = AU.playing && AU.countUntil && AU.ctx.currentTime < AU.countUntil, co = $('countOvl');
  if (counting) { co.classList.add('show'); $('countLbl').textContent = (REC.on ? 'Recording starts in · ' : 'Count-in · ') + T.timeSig; $('countNum').textContent = Math.min(T.bpb, Math.floor((AU.ctx.currentTime - AU.countStart) / AU.countBeat) + 1); } else co.classList.remove('show');
  if (S.lick != null) { const l = T.licks[S.lick], a = barStart(l.a), len = (l.b - l.a) * T.barLen, tp = $('tabPh');
    if (tp) { const x = 14 + Math.max(0, Math.min(1, (pos - a) / len)) * (l.b - l.a) * 170; tp.style.left = x + 'px'; const sc = $('tabScroll'); if (sc && AU.playing) sc.scrollLeft = Math.max(0, x - 150); }
    const on = [], keys = new Set(); let nx = -1; l.notes.forEach((n, j) => { if (pos >= n.t - 0.02 && pos < n.t + n.d) { on.push(j); if (!n.dead) keys.add(n.s + '-' + lickFret(n)); } else if (nx < 0 && n.t > pos) nx = j; });
    const nk = nx >= 0 && !l.notes[nx].dead ? l.notes[nx].s + '-' + lickFret(l.notes[nx]) : null, sig = on.join(',') + '|' + nx;
    if (sig !== LAST.lk) { LAST.lk = sig; FB.on = keys; FB.nx = nk;
      document.querySelectorAll('#tabBox b').forEach(b => { const j = +b.dataset.j; b.className = on.includes(j) ? 'on' : (j === nx ? 'nx' : ''); });
      if (S.fb === 'lick') { document.querySelectorAll('#fbBox .dot.lk').forEach(d => { const k = d.dataset.k; d.classList.toggle('on', keys.has(k)); d.classList.toggle('nx', !keys.has(k) && k === nk); }); ledSync(); } } }
  const tn = $('turn'); if (tn) { let t = ''; if (S.lick != null && AU.playing) { const seg = curSeg(); t = counting ? 'ready' : (S.score ? 'score' : (seg && seg.guide ? 'listen' : 'you')); } if (REC.started) t += ' rec';
    if (t !== LAST.turn) { LAST.turn = t; const m = { ready:['GET READY', 'y'], score:['🏆 SCORED RUN · YOUR TURN', 'gold'], listen:['👂 LISTEN — the artist is playing', 'b'], you:['🎸 YOUR TURN', 'g'] }[t.split(' ')[0]];
      tn.innerHTML = (m ? `<span class="turn ${m[1]}">${m[0]}</span>` : '') + (REC.started ? '<span class="turn r">● REC</span>' : ''); const jh = $('jwho'); if (jh) jh.dataset.t = t.split(' ')[0]; } }
}
function loop() { frame(false); requestAnimationFrame(loop); }
requestAnimationFrame(loop); setInterval(() => frame(false), 120);

/* ================= actions ================= */
function setLoop(kind, a, b) { S.loopKind = kind; S.loop = kind ? { a, b } : null; updTimeline(); updTransport(); updRec(); if (AU.playing) restart(kind ? loopStart() : getPos()); else if (kind) AU.pausedPos = loopStart(); frame(true); }
function retime() { const p = getPos(); updHeader(); updFretboard(false); updTab(); updTimeline(); updTransport(); updLicks(); updRec(); if (AU.playing) restart(p); }
function goPage(page, tab) { if (AU.ctx && AU.playing) stop(); pvStop(); S.screen = 'library'; S.page = page; if (tab) S.tab = tab; closeSheet(); renderView(); renderNotes(); $('view').scrollTop = 0; }
const ACT = {
  tab: (d) => goPage('play', d.v),
  nav: (d) => { if (d.v === 'jam') return goPage('jam'); if (d.v === 'play') return goPage('play', S.tab === 'jam' && S.nav === 'figma' ? 'bt' : S.tab); goPage(d.v); },
  navMode: (d) => { S.nav = d.v; if (S.nav === 'figma' && S.tab === 'jam') { S.tab = 'bt'; if (S.screen !== 'player') S.page = 'jam'; } if (S.nav === 'app' && S.page === 'jam') { S.page = 'play'; S.tab = 'jam'; } renderView(); renderNotes(); },
  songStub: () => toast('The Songs player (chords from YouTube) is unchanged — not part of this prototype.'), glowStub: () => toast('GlowTab is in development in its own project.'),
  gameLink: () => { closeSheet(); toast('Game › Play with Track: stage, coach, leaderboard — the Game Version prototype.'); },
  pick: () => $('filePick').click(),
  libStyle: (d) => { S.lf.style = d.v; S.lfKeep = true; renderLibrary(); }, libFav: () => { S.lf.fav = !S.lf.fav; S.lfKeep = true; renderLibrary(); },
  libClear: () => { S.lf = { style:'All', fav:false }; S.q = ''; S.lfKeep = true; renderLibrary(); },
  fav: (d) => { if (U.fav[d.v]) delete U.fav[d.v]; else U.fav[d.v] = 1; saveU(); const b = $('favBtn'); if (b) { b.classList.toggle('on', !!U.fav[d.v]); b.textContent = U.fav[d.v] ? '♥' : '♡'; } relist(); },
  preview: (d) => preview(d.v),
  openOfficial: (d) => { const t = DATA.tracks.find(x => x.id === d.v); if (!isReady(t)) return toast(DELIVERED[d.v] ? d.v + ' has been delivered by the producer and is in QA.' : d.v + ' is in production. Blues, Classic Rock, Modern Pop and Neo Soul are ready.'); openTrack(officialTrack(d.v)); },
  fromScale: (d) => { openTrack(officialTrack(d.v), { fb:'scale', pos:S.sc.pos, from:'scale', tr:+d.tr || 0, scType:S.sc.type }); },
  fromScaleRec: (d) => { ACT.fromScale(d); S.recVideo = true; updRec(); setTimeout(() => { const el = $('f-rec'); if (el) $('view').scrollTop = el.offsetTop - 56; }, 60); toast('Your scale is on the fretboard. Tap ● Start recording, then Post to Jam.'); },
  scKey: (d) => { S.sc.root = +d.v; S.lfKeep = true; renderScaleStub(); }, scKind: (d) => { S.sc.type = d.v; S.lfKeep = true; renderScaleStub(); }, scPos: (d) => { S.sc.pos = d.v; S.lfKeep = true; renderScaleStub(); },
  scStub: () => toast('Practice and Challenge are the existing Scale mode — unchanged.'),
  toScale: () => { const sc = scaleNow(barAt(getPos())); S.sc = { root:sc.root, type:sc.type, pos:S.pos }; goPage('scale'); },
  openUpload: (d) => { const u = UPL.find(x => x.id === d.v); if (u) openTrack(uploadTrack(u)); },
  delUpload: (d) => { const u = UPL.find(x => x.id === d.v); if (!u) return; if (!window.confirm('Delete “' + u.title + '” from this device?')) return; UPL = UPL.filter(x => x.id !== d.v); DB.del(d.v); delete AU.cache[d.v]; renderLibrary(); },
  back: () => { const r = S.ret || { page:'play', tab:'bt' }; goPage(r.page, r.tab); },
  fb: (d) => { S.fb = d.v; updFretboard(true); },
  openScale: () => openSheet('scale'), openLoop: () => openSheet('loop'), scaleLink: () => openSheet('scaleLink'),
  closeSheet: (d, e, el) => { if (el.id === 'sheetbg' && e.target !== el) return; closeSheet(); $('sheet').innerHTML = ''; },
  scale: (d) => { if (d.v === 'follow') S.follow = true; else { S.follow = false; S.scType = d.v; S.scRoot = null; } S.fb = 'scale'; renderSheet(); updFretboard(true); },
  scRoot: (d) => { S.follow = false; S.scRoot = +d.v === T.keyPc ? null : +d.v; S.fb = 'scale'; renderSheet(); updFretboard(true); },
  scType: (d) => { S.follow = false; S.scType = d.v; S.fb = 'scale'; renderSheet(); updFretboard(true); },
  pos: (d) => { S.pos = d.v; renderSheet(); updFretboard(true); }, labels: (d) => { S.labels = d.v; renderSheet(); updFretboard(false); },
  targets: () => { S.targets = !S.targets; renderSheet(); updFretboard(false); },
  seek: (d) => { const b = +d.v, t = b === 0 ? 0 : barStart(b); if (S.loop && (b < S.loop.a || b >= S.loop.b)) { lickOff(); S.loopKind = null; S.loop = null; updTimeline(); updTransport(); updRec(); } AU.pausedPos = t; restart(t); },
  play: () => { if (AU.playing) stop(); else play(); },
  metro: () => { S.metro = !S.metro; updTransport(); }, countIn: () => { S.countIn = !S.countIn; updTransport(); },
  speed: (d) => { const v = Math.max(50, Math.min(100, S.speed + +d.v)); if (v === S.speed) return toast(v === 100 ? 'Full speed is the original recording.' : '50% is the slowest speed.'); const p = getPos(); S.speed = v; updHeader(); updTransport(); updRec(); if (AU.playing) restart(p); else AU.pausedPos = p; },
  tr: (d) => { const v = Math.max(-6, Math.min(6, S.tr + +d.v)); if (v === S.tr) return; S.tr = v; retime(); },
  loopSet: (d) => { lickOff(); if (d.v === 'off') setLoop(null); else if (d.v === 'def') setLoop('def', T.loopDef.a, T.loopDef.b); else if (d.v === 'all') setLoop('all', 0, T.bars); else { const c = barAt(getPos()); setLoop('ab', c, Math.min(T.bars, c + 4)); } closeSheet(); },
  ab: (d) => { const b = +d.v; if (S.abA == null) { S.abA = b; renderSheet(); } else { const a = Math.min(S.abA, b), z = Math.max(S.abA, b); S.abA = null; lickOff(); setLoop('ab', a, z + 1); closeSheet(); } },
  mixToggle: () => { S.mixOpen = !S.mixOpen; updMixer(); },
  mute: (d) => { S.ch[d.v].mute = !S.ch[d.v].mute; applyMix(); updMixer(); }, solo: (d) => { S.ch[d.v].solo = !S.ch[d.v].solo; applyMix(); updMixer(); },
  lickOpen: (d) => lickStart(+d.v, 'listen'),
  lickMode: (d) => lickStart(S.lick, d.v),
  lickClose: () => { if (AU.playing) stop(); lickOff(); setLoop(null); },
  lickScore: () => { if (S.lick == null) return; closeSheet(); if (S.speed !== 100 || S.tr) { S.speed = 100; S.tr = 0; updHeader(); toast('Scores count at full speed in the original key.'); } lickStart(S.lick, 'mine', { score:true }); },
  recType: (d) => { if (REC.on || REC.arm) return; S.recVideo = d.v === 'v'; updRec(); }, duet: () => { if (REC.on || REC.arm) return; if (!S.recVideo) { S.recVideo = true; S.duet = true; } else S.duet = !S.duet; updRec(); },
  rec: () => { if (REC.on || REC.arm) { if (AU.playing) stop(); else recStop(); } else recStart(); },
  takeOpen: (d) => { if (AU.ctx && AU.playing) stop(); openSheet('take', d.v); },
  takeShare: async (d) => { const tk = REC.takes.find(t => t.id === d.v); if (!tk) return; const cap = ($('shCap') || {}).value || '', file = new File([tk.blob], 'litejam-' + tk.tid + '.' + tk.ext, { type:tk.type });
    if (navigator.canShare && navigator.canShare({ files:[file] })) { try { await navigator.share({ files:[file], text:cap, title:'Litejam jam' }); } catch (e) {} } else { try { await navigator.clipboard.writeText(cap); } catch (e) {} toast('This browser cannot hand a file to other apps. Caption copied — use Save file, then upload it.'); } },
  takePost: (d) => { const tk = REC.takes.find(t => t.id === d.v); if (!tk) return; if (!tk.official) return toast('Jams on your own uploads stay on this device — the track is not ours to publish.'); if (tk.posted) return ACT.postSee();
    if (!U.profile) return openSheet('profile', { name:'', hue:95, next:tk.id }); openSheet('compose', tk.id); },
  pfHue: (d) => { S.ctx.name = ($('pfName') || {}).value || ''; S.ctx.hue = +d.v; renderSheet(); },
  pfEdit: () => openSheet('profile', { name:U.profile.name, hue:U.profile.hue, next:S.ctx }),
  pfSave: () => { const name = (($('pfName') || {}).value || '').trim(); if (!name) return toast('Type the name to show on your posts.'); U.profile = { name, hue:S.ctx.hue }; saveU(); const next = S.ctx.next; if (next) openSheet('compose', next); else closeSheet(); },
  postNow: (d) => { const tk = REC.takes.find(t => t.id === d.v), pr = U.profile; if (!tk || !pr) return; tk.posted = true; const t = DATA.tracks.find(x => x.id === tk.tid);
    FEED.unshift({ id:'m' + tk.id, who:pr.name, handle:'@' + pr.name.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, ''), hue:pr.hue, mine:true, ago:'now', text:($('shCap') || {}).value || 'New jam on ' + tk.title, kind:'bt', tid:tk.tid, take:tk, duet:tk.duet, chips:[tk.key, tk.bpm + ' BPM', tk.scale || (t ? t.scale.split(' / ')[0] : tk.label)], likes:0, com:0 });
    if (S.screen === 'player') updRec(); openSheet('posted', tk.id); },
  postSee: () => { closeSheet(); $('sheet').innerHTML = ''; goPage(S.nav === 'figma' ? 'jam' : 'play', 'jam'); setTimeout(() => { const el = document.querySelector('#view .post'); if (el) $('view').scrollTop = el.offsetTop - 70; }, 60); },
  inviteOpen: (d) => inviteOpen(+d.v), inviteReplay: () => { if (AU.cache[ARTISTS[INV.a].tid]) invitePlay(); }, inviteClose: () => inviteClose(), inviteJam: () => { const i = INV.a; inviteClose(); ACT.jamArtist({ v:i }); },
  takeDel: (d) => { const tk = REC.takes.find(t => t.id === d.v); if (!tk || !window.confirm('Delete this take?')) return; REC.takes = REC.takes.filter(t => t.id !== d.v); const i = FEED.findIndex(p => p.take === tk); if (i >= 0) FEED.splice(i, 1); URL.revokeObjectURL(tk.url); closeSheet(); $('sheet').innerHTML = ''; if (S.screen === 'player') updRec(); else renderView(); },
  jamPost: () => openSheet('post'),
  jamArtist: (d) => { const a = ARTISTS[+d.v]; if (!a || !jamInfo(a).ok) return toast('This jam is coming soon.'); openTrack(officialTrack(a.tid), { jam:{ a:+d.v, step:1 } }); S.recVideo = true; S.duet = true; lickStart(a.lick, 'listen', { hold:true }); },
  jamTrack: (d) => { const i = ARTISTS.findIndex(a => a.tid === d.v); if (i >= 0) ACT.jamArtist({ v:i }); else ACT.openOfficial(d); },
  jamStep: (d) => { if (!S.jam) return; if (AU.ctx && AU.playing) stop(); else if (REC.on || REC.arm) recStop(); S.jam.step = Math.max(1, Math.min(3, +d.v)); lickStart(ARTISTS[S.jam.a].lick, S.jam.step === 1 ? 'listen' : 'copy', { hold:true }); renderJamSession(); $('view').scrollTop = 0; },
  jamPlay: () => { if (!S.jam) return; if (AU.playing) stop(); else lickStart(ARTISTS[S.jam.a].lick, S.jam.step === 1 ? 'listen' : 'copy'); },
  jamSpeed: (d) => { const p = getPos(); S.speed = +d.v; updJam(); if (AU.playing) restart(p); else AU.pausedPos = p; },
  jamRec: (d) => { if (!S.jam) return; S.recVideo = d.v === 'v'; S.duet = true; S.lm = 'copy'; recStart(); },
  jamFull: () => { if (AU.ctx && AU.playing) stop(); S.jam = null; renderView(); $('view').scrollTop = 0; },
  like: (d) => { U.like[d.v] = !U.like[d.v]; saveU(); const k = $('view').scrollTop; renderJam(); $('view').scrollTop = k; }, savePost: (d) => { U.save[d.v] = !U.save[d.v]; saveU(); const k = $('view').scrollTop; renderJam(); $('view').scrollTop = k; },
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
document.addEventListener('input', (e) => { if (e.target.id === 'q') { S.q = e.target.value; relist(); return; } const k = e.target.dataset && e.target.dataset.vol; if (!k) return; S.ch[k].vol = +e.target.value; applyMix(); const v = $('v-' + k); if (v) v.textContent = S.ch[k].mute ? '—' : S.ch[k].vol + '%'; });
$('filePick').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f); });
const onLib = () => S.screen === 'library' && S.page === 'play' && S.tab === 'bt';
document.addEventListener('dragover', (e) => { if (onLib()) { e.preventDefault(); const d = $('drop'); if (d) d.classList.add('over'); } });
document.addEventListener('dragleave', () => { const d = $('drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', (e) => { if (!onLib()) return; e.preventDefault(); const d = $('drop'); if (d) d.classList.remove('over'); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

/* ================= notes (Thai) ================= */
const FEAT = [
  ['P1', 'Segment ใหม่ใน Play: Songs · Backing Track · GlowTab', 'Backing Track วางเป็น segment ที่สองของ Play ต่อจาก Songs (คอร์ดจาก YouTube) และก่อน GlowTab ใช้หัวหน้าจอ ช่องค้นหา ชิปตัวกรอง และแถวรายการแบบเดียวกับ Songs เพื่อให้ผู้ใช้เดิมไม่ต้องเรียนรู้ใหม่ ต่างกันที่แต่ละแถวมีปุ่ม ▶ ฟังตัวอย่าง 15 วินาที และป้ายบอกสิ่งที่แทร็กมี (Stems · licks · Duet)', 'lib', 'ดูรายการแทร็ก'],
  ['P2', 'Player แบบ “เล่นเพลง”: คอร์ดมาก่อน', 'เปิดมาเห็น NOW / NEXT และ Chord timeline ก่อน เหมือน player ของ Songs เฟรตบอร์ดเริ่มที่มุมมอง Chord (โน้ตของคอร์ดปัจจุบัน) สลับเป็น Scale ได้ ไฟ LED ขึ้นตามหน้าจอ', 'player', 'เปิด Classic Rock in Em'],
  ['P3', 'Speed + Key บนเสียงจริง', 'ช้าลงถึง 50% โดยคีย์ไม่เปลี่ยน และเปลี่ยนคีย์ ±6 โดยความเร็วเท่าเดิม ทำกับเสียงที่อัดจริงทุก stem รวมถึงกีตาร์ของศิลปิน จึงฝึก lick แบบช้าด้วยเสียงจริงได้ (Scale mode ใช้ Style mode ที่เล่นจาก MIDI + samples)', 'player', 'เปิด player'],
  ['P4', 'Stems mixer (พับไว้)', 'Drums · Bass · Harmony · Guide guitar ปรับ Mute / Solo / Volume กีตาร์ของศิลปินปิดไว้ตั้งแต่ต้นเพราะเป็น backing track เปิดฟังได้เมื่ออยากฟังโซโลตัวอย่าง', 'mixer', 'เปิด mixer'],
  ['P5', 'Guide licks: Listen · Copy me · My turn', 'การ์ดต่อ lick กด ▶ Practise แล้วเพลงลูปเฉพาะบาร์ของ lick มีแท็บเลื่อนตามเวลา เฟรตบอร์ดและไฟ LED บอกโน้ตที่ต้องเล่นตอนนี้ (เขียว) และโน้ตถัดไป (เหลือง) ป้าย LISTEN / YOUR TURN บอกว่าเป็นตาใคร', 'lick', 'ลอง Lick 1'],
  ['P6', 'คะแนนแบบเบา', 'ปุ่ม 🏆 Play for score ต่อ lick: เล่น 1 รอบ ความเร็วเต็ม คีย์เดิม เก็บเฉพาะ best ต่อ lick ไม่มี XP ไม่มี leaderboard ไม่มีคะแนนแยกตามความเร็ว', 'lick', 'ลอง Lick 1'],
  ['P7', 'Jam & Record → Share', 'อัดเสียงหรือวิดีโอ 9:16 ไฟล์ที่ได้รวมเสียง backing track กับเสียงกีตาร์ของผู้ใช้ วิดีโอมีชื่อแทร็ก คีย์ BPM และคอร์ดปัจจุบันอยู่ในเฟรม อัดจบเปิดแผ่น Share ทันที: Share to an app, Save file, Post to Jam', 'rec', 'ไปที่ Jam & Record'],
  ['P8', 'Duet กับศิลปิน', 'เลือก lick + Copy me + Video + Duet: จอแบ่งซ้ายศิลปิน ขวาผู้ใช้ ศิลปินเล่น lick แล้วผู้ใช้ตอบ 2 รอบ ตอนนี้ฝั่งศิลปินเป็นกรอบ mockup เพราะยังไม่มีคลิปจริง (ต้องขอจาก producer ตามเอกสาร Duet Video Request)', 'duet', 'ตั้งค่า duet ให้ดู'],
  ['P9', 'Jam hub (เฟส 2)', 'รวม 3 อย่าง: Jam with artists (เข้า duet ได้ในแตะเดียว), My takes, และ Feed ที่ทุกโพสต์มีปุ่ม Play เปิดแทร็กเดียวกันมาเล่นต่อ ตาม Figma Make ต้นปี สลับดูได้ 2 แบบว่า Jam อยู่เป็น segment ใน Play หรือเป็น tab ล่าง', 'jam', 'เปิดหน้า Jam'],
  ['P10', 'อัปโหลดเพลงเอง', 'ไฟล์เดียวหรือหลาย stem วิเคราะห์ tempo คอร์ด คีย์ บนเครื่อง ได้ player เดียวกันแต่ไม่มี licks / duet / score และ take ที่อัดจะไม่รวมเสียงเพลงที่อัปโหลด (เรื่องสิทธิ์) และโพสต์ลง Jam ไม่ได้', 'upload', 'ไปที่อัปโหลด'],
  ['P11', 'Scale mode → Backing Track → Jam', 'หน้า Scale (mock) เลือกคีย์และสเกลได้ มีสองส่วนใหม่: <b>Jam with this scale</b> แสดงแทร็กที่เข้ากับสเกลนั้น แทร็กคีย์อื่นถูกเปลี่ยนคีย์ให้ตรงกับสเกลที่เลือก กด ▶ เปิด player พร้อมสเกลและ Box เดิม กด ● เปิดพร้อมตั้งอัดวิดีโอ แล้วโพสต์ลง Jam โดยโพสต์ติดชื่อสเกลไปด้วย และ <b>From Jam</b> แสดงโพสต์ของคนที่เล่นสเกลชนิดเดียวกัน ขากลับ ใน player มีแถว “Learn … in Scale mode” พาไปหน้าสเกลของแทร็กนั้น', 'scale', 'เปิดหน้า Scale'],
];
const CMP = [['หน้าที่', 'เล่นแทร็ก อัด แชร์', 'เรียนสเกล: forms, Practice, Challenge'], ['Player ของ backing track', 'มี — ตัวเดียวของทั้งแอป', 'ไม่มี (ตัด Play with Track ออก) เปิดของ Play'], ['สิ่งที่ส่งให้กัน', 'ลิงก์ “Learn … in Scale mode” พร้อมสเกลของแทร็ก', 'การ์ด “Jam with this scale” ส่งสเกล คีย์ ตำแหน่ง'], ['Licks', 'Listen · Copy me · My turn', 'ไม่มี'], ['คะแนน', 'best ต่อ lick ที่ความเร็วเต็ม', 'XP ของ Practice / Challenge เดิม ไม่เกี่ยวกับแทร็ก'], ['Leaderboard ต่อแทร็ก', 'ไม่มี — พิจารณาใน Jam เฟส 2', 'ไม่มี'], ['อัด / แชร์ / โพสต์ลง Jam', 'มี', 'ไม่มี — ปุ่ม ● พาไปอัดที่ Play'], ['โพสต์จาก Jam', 'ปุ่ม Play เปิดแทร็ก', 'แถว From Jam ตามชนิดสเกล']];
function renderNotes() {
  $('notes').innerHTML = `<h1>Play Mode · <span>Backing Track</span></h1>
    <p class="lead">Segment ใหม่ใน Play ต่อจาก <b>Songs</b> และคู่กับ <b>GlowTab</b> ใช้แทร็กที่ Litejam ผลิตเอง (stem จริงของ LJ001, LJ002, LJ003 และ LJ005 จากโฟลเดอร์ producer) แนวคิดคือ <b>Play. Record. Share.</b> — เล่นให้สนุกก่อน แล้วพาไปอัดและแชร์ ส่วนการเรียนและเกมอยู่ที่ Scale mode / Game</p>
    <div class="ft"><div class="top"><span class="nm">ตำแหน่งของ Jam</span></div><p>เลือกดูได้สองแบบ ข้อมูลและหน้าจอเดียวกัน</p><div class="seg" style="align-self:flex-start;display:inline-flex"><button class="${S.nav === 'app' ? 'on' : ''}" data-act="navMode" data-v="app">A · segment ใน Play (แอปปัจจุบัน)</button><button class="${S.nav === 'figma' ? 'on' : ''}" data-act="navMode" data-v="figma">B · tab ล่าง (Figma Make)</button></div></div>
    <div class="ft"><div class="top"><span class="id">ใหม่</span><span class="nm">Jam แบบเข้าใจง่าย</span></div><p><b>Jam คืออะไร:</b> เล่นโต้ตอบกับศิลปิน อัดเป็นคลิป แล้วแชร์ — ประโยคเดียวนี้อยู่บนสุดของหน้า Jam พร้อม 3 ขั้น และปุ่มเดียว “Start your first jam”<br><b>ใน 1 jam มี 3 ขั้น ทีละจอ ทีละปุ่ม:</b> ① Listen ฟังศิลปินเล่น → ② Try it ศิลปินเล่น แล้วบาร์เดิมวนกลับมาให้เราเล่นตอบ (ช้าลงได้) → ③ Record อัด 2 รอบ หยุดเอง ได้คลิปพร้อมแชร์<br><b>สิ่งที่เอาออกจากหน้า Jam:</b> คำว่า duet / call &amp; response / Copy me, ปุ่ม + Post (โพสต์ได้หลังอัดเสร็จ), โพสต์ของ Songs และ GlowTab, สวิตช์ Audio / Video / Duet (เหลือ 2 ปุ่ม: Record video กับ Audio only) · ผู้ใช้ที่อยากได้ทุกอย่างกด “Open the full player”</p><button class="try" data-act="demo" data-v="invite">วิดีโอศิลปินชวน Jam ›</button> <button class="try" data-act="demo" data-v="jam">หน้า Jam ›</button> <button class="try" data-act="demo" data-v="jam1">① Listen ›</button> <button class="try" data-act="demo" data-v="jam2">② Try it ›</button> <button class="try" data-act="demo" data-v="jam3">③ Record ›</button></div>
    <h2>Play Mode กับ Scale mode — ใครทำอะไร</h2>
    <div class="ft"><p style="margin-top:0"><b>ตัดสินใจ 25 พ.ย.:</b> ตัด Play with Track ออกจาก Scale mode เพื่อไม่ให้ซ้ำ เหลือ player ตัวเดียวที่ Play › Backing Track · ตัด XP จาก lick, ตัดคะแนนแยกตาม Slow / Medium / Full, leaderboard ต่อแทร็กเลื่อนไปพิจารณาใน Jam เฟส 2 · Scale mode เหลือเป็นประตูเข้าและทางไป Jam</p>
      <table class="cmpx"><tr><th></th><th>Play › Backing Track</th><th>Scale mode</th></tr>${CMP.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table></div>
    <h2>ฟีเจอร์ในต้นแบบนี้</h2>` + FEAT.map(f => `<div class="ft"><div class="top"><span class="id">${f[0]}</span><span class="nm">${f[1]}</span></div><p>${f[2]}</p><button class="try" data-act="demo" data-v="${f[3]}">${f[4]} ›</button></div>`).join('') +
    `<h2>ของจริง / ของจำลอง</h2><div class="ft"><p style="margin:0">• <b>จริง:</b> เสียง stem และ lick ของ LJ001, LJ002, LJ003, LJ005 · chord timeline · speed / key · อัปโหลดและวิเคราะห์เพลง · อัดเสียงและวิดีโอ · ไฟล์สำหรับแชร์ · BLE ไปที่กีตาร์<br>• <b>จำลอง:</b> ตัวเลขคะแนน (ต้องมี note detection) · วิดีโอศิลปินใน duet · คน โพสต์ และยอดใน Jam feed · การโพสต์ (ไม่มีอะไรออกจากเครื่อง) · รายการใน Songs และ GlowTab<br>• <b>นำเข้า 24 พ.ย.:</b> LJ003 Modern Pop (C | C | Am | Am | F | F | G | G ไม่ตรง brief ที่ขอ C | G | Am | F) และ LJ005 Neo Soul (Am7 | Dm7–Em7 เปลี่ยนคอร์ดครึ่งบาร์ ใช้ 16 บาร์แรกจาก stem 48 บาร์ คุณภาพคอร์ดมาจาก brief เพราะไม่มี harmony MIDI) ทั้งสองยังไม่ได้ฟังตรวจด้วยหู และยังไม่มี QA report · อีก 6 แทร็กยังไม่ส่ง</p></div>
    <h2>ลำดับการทำ</h2><div class="ft"><p style="margin:0">• <b>เฟส 1 — Play:</b> segment, library, player, mixer, speed / key, licks, คะแนนเบา<br>• <b>เฟส 1.5 — Record & Share:</b> อัดเสียง / วิดีโอ 9:16, แผ่น Share, My takes<br>• <b>เฟส 2 — Jam:</b> duet กับศิลปิน (ต้องมีคลิป), Jam hub, feed, โพสต์<br>• <b>ใช้ร่วมกับ GlowTab:</b> โครง player และการ์ด Jam & Record ชุดเดียวกัน</p></div>
    <h2>ที่ต้องตัดสินใจ</h2><div class="ft"><p style="margin:0">1. Jam อยู่ใน Play (A) หรือเป็น tab ล่าง (B) — B ต้องย้าย Chord / Scale ออกจาก tab ล่าง<br>2. Speed / Key บนมือถือจะใช้ time-stretch กับเสียงจริงเหมือนต้นแบบ หรือใช้ Style mode ของ Scale<br>3. คะแนนเบา (best ต่อ lick) จะเปิดพร้อมเฟส 1 หรือรอ note detection<br>4. take ของเพลงที่ผู้ใช้อัปโหลด: ต้นแบบตัดเสียงเพลงออกจากไฟล์แชร์ และไม่ให้โพสต์<br>5. คลิปศิลปินสำหรับ duet: จำนวนแทร็กแรก และสิทธิ์ใช้ภาพ</p></div>
    <p class="foot">ไฟล์: <code style="color:#50BCFF">play.part.js</code> + <code style="color:#50BCFF">make_play.py</code> → <code style="color:#50BCFF">index.html</code>, <code style="color:#50BCFF">app.js</code>, <code style="color:#50BCFF">media/</code> · engine มาจาก Jam with Track (basic)</p>`;
}
let DEMO_T = null;                            // #s=<screen>&t=<track id> opens a screen directly (used to render mockups)
function demo(v) {
  if (AU.ctx && AU.playing) stop(); const scrollTo = (id) => setTimeout(() => { const el = $(id); if (el) $('view').scrollTop = el.offsetTop - 56; }, 60), need = (id) => { id = DEMO_T || id; if (!T || T.id !== id || S.screen !== 'player') openTrack(officialTrack(id)); };
  if (v === 'lib') goPage('play', 'bt');
  else if (v === 'player') { openTrack(officialTrack(DEMO_T || 'LJ002')); }
  else if (v === 'mixer') { need('LJ002'); S.mixOpen = true; updMixer(); scrollTo('f-mixer'); }
  else if (v === 'lick') { need('LJ002'); lickStart(0, 'listen', { hold:true }); scrollTo('f-fret'); toast('Press ▶ or choose Listen / Copy me / My turn below.'); }
  else if (v === 'rec') { need('LJ002'); scrollTo('f-rec'); }
  else if (v === 'duet') { need('LJ002'); S.recVideo = true; S.duet = true; lickStart(0, 'copy', { hold:true }); scrollTo('f-rec'); }
  else if (v === 'jam') goPage(S.nav === 'figma' ? 'jam' : 'play', 'jam');
  else if (/^invite/.test(v)) { goPage(S.nav === 'figma' ? 'jam' : 'play', 'jam'); const i = Math.max(0, ARTISTS.findIndex(a => a.tid === (DEMO_T || 'LJ002'))); inviteOpen(i, v === 'invite' ? {} : { fix:v.slice(6) }); }
  else if (/^jam[123]$/.test(v)) { const i = Math.max(0, ARTISTS.findIndex(a => a.tid === (DEMO_T || 'LJ002'))); ACT.jamArtist({ v:i }); if (v !== 'jam1') ACT.jamStep({ v:v.slice(3) }); }
  else if (v === 'upload') { goPage('play', 'bt'); scrollTo('f-upload'); }
  else if (v === 'scale') goPage('scale');
  if (window.innerWidth <= 1020) window.scrollTo({ top:0, behavior:'smooth' });
}

/* ================= start ================= */
initBle(); renderNotes(); renderView();
{ const h = location.hash, m = /[#&]s=(\w+)/.exec(h), t = /[#&]t=(LJ\d+)/.exec(h); if (t && DATA.packs[t[1]]) DEMO_T = t[1]; if (/[#&]mock=1/.test(h)) document.body.classList.add('mock'); if (m) setTimeout(() => { demo(m[1]); DEMO_T = null; }, 80); }
DB.open().then(() => DB.all()).then((rows) => { if (rows && rows.length) { UPL = rows.sort((a, b) => b.added - a.added); if (S.screen === 'library') renderView(); } });
window.PBT = { inviteRecord, inviteOpen, INV, S, AU, BLE, FB, DSP, DB, REC, U, FEED, PV, ledPayload, getPos, play, stop, addFiles, openTrack, officialTrack, uploadTrack, lickStart, recStart, ACT, get T() { return T; }, get UPL() { return UPL; } };
})();
