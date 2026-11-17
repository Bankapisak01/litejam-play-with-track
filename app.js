/* Play with Track V2 — Scale Mode prototype driven by the real LJ001 producer assets.
   Data: media/lj001_data.js (metadata, chords, licks, MIDI style events) · Audio: media/lj001_media.js (stems, guide licks, samples). */
(function () {
'use strict';
const DATA = window.LJ_DATA, MEDIA = window.LJ_MEDIA || {};
let D, TPB, BEAT, END, BASE_BPM, PPQ, CH;                 // set by setTrack()
const CHKEYS = ['drums', 'bass', 'harmony', 'guide'];
const FW = 64, SH = 28, NFRET = 15, BARP = 62, TABW = 190;
const NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const DEG = ['1','b2','2','b3','3','4','b5','5','b6','6','b7','7'];
const OPEN = [4, 11, 7, 2, 9, 4];            // string index 0 = high e
const QUAL = { dom7:[0,4,7,10], maj:[0,4,7], min:[0,3,7], min7:[0,3,7,10], maj7:[0,4,7,11] };
const SCALE_LIB = {
  pentMinor: { name:'Minor Pentatonic', iv:[0,3,5,7,10] }, blues: { name:'Blues', iv:[0,3,5,6,7,10] },
  natMinor: { name:'Natural Minor', iv:[0,2,3,5,7,8,10] }, pentMajor: { name:'Major Pentatonic', iv:[0,2,4,7,9] }, major: { name:'Major', iv:[0,2,4,5,7,9,11] }, follow: { name:'Follow the chord' },
};
const FOLLOW = { dom7:['Mixolydian', [0,2,4,5,7,9,10]], maj:['Major Pentatonic', [0,2,4,7,9]], maj7:['Major Pentatonic', [0,2,4,7,9]], min:['Minor Pentatonic', [0,3,5,7,10]], min7:['Minor Pentatonic', [0,3,5,7,10]] };
const STYPES = { 'Major':[0,2,4,5,7,9,11], 'Natural minor':[0,2,3,5,7,8,10], 'Pentatonic Major':[0,2,4,7,9], 'Pentatonic minor':[0,3,5,7,10],
  'Pentatonic Blues':[0,3,5,6,7,10], 'Dorian':[0,2,3,5,7,9,10], 'Phrygian':[0,1,3,5,7,8,10], 'Mixolydian':[0,2,4,5,7,9,10] };
const TRK_SCALE = { LJ001:{pc:9,t:['Pentatonic Blues','Pentatonic minor']}, LJ002:{pc:4,t:['Pentatonic minor','Natural minor']}, LJ003:{pc:0,t:['Major','Pentatonic Major']},
  LJ004:{pc:2,t:['Dorian']}, LJ005:{pc:9,t:['Natural minor','Pentatonic minor']}, LJ006:{pc:7,t:['Major']}, LJ007:{pc:4,t:['Phrygian']}, LJ008:{pc:0,t:['Major']},
  LJ009:{pc:9,t:['Natural minor','Pentatonic minor']}, LJ010:{pc:7,t:['Mixolydian']} };
const ART = ['#50BCFF','#FF2020','#ADFE00','#FFCC00','#c58bff','#50BCFF','#FF2020','#FFCC00','#ADFE00','#c58bff'];

const S = { tab:'track', screen:'library', lib:{ view:'discover', browse:'cat', q:'', f:{}, sort:'popular', pid:null }, demo:true, art:'scene', ctx:null, chordEdit:false,
  mode:'audio', fb:'scale', scale:'pentMinor', pos:'full', labels:'notes', targets:true,
  lick:0, lickMode:'listen', lickCount:true, challenge:null, loopKind:null, loop:null, abA:null,
  metro:false, countIn:true, bpm:70, tr:0,
  ch:{ drums:{vol:85,mute:false,solo:false}, bass:{vol:80,mute:false,solo:false}, harmony:{vol:75,mute:false,solo:false}, guide:{vol:85,mute:true,solo:false} },
  sheet:null, sKey:9, sType:'Pentatonic Blues', pro:false };
// S.pro: the page always opens in Normal view (copy the coach + scores). Pro view (free practice + Jam & Record) is switched on per visit and is not remembered.

const $ = (id) => document.getElementById(id);
const mod = (n, m) => ((n % m) + m) % m;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ================= music helpers ================= */
const rootPcOf = (sym) => NOTE.indexOf(sym.match(/^[A-G]#?/)[0]);
function chordAt(bar) {                     // bar = 0-based index
  const c = D.chords[Math.max(0, Math.min(D.bars - 1, bar))];
  const pc = mod(rootPcOf(c.sym) + S.tr, 12);
  return { pc, label: NOTE[pc] + c.sym.replace(/^[A-G]#?/, ''), iv: QUAL[c.quality] || QUAL.maj, q: c.quality };
}
const keyPc = () => mod(D.keyPc + S.tr, 12);
function scaleNow(bar) {                    // -> {root, iv, name}
  const sc = SCALE_LIB[S.scale];
  if (S.scale === 'follow') { const c = chordAt(bar), f = FOLLOW[c.q] || FOLLOW.maj; return { root:c.pc, iv:f[1], name:NOTE[c.pc] + ' ' + f[0] }; }
  return { root:keyPc(), iv:sc.iv, name:NOTE[keyPc()] + ' ' + sc.name };
}
function boxRange() { let r = mod(keyPc() - 4, 12); if (r === 0) r = 12; return [r, Math.min(NFRET, r + 3)]; }
const tps = () => S.bpm * PPQ / 60;
const lickAtTick = (t) => D.licks.findIndex(l => t >= l.startTick && t < l.endTick);
const lickFret = (f, l) => f + S.tr + (l.fretLow + S.tr < 0 ? 12 : (l.fretHigh + S.tr > NFRET ? -12 : 0));

/* ================= audio engine ================= */
const AU = { ctx:null, buf:{}, bufs:{}, loaded:{}, loadingP:{}, ch:{}, ready:false, playing:false, pausedTick:0, segs:[], voices:[], timer:null, pass:0, countStart:0, countUntil:0, countBeat:1 };

function initCtx() {
  if (AU.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  AU.ctx = new AC();
  AU.master = AU.ctx.createGain(); AU.master.gain.value = 0.9; AU.master.connect(AU.ctx.destination);
  CHKEYS.forEach(k => { const g = AU.ctx.createGain(); g.connect(AU.master); AU.ch[k] = g; });
  AU.guideAuto = AU.ctx.createGain(); AU.guideAuto.connect(AU.ch.guide);
  AU.demoG = AU.ctx.createGain(); AU.demoG.gain.value = 0.9; AU.demoG.connect(AU.master);          // Licks_Demo mix for Jam & Record
  applyMix(true);
}
function decode(uri) {
  const bin = atob(uri.slice(uri.indexOf(',') + 1)); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Promise((res, rej) => AU.ctx.decodeAudioData(u8.buffer, res, rej));
}
function ensureAudio() {
  initCtx();
  const id = D.mediaId || D.id, cur = () => (D.mediaId || D.id) === id;
  if (AU.loaded[id]) { AU.buf = AU.bufs[id]; AU.ready = true; return Promise.resolve(); }
  if (AU.loadingP[id]) return AU.loadingP[id];
  const src = MEDIA[id] || {}, keys = Object.keys(src); let n = 0; AU.bufs[id] = {};
  $('loadTitle').textContent = D.own ? 'Loading your track' : 'Loading ' + id + ' assets'; $('loadBar').style.width = '0'; $('loadOvl').classList.add('show');
  AU.loadingP[id] = Promise.all(keys.map(k => decode(src[k]).then(b => { AU.bufs[id][k] = b; n++; if (cur()) $('loadBar').style.width = Math.round(n / keys.length * 100) + '%'; })))
    .then(() => { AU.loaded[id] = true; if (cur()) { AU.buf = AU.bufs[id]; AU.ready = true; $('loadOvl').classList.remove('show'); } })
    .catch(e => { $('loadTxt').textContent = 'This browser could not decode the AAC audio (' + (e && e.message || e) + '). Open in Chrome or Safari.'; throw e; });
  return AU.loadingP[id];
}
function applyMix(now) {
  if (!AU.ctx) return;
  const anySolo = CHKEYS.some(k => S.ch[k].solo);
  CHKEYS.forEach(k => { const c = S.ch[k]; const g = (c.mute || (anySolo && !c.solo)) ? 0 : c.vol / 100;
    if (now) AU.ch[k].gain.value = g; else AU.ch[k].gain.setTargetAtTime(g, AU.ctx.currentTime, 0.015); });
}
function click(t, accent) {
  const o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.frequency.value = accent ? 1400 : 900; g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + 0.08);
  AU.voices.push({ src:o, g, end:t + 0.1 });
}
// lick practice: half-bar (2-beat) count-in before every pass so the player is ready for the first note
const lickCountOn = () => S.loopKind === 'lick' && !S.pro && (S.lickCount || S.challenge != null) && !!S.loop && !S.jam;   // Normal only. Pro plays its passes back to back like a real jam
// Pro: how many passes before playback stops by itself (0 = keep looping). One round of call & response = the coach's pass + yours.
const ROUNDS_MAX = 5;                          // Pro: Loop repeats at most 5 rounds (practice and Jam & Record)
function passLimit() { if (S.jam) return S.jam.passes || 1; if (S.pro && S.loopKind === 'lick' && S.challenge == null) return (S.lickOnce ? 1 : ROUNDS_MAX) * (S.lickMode === 'call' ? 2 : 1); return 0; }
function passDone(seg) { const lim = passLimit(); if (!lim || seg.pass + 1 < lim) return false; const call = S.jam ? S.jam.mode === 'call' : S.lickMode === 'call'; return !call || seg.pass % 2 === 1; }
function lickCounting() {
  if (!AU.playing || !AU.segs.length) return null;
  const now = AU.ctx.currentTime, s = AU.segs[AU.segs.length - 1];
  if (!s.count || now >= s.t0 || now < s.count.start) return null;
  return { k: Math.min(1, Math.floor((now - s.count.start) / s.count.beat)), seg: s };
}
function guideOnFor(pass) { if (S.jam) return S.jam.mode === 'call' ? pass % 2 === 0 : false; if (S.loopKind !== 'lick') return true; if (S.lickMode === 'mine') return false; if (S.lickMode === 'call') return pass % 2 === 0; return true; }
function newSeg(tick0, t0) {
  const endTick = S.loop ? S.loop.b : END;
  const seg = { t0, tick0, endTick, tEnd: t0 + (endTick - tick0) / tps(), pass: AU.pass++, sched: tick0 };
  seg.guideOn = guideOnFor(seg.pass);
  AU.guideAuto.gain.setValueAtTime(seg.guideOn ? 1 : 0, Math.max(t0, AU.ctx.currentTime));
  AU.segs.push(seg); if (AU.segs.length > 4) AU.segs.shift();
  if (S.mode === 'audio') {
    const off = tick0 / (BASE_BPM * PPQ / 60);
    CHKEYS.forEach(k => { const b = AU.buf[k]; if (!b || off >= b.duration - 0.02) return;
      const src = AU.ctx.createBufferSource(), g = AU.ctx.createGain(); src.buffer = b; src.playbackRate.value = S.bpm / BASE_BPM;   // 1 for Litejam Tracks; < 1 = slow-down on uploads
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + 0.006);
      g.gain.setValueAtTime(1, seg.tEnd - 0.01); g.gain.linearRampToValueAtTime(0, seg.tEnd);
      src.connect(g); g.connect(k === 'demo' ? AU.demoG : (k === 'guide' ? AU.guideAuto : AU.ch[k])); src.start(t0, off); src.stop(seg.tEnd + 0.02);
      AU.voices.push({ src, g, end: seg.tEnd + 0.05 }); });
  }
  return seg;
}
function sampleVoice(buf, t, rate, level, attack, durSec, release, dest) {
  const src = AU.ctx.createBufferSource(), g = AU.ctx.createGain(); src.buffer = buf; src.playbackRate.value = rate;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.setValueAtTime(level, t + Math.max(attack, durSec)); g.gain.linearRampToValueAtTime(0, t + Math.max(attack, durSec) + release);
  src.connect(g); g.connect(dest); src.start(t); src.stop(t + durSec + release + 0.05);
  AU.voices.push({ src, g, end: t + durSec + release + 0.1 });
}
function playStyle(ev, t) {                 // [inst, tick, pitch, vel, dur]
  const m = D.sampleMap, v = ev[3] / 127, dur = ev[4] / tps();
  if (ev[0] === 0) { const key = m.drums[ev[2]]; if (!key) return; sampleVoice(AU.buf[key], t, 1, v * 0.85, 0.001, m.drumLen[key] || 0.45, 0.05, AU.ch.drums); }
  else if (ev[0] === 1) sampleVoice(AU.buf[m.bass.buf], t, Math.pow(2, (ev[2] + m.bass.octave - m.bass.root + S.tr) / 12), v * 0.9, 0.004, dur, 0.09, AU.ch.bass);
  else if (m.harmony) sampleVoice(AU.buf[m.harmony.buf], t, Math.pow(2, (ev[2] + m.harmony.octave - m.harmony.root + S.tr) / 12), v * 0.4, 0.012, dur, 0.14, AU.ch.harmony);
}
function playGuideSynth(n, t) {             // [tick, dur, string, fret, midi, bend, muted] — used in Style mode (no time-stretched audio)
  if (n[6]) return;
  const ctx = AU.ctx, f = 440 * Math.pow(2, (n[4] + S.tr - 69) / 12), dur = Math.min(n[1] / tps(), 2.6);
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.Q.value = 1.2;
  [o1, o2].forEach((o, i) => { const base = f * (i ? 1.004 : 1); o.frequency.setValueAtTime(base, t);
    if (n[5]) o.frequency.linearRampToValueAtTime(base * Math.pow(2, n[5] / 12), t + Math.min(0.16, dur * 0.6)); });
  lp.frequency.setValueAtTime(2800, t); lp.frequency.exponentialRampToValueAtTime(1100, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.17, t + 0.005); g.gain.exponentialRampToValueAtTime(0.05, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
  const g2 = ctx.createGain(); g2.gain.value = 0.45; o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(AU.guideAuto);
  o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  AU.voices.push({ src:o1, g, end:t + dur + 0.15 }); AU.voices.push({ src:o2, g, end:t + dur + 0.15 });
}
function scheduleRange(seg, a, b) {
  const tm = (tick) => seg.t0 + (tick - seg.tick0) / tps();
  if (S.metro) for (let t = Math.ceil(a / BEAT) * BEAT; t < b; t += BEAT) click(tm(t), t % TPB === 0);
  if (S.mode !== 'style') return;
  for (const ev of D.style) { if (ev[1] >= b) break; if (ev[1] >= a) playStyle(ev, tm(ev[1])); }
  if (seg.guideOn) for (const l of D.licks) for (const n of l.notes) if (n[0] >= a && n[0] < b) playGuideSynth(n, tm(n[0]));
}
function sched() {
  if (!AU.playing) return;
  const now = AU.ctx.currentTime, hor = now + 0.18;
  AU.voices = AU.voices.filter(v => v.end > now);
  let seg = AU.segs[AU.segs.length - 1];
  for (let guard = 0; guard < 3; guard++) {
    const horTick = Math.min(seg.endTick, seg.tick0 + (hor - seg.t0) * tps());
    if (horTick > seg.sched) { scheduleRange(seg, seg.sched, horTick); seg.sched = horTick; }
    if (horTick >= seg.endTick) {
      if (S.challenge != null) { if (now >= seg.tEnd) finishChallenge(); break; }                 // scored run = one pass, then the result
      if (passDone(seg)) { if (now >= seg.tEnd) { const capped = !S.jam && !S.lickOnce; stop(true); if (capped) toast(ROUNDS_MAX + ' rounds done. Tap the mode again for another ' + ROUNDS_MAX + '.'); } break; }   // Pro: Once, the 5-round Loop cap, and Jam & Record
      if (S.loop) { const prevEnd = seg.tEnd, half = lickCountOn(), bs = BEAT / tps();
        if (half) for (let i = 0; i < 2; i++) click(prevEnd + i * bs, false);
        seg = newSeg(S.loop.a, prevEnd + (half ? 2 * bs : 0)); if (half) seg.count = { start: prevEnd, beat: bs }; continue; }
      if (now >= seg.tEnd) { stop(true); }
    }
    break;
  }
}
function curSeg() { const now = AU.ctx.currentTime; let seg = AU.segs[0]; for (const s of AU.segs) if (s.t0 <= now) seg = s; return seg; }
function getTick() {
  if (!AU.playing || !AU.segs.length) return AU.pausedTick;
  const now = AU.ctx.currentTime, last = AU.segs[AU.segs.length - 1];
  if (last.count && now < last.t0 && now >= last.count.start) return last.tick0;      // counting in the next pass
  const seg = curSeg();
  if (now < seg.t0) return seg.tick0;
  return Math.min(seg.endTick - 1, seg.tick0 + (now - seg.t0) * tps());
}
function killVoices() {
  const now = AU.ctx.currentTime;
  AU.voices.forEach(v => { try { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.008); v.src.stop(now + 0.05); } catch (e) {} });
  AU.voices = [];
}
function play(opts) {
  opts = opts || {};
  if (AU.ready) return startNow(opts);
  ensureAudio().then(() => startNow(opts)).catch(() => {});
}
function startNow(opts) {
  {
    if (AU.playing) return;
    AU.ctx.resume();
    let start = opts.from != null ? opts.from : AU.pausedTick;
    if (S.loop && (start < S.loop.a || start >= S.loop.b)) start = S.loop.a;
    if (start >= END - 1) start = 0;
    const now = AU.ctx.currentTime + 0.08; let t0 = now;
    AU.countUntil = 0; let cnt = null;
    if (!opts.noCount && lickCountOn() && start === S.loop.a) { const bs = BEAT / tps(); for (let i = 0; i < 2; i++) click(now + i * bs, false); t0 = now + 2 * bs; cnt = { start: now, beat: bs }; }
    else if ((S.countIn || S.pro || opts.forceCount) && !opts.noCount) { /* Pro: always one bar of count-in at the start, never between passes */ $('countLbl').textContent = 'Count-in · ' + D.timeSig; const bs = BEAT / tps(); for (let i = 0; i < 4; i++) click(now + i * bs, i === 0); t0 = now + 4 * bs; AU.countStart = now; AU.countUntil = t0; AU.countBeat = bs; }
    AU.playing = true; AU.pass = 0; AU.segs = []; AU.pausedTick = start;
    const sg = newSeg(start, t0); if (cnt) sg.count = cnt; if (S.jam) jamArm(t0);
    clearInterval(AU.timer); AU.timer = setInterval(sched, 25); sched();
    updTransport(); frame(true);
  }
}
function stop(finished) {
  if (!AU.ctx) return;
  const t = AU.playing ? getTick() : AU.pausedTick;
  clearInterval(AU.timer); AU.playing = false; AU.countUntil = 0;
  AU.pausedTick = finished ? (S.loop ? S.loop.a : 0) : t;
  killVoices(); $('countOvl').classList.remove('show');
  if (S.jam) { const jm = S.jam; S.jam = null; jamFinish(jm); }
  updTransport(); frame(true);
}
function restart(tick, withCount) {                     // apply a change (loop / tempo / key / mode) without count-in
  if (!AU.playing) { if (tick != null) AU.pausedTick = tick; frame(true); return; }
  const t = tick != null ? tick : getTick();
  clearInterval(AU.timer); AU.playing = false; killVoices();
  play({ from: t, noCount: !withCount });
}

/* ================= rendering: chrome ================= */
const icon = (name, size) => `<span class="ic" style="--m:url('assets/${name}.png');width:${size}px;height:${size}px"></span>`;
function renderChrome() {
  const t = (id, label, extra) => `<button class="tab ${S.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}"><span>${label}${extra || ''}</span><i></i></button>`;
  $('tabs').innerHTML = t('scale', 'Scale') + t('chromatic', 'Chromatic') + t('track', 'Play with Track', '<em class="new">NEW</em>');
  $('nav').innerHTML = [['Chord','icon_chord'],['Scale','icon_scale'],['Perform','icon_perform'],['Tuner','icon_tuner'],['Setting','icon_setting']]
    .map(([l, i]) => `<div class="${l === 'Scale' ? 'on' : ''}">${icon(i, 22)}${l}</div>`).join('');
}
function renderView() {
  renderChrome();
  if (S.tab === 'scale') return renderScaleTab();
  if (S.tab !== 'scale' && !(S.tab === 'track' && S.screen === 'player')) { FB.show = false; ledSync(); }
  if (S.tab === 'chromatic') { $('view').innerHTML = '<div class="pad"><div class="sub" style="padding:48px 12px">Chromatic — unchanged, out of scope for this prototype.</div></div>'; return; }
  if (S.screen === 'library') return renderLibrary();
  renderPlayer();
}

/* ================= fretboard ================= */
function fbHTML(dots, hiFrets) {
  let h = '<div class="fbwrap"><div class="strl">' + ['E','B','G','D','A','E'].map(l => `<div>${l}</div>`).join('') + '</div><div class="fbscroll"><div class="fb">';
  for (let f = 1; f <= NFRET + 1; f++) h += `<div class="fl ${f === 1 ? 'nut' : ''}" style="left:${f * FW}px"></div>`;
  [3, 5, 7, 9, 15].forEach(f => { h += `<div class="in" style="left:${f * FW + FW / 2 - 5}px;top:${8 + 3 * SH - 5}px"></div>`; });
  [2, 4].forEach(k => { h += `<div class="in" style="left:${12 * FW + FW / 2 - 5}px;top:${8 + k * SH - 5}px"></div>`; });
  [1, 1, 1.5, 2, 2.5, 3].forEach((w, i) => { h += `<div class="st" style="top:${8 + i * SH + SH / 2 - w / 2}px;height:${w}px"></div>`; });
  dots.forEach(d => { h += `<div class="dot ${d.cls || ''}" ${d.key ? `data-k="${d.key}"` : ''} style="left:${d.f * FW + FW / 2 - 11}px;top:${8 + d.s * SH + SH / 2 - 11}px">${d.label}${d.badge ? `<u>${d.badge}</u>` : ''}</div>`; });
  h += '</div><div class="frl">';
  for (let f = 0; f <= NFRET; f++) h += `<div><span class="${hiFrets && f >= hiFrets[0] && f <= hiFrets[1] ? 'on' : ''}">${f}</span></div>`;
  return h + '</div></div></div>';
}
function scaleDots(root, iv, opt) {          // opt: {range, labels, targetPcs, faint, blueIv}
  opt = opt || {}; const out = [];
  for (let s = 0; s < 6; s++) for (let f = 0; f <= NFRET; f++) {
    if (opt.range && (f < opt.range[0] || f > opt.range[1])) continue;
    const pc = (OPEN[s] + f) % 12, d = mod(pc - root, 12); if (!iv.includes(d)) continue;
    let cls = d === 0 ? 'r' : (opt.blueIv != null && d === opt.blueIv ? 'bn' : '');
    if (opt.targetPcs && opt.targetPcs.includes(pc)) cls += ' tg';
    if (opt.faint) cls += ' faint';
    out.push({ s, f, label: opt.labels === 'degrees' ? DEG[d] : NOTE[pc], cls });
  }
  return out;
}
function chordDots(c) {
  const out = [], cl = { 0:'r', 3:'i3', 4:'i3', 7:'i5', 10:'i7', 11:'i7' };
  for (let s = 0; s < 6; s++) for (let f = 0; f <= NFRET; f++) { const pc = (OPEN[s] + f) % 12, d = mod(pc - c.pc, 12); if (c.iv.includes(d)) out.push({ s, f, label: S.labels === 'degrees' ? DEG[d] : NOTE[pc], cls: cl[d] || '' }); }
  return out;
}
function lickDots(l) {
  const seen = {}, out = [];
  l.notes.forEach(n => { const f = n[6] ? 0 : lickFret(n[3], l), key = (n[2] - 1) + '_' + f; if (seen[key]) { if (n[5] && !seen[key].badge) seen[key].badge = bendTxt(n[5]); return; }
    const pc = mod(n[4] + S.tr, 12); const d = { s: n[2] - 1, f, key, label: n[6] ? '×' : (S.labels === 'degrees' ? DEG[mod(pc - keyPc(), 12)] : NOTE[pc]), cls: n[6] ? 'mu' : 'lk', badge: n[5] ? bendTxt(n[5]) : '' };
    seen[key] = d; out.push(d); });
  return out;
}
const bendTxt = (b) => b >= 2 ? '↑full' : (b >= 1 ? '↑½' : '↑¼');

/* ================= catalog · covers · user library ================= */
const CATS = [
  { k:'Blues', a:'#1e3a8a', b:'#50BCFF', m:'wave', bpm:[60,130], subs:['Slow Blues','Shuffle Blues','Minor Blues','Texas Blues','Chicago Blues'], sc:['Pentatonic Blues','Pentatonic minor','Mixolydian'] },
  { k:'Rock', a:'#7f1d1d', b:'#ff5a3d', m:'bolt', bpm:[90,160], subs:['Classic Rock','Pop Rock','Hard Rock','Indie Rock','Southern Rock'], sc:['Pentatonic minor','Natural minor','Mixolydian','Pentatonic Major'] },
  { k:'Pop', a:'#9d174d', b:'#ff8ad0', m:'dots', bpm:[80,128], subs:['Modern Pop','Acoustic Pop','Synth Pop','Pop Ballad'], sc:['Major','Pentatonic Major','Natural minor'] },
  { k:'Funk', a:'#7c2d12', b:'#FFCC00', m:'zig', bpm:[90,120], subs:['Funk Groove','Disco Funk','Slap Funk','P-Funk'], sc:['Dorian','Pentatonic minor','Mixolydian'] },
  { k:'Neo Soul', a:'#4c1d95', b:'#c58bff', m:'blob', bpm:[65,95], subs:['Neo Soul','Lo-fi Soul','R&B Ballad','Gospel Soul'], sc:['Natural minor','Dorian','Pentatonic minor'] },
  { k:'Jazz', a:'#0f172a', b:'#d4a84a', m:'rings', bpm:[80,200], subs:['Jazz Swing','Bossa Jazz','Jazz Blues','Modal Jazz'], sc:['Major','Dorian','Mixolydian'] },
  { k:'Metal', a:'#0b0b0f', b:'#7a7a8a', m:'spike', bpm:[110,200], subs:['Metal','Thrash Metal','Prog Metal','Doom Metal'], sc:['Phrygian','Natural minor','Pentatonic minor'] },
  { k:'Latin', a:'#14532d', b:'#ADFE00', m:'sun', bpm:[90,130], subs:['Latin / Bossa','Samba','Latin Rock','Bolero'], sc:['Major','Dorian','Natural minor'] },
  { k:'Ambient', a:'#134e4a', b:'#5eead4', m:'haze', bpm:[55,85], subs:['Ambient Ballad','Cinematic','Dream Pop','Post Rock'], sc:['Natural minor','Major','Pentatonic Major'] },
  { k:'Country', a:'#78350f', b:'#fbbf24', m:'lines', bpm:[85,140], subs:['Country','Folk','Bluegrass','Americana'], sc:['Pentatonic Major','Major','Mixolydian'] },
  { k:'Thai Pop', a:'#1d4ed8', b:'#f472b6', m:'dots', bpm:[70,120], subs:['Thai Pop','Luk Thung Groove','T-Pop Ballad','Thai Indie'], sc:['Major','Natural minor','Pentatonic Major'] },
  { k:'Reggae', a:'#166534', b:'#facc15', m:'lines', bpm:[65,90], subs:['Reggae','Ska','Dub'], sc:['Natural minor','Major','Pentatonic minor'] },
];
const CAT = Object.fromEntries(CATS.map(c => [c.k, c])); CAT.Upload = { k:'Upload', a:'#2f2f36', b:'#6b6b78', m:'bars' };
const REAL_CAT = { LJ001:'Blues', LJ002:'Rock', LJ003:'Pop', LJ004:'Funk', LJ005:'Neo Soul', LJ006:'Jazz', LJ007:'Metal', LJ008:'Latin', LJ009:'Ambient', LJ010:'Rock' };
const MINORISH = ['Natural minor','Pentatonic minor','Pentatonic Blues','Dorian','Phrygian'];
const PICONS = [['🎸','#ADFE00'],['🔥','#FF2020'],['🌙','#50BCFF'],['☕','#d4a84a'],['⚡','#FFCC00'],['🎧','#c58bff'],['🌴','#5eead4'],['❤️','#ff8ad0'],['🎹','#50BCFF'],['🥁','#ff5a3d'],['🎤','#c58bff'],['⭐','#FFCC00']];
const UKEY = 'ljpwt.user.v2', ROWH = 72;
let CATALOG = [], CMAP = new Map(), LIST = [], VL = { first:-1, last:-1 }, U = loadU();

function trackTitle(t) { return t.style + ' in ' + t.key.replace(' major', '').replace(' minor', 'm'); }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const tempoBand = (b) => b < 85 ? 'Slow' : (b <= 120 ? 'Medium' : 'Fast');
const keyLbl = (t) => NOTE[t.keyPc] + (MINORISH.includes(t.scale) ? 'm' : '');
const metaLine = (t) => t.own ? 'Your upload · ' + keyLbl(t) + ' · ' + t.bpm + ' BPM' : t.cat + ' · ' + NOTE[t.keyPc] + ' ' + t.scale + ' · ' + t.bpm + ' BPM';
function loadU() { try { const j = JSON.parse(localStorage.getItem(UKEY)); if (j && j.playlists) return j; } catch (e) {}
  return { playlists:[{ id:'p1', name:'Warm-up jams', icon:0, tracks:['LJ001','LJ002'] }], favs:['LJ001'], recent:['LJ002','LJ001'], uploads:[], seq:2, upSeq:1 }; }
function saveU() { try { localStorage.setItem(UKEY, JSON.stringify(U)); return true; } catch (e) { return false; } }

function buildCatalog() {
  const out = DATA.tracks.map((t, i) => ({ id:t.id, title:trackTitle(t), cat:REAL_CAT[t.id], keyPc:TRK_SCALE[t.id].pc, scale:TRK_SCALE[t.id].t[0], bpm:t.bpm, level:t.level, real:true, playable:!!DATA.packs[t.id], isNew:i < 2, plays:9500 - i * 420 }));
  if (S.demo) { const r = rng(20261115);                   // placeholder entries: lets us test browsing at catalogue scale
    for (let i = 11; i <= 1200; i++) { const c = CATS[Math.floor(Math.pow(r(), 1.35) * CATS.length)], sub = c.subs[Math.floor(r() * c.subs.length)], pool = /Minor|Metal|Doom/.test(sub) ? c.sc.filter(x => MINORISH.includes(x)) : c.sc, scale = pool[Math.floor(r() * pool.length)], keyPc = Math.floor(r() * 12), lv = r();
      out.push({ id:'LJ' + String(i).padStart(4, '0'), title:sub + ' in ' + NOTE[keyPc] + (MINORISH.includes(scale) ? 'm' : ''), cat:c.k, keyPc, scale, bpm:Math.round((c.bpm[0] + r() * (c.bpm[1] - c.bpm[0])) / 5) * 5,
        level: lv < .45 ? 'Beginner' : (lv < .85 ? 'Intermediate' : 'Advanced'), real:false, playable:false, isNew:r() < .03, plays:Math.floor(r() * 8000) }); } }
  CATALOG = out; CMAP = new Map(out.map(t => [t.id, t]));
}
const upItem = (u) => ({ id:u.id, title:u.name, cat:'Upload', keyPc:u.keyPc, scale:u.minor === false ? 'Major' : 'Natural minor', bpm:110, level:'', own:true, playable:true });
const findItem = (id) => CMAP.get(id) || (U.uploads.find(u => u.id === id) && upItem(U.uploads.find(u => u.id === id)));

/* ---- cover art v2 ---- three directions (S.art): 'scene' = one illustrated scene per style, 'led' = the track's real scale on an LED fretboard,
   'mascot' = scene + a Litejam Universe character on the style tiles. Scenes are drawn on a 300×100 canvas; the middle square is the track cover. ---- */
const SCENE_BG = {
  Blues:'linear-gradient(165deg,#0a1040 0%,#1e40af 62%,#3b82f6 100%)', Rock:'linear-gradient(135deg,#190404 0%,#991b1b 55%,#f97316 100%)',
  Pop:'linear-gradient(135deg,#ec4899 0%,#fb923c 60%,#fde047 100%)', Funk:'linear-gradient(180deg,#3b0764 0%,#c2410c 68%,#f59e0b 100%)',
  'Neo Soul':'linear-gradient(180deg,#1e1b4b 0%,#9333ea 55%,#fdba74 100%)', Jazz:'linear-gradient(135deg,#0b1220 0%,#1e293b 100%)',
  Metal:'linear-gradient(180deg,#030303 0%,#27272a 62%,#52525b 100%)', Latin:'linear-gradient(135deg,#064e3b 0%,#16a34a 52%,#facc15 100%)',
  Ambient:'linear-gradient(180deg,#020617 0%,#0f3d3e 72%,#115e59 100%)', Country:'linear-gradient(180deg,#7c2d12 0%,#ea580c 46%,#fbbf24 100%)',
  'Thai Pop':'linear-gradient(135deg,#1e3a8a 0%,#7c3aed 52%,#ec4899 100%)', Reggae:'linear-gradient(180deg,#dc2626 0%,#facc15 50%,#16a34a 100%)',
  Upload:'linear-gradient(135deg,#2f2f36,#6b6b78)',
};
const MASCOT = { Blues:'bank-apisak', Rock:'rockmaster', Pop:'pitchy-rock', Metal:'sebastian', Ambient:'crystal-power', Country:'g-force-killerfish', Funk:'deadbeat', 'Thai Pop':'piarna' };
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
function ledArt(keyPc, scaleName, col) {       // the track's scale lit on a 5-fret window of the fretboard
  const iv = STYPES[scaleName] || STYPES['Pentatonic minor']; let r = mod(keyPc - 4, 12); const f0 = r === 0 ? 0 : r - 1; let s = '';
  for (let f = 0; f <= 5; f++) s += `<rect x="${10 + f * 16 - (f0 === 0 && f === 0 ? 1.2 : .4)}" y="17" width="${f0 === 0 && f === 0 ? 2.4 : .8}" height="66" fill="#fff" opacity="${f0 === 0 && f === 0 ? .7 : .22}"/>`;
  for (let q = 0; q < 6; q++) s += `<rect x="6" y="${20 + q * 12 - .3 - q * .08}" width="88" height="${.6 + q * .16}" fill="#fff" opacity=".3"/>`;
  for (let q = 0; q < 6; q++) for (let f = 0; f < 5; f++) { const pc = (OPEN[q] + f0 + f + 1) % 12, d = mod(pc - keyPc, 12); if (!iv.includes(d)) continue; const c = d === 0 ? '#FF2020' : col, x = 18 + f * 16, y = 20 + q * 12;
    s += `<circle cx="${x}" cy="${y}" r="6.2" fill="${c}" opacity=".22"/><circle cx="${x}" cy="${y}" r="3.7" fill="${c}"/><circle cx="${x - 1}" cy="${y - 1}" r="1.2" fill="#fff" opacity=".6"/>`; }
  return s;
}
const ledCol = (k) => ({ Blues:'#50BCFF', Rock:'#ff7a45', Pop:'#ff8ad0', Funk:'#FFCC00', 'Neo Soul':'#c58bff', Jazz:'#d4a84a', Metal:'#a1a1aa', Latin:'#ADFE00', Ambient:'#5eead4', Country:'#fbbf24', 'Thai Pop':'#f472b6', Reggae:'#4ade80' }[k] || '#50BCFF');
function cover(t, px, noLabel) {
  const k = CAT[t.cat] ? t.cat : 'Upload', h = hash(t.id), lbl = noLabel ? '' : `<span style="font-size:${Math.max(9, Math.round(px * .24))}px">${t.own ? 'MY' : keyLbl(t)}</span>`;
  if (S.art === 'led' && !t.own) return `<div class="cv" style="width:${px}px;height:${px}px;background:radial-gradient(circle at 30% 20%,${ledCol(k)}33,#101014 70%)"><svg viewBox="0 0 100 100">${ledArt(t.keyPc, t.scale, ledCol(k))}</svg>${lbl}</div>`;
  return `<div class="cv" style="width:${px}px;height:${px}px"><div class="art" style="background:${SCENE_BG[k]};filter:hue-rotate(${[-12, 0, 10][h % 3]}deg)${h % 2 ? ';transform:scaleX(-1)' : ''}"><svg viewBox="${[94, 100, 106][(h >>> 3) % 3]} 0 100 100" preserveAspectRatio="xMidYMid slice">${scene(k, h)}</svg></div><i class="shade"></i>${lbl}</div>`; }
function tileArt(c) { const h = hash(c.k);
  if (S.art === 'led') return `<div class="art" style="background:radial-gradient(circle at 80% 30%,${ledCol(c.k)}40,#101014 75%)"><svg viewBox="-110 0 210 100" preserveAspectRatio="xMaxYMid slice">${ledArt(9, c.sc[0], ledCol(c.k))}</svg></div><i class="shade"></i>`;
  return `<div class="art" style="background:${SCENE_BG[c.k]}"><svg viewBox="0 0 300 100" preserveAspectRatio="xMidYMid slice">${scene(c.k, h)}</svg></div><i class="shade"></i>` +
    (S.art === 'mascot' && MASCOT[c.k] ? `<div class="spr tspr" style="background-image:url('assets/chars/${MASCOT[c.k]}_idle.png')"></div>` : ''); }
function plCover(p, px) { const ts = p.tracks.map(findItem).filter(Boolean);
  if (ts.length >= 4 && (!p.cover || p.cover.auto !== false)) return `<div class="cv" style="width:${px}px;height:${px}px;display:grid;grid-template-columns:1fr 1fr">${ts.slice(0, 4).map(t => cover(t, px / 2, true)).join('')}</div>`;
  return artHTML(p.cover || { t:'icon', i:p.icon || 0 }, px); }

function trow(t, o) { o = o || {}; const fav = U.favs.includes(t.id);
  const st = t.own ? '<span class="pill y">AI analysed</span>' : (t.playable ? '<span class="pill g">Ready</span>' : (t.real ? '<span class="pill y">In production</span>' : '<span class="pill x">Demo entry</span>'));
  return `<div class="row" data-act="openTrack" data-v="${t.id}">${cover(t, 48)}<div class="ri"><div class="tt">${esc(t.title)}</div><div class="mm">${esc(metaLine(t))}</div>
    <div class="rp">${t.own ? '' : `<span class="pill ${t.level === 'Beginner' ? 'g' : 'b'}">${t.level}</span>`}${st}${U.scores && U.scores[t.id] && U.scores[t.id].total ? `<span class="pill y">🏆 ${U.scores[t.id].total.toLocaleString()}</span>` : ''}</div></div>
    <button class="ib ${fav ? 'on' : ''}" data-act="fav" data-v="${t.id}" aria-label="Favourite">${fav ? '♥' : '♡'}</button><button class="ib" data-act="${o.rm ? 'plRemove' : 'addTo'}" data-v="${t.id}" aria-label="${o.rm ? 'Remove' : 'Add to playlist'}">${o.rm ? '✕' : '⋯'}</button></div>`; }
const tcard = (t) => `<button class="card2" data-act="openTrack" data-v="${t.id}">${cover(t, 124)}<div class="tt">${esc(t.title)}</div><div class="mm">${t.playable ? '● Ready · ' : ''}${NOTE[t.keyPc]} ${esc(t.scale)} · ${t.bpm}</div></button>`;
const hrow = (title, items, f) => items.length ? `<div class="lbl">${title}${f ? `<button class="more" data-act="seeAll" data-f='${JSON.stringify(f)}'>See all ›</button>` : ''}</div><div class="hs">${items.slice(0, 12).map(tcard).join('')}</div>` : '';
const libTabs = () => `<div class="seg full"><button class="${S.lib.view !== 'mine' && S.lib.view !== 'playlist' ? 'on' : ''}" data-act="libTab" data-v="discover">Litejam Tracks</button><button class="${S.lib.view === 'mine' || S.lib.view === 'playlist' ? 'on' : ''}" data-act="libTab" data-v="mine">My Library</button></div>`;

function renderLibrary() {
  const v = S.lib.view;
  if (v === 'list') return renderList();
  if (v === 'mine') return renderMine();
  if (v === 'playlist') return renderPlaylist();
  renderDiscover();
}
function renderDiscover() {
  const n = CATALOG.length, cnt = (fn) => CATALOG.filter(fn).length, by = S.lib.browse;
  let tiles = '';
  if (by === 'cat') tiles = `<div class="tiles">${CATS.filter(c => cnt(t => t.cat === c.k)).map(c => `<button class="tile" data-act="browse" data-d="cat" data-v="${c.k}" >${tileArt(c)}<b>${c.k}</b><small>${cnt(t => t.cat === c.k).toLocaleString()} tracks</small></button>`).join('')}</div>`;
  else if (by === 'scale') tiles = `<div class="tiles">${Object.keys(STYPES).map(s => `<button class="tile flat" data-act="browse" data-d="scale" data-v="${s}"><b>♪ ${s}</b><small>${cnt(t => t.scale === s).toLocaleString()} tracks</small></button>`).join('')}</div>`;
  else if (by === 'level') tiles = `<div class="tiles">${['Beginner','Intermediate','Advanced'].map(s => `<button class="tile flat" data-act="browse" data-d="level" data-v="${s}"><b>${s}</b><small>${cnt(t => t.level === s).toLocaleString()} tracks</small></button>`).join('')}</div>`;
  else if (by === 'key') tiles = `<div class="tiles k4">${NOTE.map((s, i) => `<button class="tile flat" data-act="browse" data-d="key" data-v="${i}"><b>${s}</b><small>${cnt(t => t.keyPc === i)}</small></button>`).join('')}</div>`;
  else tiles = `<div class="tiles">${[['Slow','under 85 BPM'],['Medium','85–120 BPM'],['Fast','over 120 BPM']].map(s => `<button class="tile flat" data-act="browse" data-d="tempo" data-v="${s[0]}"><b>${s[0]}</b><small>${s[1]} · ${cnt(t => tempoBand(t.bpm) === s[0]).toLocaleString()}</small></button>`).join('')}</div>`;
  const recent = U.recent.map(findItem).filter(Boolean), pop = (a, b) => b.plays - a.plays;
  $('view').innerHTML = `<div class="pad" id="lib">${libTabs()}
    <button class="search" data-act="openSearch"><span>🔍</span>Search ${n.toLocaleString()} tracks, styles, scales…</button>
    ${hrow('Continue jamming', recent)}
    <div class="lbl">Browse by</div>
    <div class="chips" id="f-browse">${[['cat','Style'],['scale','Scale'],['level','Level'],['key','Key'],['tempo','Tempo']].map(b => `<button class="chip ${by === b[0] ? 'on' : ''}" data-act="browseBy" data-v="${b[0]}">${b[1]}</button>`).join('')}</div>
    ${tiles}
    ${hrow('Ready to play now', CATALOG.filter(t => t.playable), { ready:true })}
    ${hrow('New releases', CATALOG.filter(t => t.isNew).sort(pop), { isNew:true })}
    ${hrow('Beginner picks', CATALOG.filter(t => t.level === 'Beginner').sort(pop), { level:'Beginner' })}
    ${hrow('Slow tempo — easy to follow', CATALOG.filter(t => t.bpm < 85).sort(pop), { tempo:'Slow' })}
    <button class="search" data-act="seeAll" data-f='{}' style="justify-content:center;color:#fff">All ${n.toLocaleString()} tracks ›</button>
  </div>`;
}

/* ---- list view: search + filter chips + sort + windowed rows (only ~20 rows are in the DOM at any time) ---- */
function applyFilters() {
  const f = S.lib.f, qs = S.lib.q.trim().toLowerCase().split(/\s+/).filter(Boolean);      // every word must match (title, style, scale, key, level, id, BPM)
  LIST = CATALOG.filter(t => (!f.cat || t.cat === f.cat) && (!f.scale || t.scale === f.scale) && (!f.level || t.level === f.level) && (f.key == null || t.keyPc === f.key) && (!f.tempo || tempoBand(t.bpm) === f.tempo)
    && (!f.ready || t.playable) && (!f.isNew || t.isNew) && (!qs.length || (() => { const hay = (t.title + ' ' + t.cat + ' ' + NOTE[t.keyPc] + ' ' + t.scale + ' ' + t.level + ' ' + t.id + ' ' + t.bpm + ' bpm').toLowerCase(); return qs.every(w => hay.includes(w)); })()));
  const s = S.lib.sort; LIST.sort(s === 'az' ? (a, b) => a.title.localeCompare(b.title) : (s === 'bpm' ? (a, b) => a.bpm - b.bpm : (s === 'new' ? (a, b) => (b.isNew - a.isNew) || b.id.localeCompare(a.id) : (a, b) => (b.playable - a.playable) || b.plays - a.plays)));
}
function listChips() { const f = S.lib.f, any = Object.keys(f).some(k => f[k] != null && f[k] !== false);
  const c = (d, label, val) => `<button class="chip ${val != null && val !== false ? 'on' : ''}" data-act="filterOpen" data-v="${d}">${val != null && val !== false ? esc(String(val)) : label} ▾</button>`;
  return c('cat', 'Style', f.cat) + c('scale', 'Scale', f.scale) + c('level', 'Level', f.level) + c('key', 'Key', f.key != null ? NOTE[f.key] : null) + c('tempo', 'Tempo', f.tempo) +
    `<button class="chip ${f.ready ? 'on' : ''}" data-act="filterToggle" data-v="ready">Ready to play</button><button class="chip ${f.isNew ? 'on' : ''}" data-act="filterToggle" data-v="isNew">New</button>` +
    (any ? '<button class="chip" data-act="filterClear" style="color:var(--red)">✕ Clear</button>' : ''); }
const SORTS = { popular:'Popular', new:'Newest', bpm:'BPM', az:'A–Z' };
function listMeta() { $('lcount').innerHTML = `<span>${LIST.length.toLocaleString()} track${LIST.length === 1 ? '' : 's'}</span><button class="more" data-act="sortNext">↕ ${SORTS[S.lib.sort]}</button>`;
  $('vl').style.height = Math.max(LIST.length * ROWH, 10) + 'px'; $('empty').style.display = LIST.length ? 'none' : 'block'; VL = { first:-1, last:-1 }; vlRender(); }
function renderList() {
  applyFilters();
  $('view').innerHTML = `<div class="pad" id="lib" style="gap:10px"><div class="hd"><button class="back" data-act="libTab" data-v="discover">‹</button>
      <div class="sbox"><span>🔍</span><input id="q" type="search" placeholder="Search tracks, styles, scales, BPM…" value="${esc(S.lib.q)}" autocomplete="off"></div></div>
    <div class="fchips" id="fchips">${listChips()}</div><div class="lcount" id="lcount"></div>
    <div id="empty" class="sub" style="display:none;padding:28px 12px">No tracks match. Try fewer filters or another word.</div>
    <div id="vl" style="position:relative"><div id="vlin" style="position:absolute;left:0;right:0"></div></div></div>`;
  listMeta();
}
function vlRender(force) { const vl = $('vl'); if (!vl) return; const v = $('view'), top = v.scrollTop - vl.offsetTop;
  const first = Math.max(0, Math.floor(top / ROWH) - 4), last = Math.min(LIST.length, first + Math.ceil(v.clientHeight / ROWH) + 10);
  if (!force && first === VL.first && last === VL.last) return; VL = { first, last };
  $('vlin').style.top = first * ROWH + 'px'; $('vlin').innerHTML = LIST.slice(first, last).map(t => trow(t)).join(''); }
function refreshLib() { if (S.lib.view === 'list') { $('fchips').innerHTML = listChips(); applyFilters(); listMeta(); } else renderLibrary(); }

/* ---- My Library: uploads, playlists, favourites ---- */
function renderMine() {
  const ups = U.uploads.map(upItem), favs = U.favs.map(findItem).filter(Boolean);
  $('view').innerHTML = `<div class="pad" id="lib">${libTabs()}
    <button class="prof" data-act="avOpen" id="f-profile">${artHTML(U.profile.avatar, 52)}<div style="flex:1"><b>${esc(U.profile.name)}’s library</b><small>Tap to change your name or avatar</small></div><span class="chip">✎ Profile</span></button>
    <button class="own" data-act="upOpen" id="f-upload" style="background:none;text-align:left;width:100%">${icon('file_plus_icon', 26)}<div style="flex:1"><div style="font-size:14px;font-weight:700">Upload your own track</div><div style="font-size:11.5px;color:rgba(255,255,255,.5);margin-top:2px">AI finds the chords, key and beat. See what you get before you upload.</div></div><span style="color:var(--green)">›</span></button>
    ${ups.length ? `<div class="lbl">My uploads <small>${ups.length} of 5 on the free plan</small></div>` + ups.map(t => trow(t)).join('') : ''}
    <div class="lbl" id="f-playlists">Playlists <small>${U.playlists.length}</small></div>
    <div class="plgrid"><button class="pl" data-act="plNew"><div class="cv" style="width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:34px;color:var(--green);border:1.5px dashed var(--line);background:none">＋</div><div class="tt">New playlist</div><div class="mm">Name it your way</div></button>
      <button class="pl" data-act="plOpen" data-v="fav"><div class="cv" style="width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:44px;background:linear-gradient(135deg,#3b0a1e,#ff8ad0)">♥</div><div class="tt">Favourites</div><div class="mm">${favs.length} track${favs.length === 1 ? '' : 's'}</div></button>
      ${U.playlists.map(p => `<button class="pl" data-act="plOpen" data-v="${p.id}"><div class="plc">${plCover(p, 104)}</div><div class="tt">${esc(p.name)}</div><div class="mm">${p.tracks.length} track${p.tracks.length === 1 ? '' : 's'}</div></button>`).join('')}</div>
    ${hrow('Recently played', U.recent.map(findItem).filter(Boolean))}
  </div>`;
}
function renderPlaylist() {
  const isFav = S.lib.pid === 'fav', p = isFav ? { id:'fav', name:'Favourites', tracks:U.favs, icon:7 } : U.playlists.find(x => x.id === S.lib.pid);
  if (!p) { S.lib.view = 'mine'; return renderMine(); }
  const ts = p.tracks.map(findItem).filter(Boolean), mins = Math.round(ts.length * 1.1);
  $('view').innerHTML = `<div class="pad" id="lib"><div class="hd"><button class="back" data-act="libTab" data-v="mine">‹</button><div style="flex:1;font-size:13px;color:rgba(255,255,255,.5)">Playlist</div>
      ${isFav ? '' : `<button class="chip" data-act="plRename" data-v="${p.id}">✎ Rename</button><button class="chip" data-act="plDelete" data-v="${p.id}" style="color:var(--red)">Delete</button>`}</div>
    <div style="display:flex;gap:14px;align-items:center">${isFav ? `<div class="cv" style="width:96px;height:96px;display:flex;align-items:center;justify-content:center;font-size:44px;background:linear-gradient(135deg,#3b0a1e,#ff8ad0)">♥</div>` : plCover(p, 96)}
      <div style="flex:1;min-width:0"><div style="font-size:20px;font-weight:700;line-height:1.2">${esc(p.name)}</div><div class="mm" style="font-size:12px;color:rgba(255,255,255,.55);margin-top:4px">${ts.length} track${ts.length === 1 ? '' : 's'} · about ${mins} min per round</div>
        <button class="chip on" style="margin-top:10px" data-act="plPlay">▶ Play</button></div></div>
    ${ts.length ? ts.map(t => trow(t, { rm:!isFav })).join('') : '<div class="sub" style="padding:24px 12px">Empty for now. Open any track’s ⋯ menu and choose this playlist.</div>'}
    <button class="search" data-act="seeAll" data-f='{}' style="justify-content:center">＋ Add tracks from the library</button></div>`;
}
function plFinalName(raw, exceptId) { let name = (raw || '').trim().slice(0, 40) || 'My playlist ' + U.seq; const taken = (n) => U.playlists.some(p => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase());
  if (taken(name)) { let i = 2; while (taken(name + ' (' + i + ')')) i++; name = name + ' (' + i + ')'; } return name; }
function plHint() { const c = S.ctx, raw = (c.name || '').trim(), el = $('plHint'); if (!el) return;
  const fin = plFinalName(raw, c.id); $('plCount').textContent = (c.name || '').length + '/40';
  el.textContent = !raw ? 'Leave it empty and it is saved as “' + fin + '”.' : (fin !== raw ? 'You already have “' + raw + '” — this one is saved as “' + fin + '”.' : 'Shown on your playlist tile. You can rename it any time.');
  $('plSave').textContent = (c.mode === 'rename' ? 'Save' : 'Create') + ' “' + fin + '”'; }
function plSuggest() { const c = S.ctx, t = c.track && findItem(c.track), d = new Date(), out = [];
  if (t && !t.own) out.push(t.cat + ' jams', NOTE[t.keyPc] + ' ' + t.scale + ' practice', t.level + ' set');
  if (c.id) { const ts = (U.playlists.find(p => p.id === c.id) || { tracks:[] }).tracks.map(findItem).filter(Boolean), top = (k) => { const m = {}; ts.forEach(x => { m[x[k]] = (m[x[k]] || 0) + 1; }); return Object.keys(m).sort((a, b) => m[b] - m[a])[0]; };
    if (ts.length) out.push(top('cat') + ' jams', tempoBand(ts[0].bpm) + ' tempo set'); }
  return out.concat(['Warm-up', 'Daily practice', 'Weekend jam', 'Songs to learn', 'Practice · ' + d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]]).filter((x, i, a) => a.indexOf(x) === i).slice(0, 7); }
function sheetLib() {
  const c = S.ctx || {}; let h = '';
  if (S.sheet === 'filter') { const d = c.dim, f = S.lib.f, cnt = (fn) => CATALOG.filter(fn).length;
    const opts = d === 'cat' ? CATS.map(x => [x.k, x.k, cnt(t => t.cat === x.k)]) : d === 'scale' ? Object.keys(STYPES).map(x => [x, x, cnt(t => t.scale === x)]) : d === 'level' ? ['Beginner','Intermediate','Advanced'].map(x => [x, x, cnt(t => t.level === x)])
      : d === 'key' ? NOTE.map((x, i) => [i, x, cnt(t => t.keyPc === i)]) : [['Slow','Slow · under 85 BPM'],['Medium','Medium · 85–120 BPM'],['Fast','Fast · over 120 BPM']].map(x => [x[0], x[1], cnt(t => tempoBand(t.bpm) === x[0])]);
    h = `<h3>${{ cat:'Style', scale:'Scale', level:'Level', key:'Key', tempo:'Tempo' }[d]} <button data-act="closeSheet">✕</button></h3><div class="optgrid ${d === 'key' ? 'k4' : ''}">` +
      `<button class="chip ${f[d] == null ? 'on' : ''}" data-act="filterSet" data-v="">All</button>` + opts.filter(o => o[2]).map(o => `<button class="chip ${f[d] === o[0] ? 'on' : ''}" data-act="filterSet" data-v="${o[0]}">${o[1]} <em>${o[2].toLocaleString()}</em></button>`).join('') + '</div>'; }
  else if (S.sheet === 'addTo') { const t = findItem(c.track);
    h = `<h3>Add to playlist <button data-act="closeSheet">✕</button></h3><div style="display:flex;gap:10px;align-items:center">${cover(t, 44)}<div><div style="font-size:14px;font-weight:700">${esc(t.title)}</div><div style="font-size:11.5px;color:rgba(255,255,255,.55)">${esc(metaLine(t))}</div></div></div>
      <button class="ropt" data-act="plNew" data-v="${t.id}"><div class="cv" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--green);border:1.5px dashed var(--line);background:none">＋</div><div><div class="rt" style="color:#fff">New playlist</div><div class="rd">We suggest a name from this track</div></div></button>` +
      U.playlists.map(p => { const on = p.tracks.includes(t.id); return `<button class="ropt ${on ? 'on' : ''}" data-act="plToggle" data-v="${p.id}">${plCover(p, 40)}<div><div class="rt" style="color:#fff">${esc(p.name)}</div><div class="rd">${p.tracks.length} tracks</div></div><span class="rr" style="color:var(--green);font-weight:700">${on ? '✓ Added' : ''}</span></button>`; }).join(''); }
  else if (S.sheet === 'plName') {
    h = `<h3>${c.mode === 'rename' ? 'Rename playlist' : 'New playlist'} <button data-act="closeSheet">✕</button></h3>
      <div class="field"><label for="plName">Playlist name</label><div class="inp"><input id="plName" maxlength="40" placeholder="e.g. Blues practice" value="${esc(c.name || '')}" autocomplete="off"><span id="plCount">0/40</span></div><div class="hint" id="plHint"></div></div>
      <div><div class="flbl">Ideas — tap to use</div><div class="chips">${plSuggest().map(s => `<button class="chip" data-act="plSug" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>
      ${coverPicker(c)}
      <button class="cta" id="plSave" data-act="plSave">Create</button>`; }
  else if (S.sheet === 'upload') {
    const yes = [['Play along with your recording', 'Any MP3, WAV or M4A up to 10 minutes'], ['Chord timeline + NOW / NEXT', 'AI-detected — tap a chord to correct it'], ['Scale on the fretboard and LEDs', 'From the detected key; you can change key and scale'], ['Mixer with AI-separated stems', 'Drums / Bass / Other — quality depends on the recording'], ['A–B loop, slow-down, metronome, count-in', 'Slow-down 50–100 % on the detected beat grid'], ['Playlists and favourites', 'Name the track, add it to any playlist']];
    const no = [['Style mode', 'No clean tempo or key change — that needs the producer’s MIDI + samples'], ['Guide licks with LED + tab', 'Written and recorded only for Litejam Tracks'], ['Verified chords and loop points', 'A musician checks every Litejam Track; uploads rely on AI'], ['Leaderboard and scored runs', 'Scores come from verified licks'], ['Sharing', 'Uploads stay private to your account']];
    h = `<h3>Upload your own track <button data-act="closeSheet">✕</button></h3>` +
      (c.step ? `<div class="ropt on" style="cursor:default"><span style="font-size:22px">🎵</span><div><div class="rt" style="color:#fff">my-backing-track.mp3</div><div class="rd">3:24 · 7.8 MB · MP3 320 kbps</div></div><button class="more rr" data-act="upPick" data-v="0">Change</button></div>
        <div class="field"><label for="upName">Track name</label><div class="inp"><input id="upName" maxlength="40" value="${esc(c.name)}" autocomplete="off"><span id="upCount">${c.name.length}/40</span></div><div class="hint">Taken from the file name. This is how it appears in My Library and playlists.</div></div>
        <button class="chk" data-act="upOk"><i class="${c.ok ? 'on' : ''}">${c.ok ? '✓' : ''}</i><span>I own this recording or have the right to use it. It is for my personal practice and is not shared.</span></button>
        <button class="cta ${c.ok ? '' : 'dis'}" data-act="upAnalyze">Analyse track</button>`
        : `<button class="drop" data-act="upPick" data-v="1">${icon('file_plus_icon', 30)}<b>Choose a file</b><small>MP3, WAV, M4A · up to 10 min · 5 uploads on the free plan</small></button>`) +
      `<div class="cmp"><div class="flbl" style="color:var(--green)">What you get</div>${yes.map(x => `<div class="ci"><i class="y">✓</i><div><b>${x[0]}</b><small>${x[1]}</small></div></div>`).join('')}
        <div class="flbl" style="color:var(--yellow);margin-top:8px">Only on Litejam Tracks</div>${no.map(x => `<div class="ci"><i class="n">🔒</i><div><b>${x[0]}</b><small>${x[1]}</small></div></div>`).join('')}</div>
      <p>Prototype note: the demo file is “analysed” with LJ002’s audio so the screens can be tried. Real uploads are processed on the server.</p>`; }
  else if (S.sheet === 'chord') { const cur = D.chords[c.bar], Q = [['maj',''],['min','m'],['dom7','7'],['min7','m7'],['maj7','maj7']];
    h = `<h3>Fix chord · bar ${c.bar + 1} <button data-act="closeSheet">✕</button></h3><p>AI heard <b style="color:#fff">${cur.sym}</b> here. Pick the right chord — the fretboard and “Follow the chord” update at once.</p>
      <div class="flbl">Root</div><div class="bgrid" style="grid-template-columns:repeat(6,1fr)">${NOTE.map((n, i) => `<button class="${c.root === i ? 'a' : ''}" data-act="chordSet" data-k="root" data-v="${i}">${n}</button>`).join('')}</div>
      <div class="flbl">Type</div><div class="chips">${Q.map(q => `<button class="chip ${c.q === q[0] ? 'on' : ''}" data-act="chordSet" data-k="q" data-v="${q[0]}">${NOTE[c.root]}${q[1]}</button>`).join('')}</div>
      <div style="display:flex;gap:8px"><button class="cta" style="flex:1" data-act="chordSave" data-v="one">This bar only</button><button class="cta alt" style="flex:1" data-act="chordSave" data-v="all">Every “${cur.sym}” bar</button></div>`; }
  return h;
}

/* ================= profile · covers (icon / character / photo / avatar) · scored challenge · leaderboard ================= */
const CHARS = [['bank-apisak','Bank Apisak','#ADFE00'],['rockmaster','Rockmaster','#FF2020'],['pitchy-rock','Pitchy Rock','#ff8ad0'],['sebastian','Sebastian','#c58bff'],['crystal-power','Crystal Power','#5eead4'],['g-force-killerfish','G-Force Killerfish','#50BCFF'],['deadbeat','Deadbeat','#FFCC00'],['piarna','Piarna','#f472b6'],['punkman','Punkman','#ff3d9a','Alex Maybe']].map(c => ({ id:c[0], name:c[1], col:c[2], aka:c[3] }));
const NO_SLASH = { punkman:true };            // pixel_v2 delivery has idle / walk / attack / power; the Ultimate pose falls back to power
const REACT = { punkman:{ perfect:[100,300,110,110,80], good:[130,250,140,120], miss:[100,260,130,130], celebrate:[110,300,140,110,80] } };   // reactions_v3: one-shot sheets, frame durations in ms
const CHARMAP = Object.fromEntries(CHARS.map(c => [c.id, c])), POSES = ['idle','walk','attack','power'];
const LB_NAMES = ['RiffRanger','BluesCat','Nok_Guitar','SixStringSam','MintPick','TonePilot','FretFox','PentaQueen','LoopLizard','Khun_Solo','BendMaster','CapoKid','StrumBird','NeonNinja','VibratoVee','DropD_Dan','JamJelly','WahWahWin','Tapper_T','MuteMonk','PickPanda','SlideSiam','OctaveOwl','HammerOnHan','ChordChef','EchoEmi','FuzzFace_P','GrooveGoat','LickLord','TriadTiger'];
function artHTML(a, px) {                    // one renderer for playlist covers, profile pictures and leaderboard avatars
  if (!a) a = { t:'icon', i:0 };
  if (a.t === 'avatar') a = U.profile.avatar;
  const box = (inner, bg) => `<div class="cv" style="width:${px}px;height:${px}px;${bg}">${inner}</div>`;
  if (a.t === 'img') return box(`<img src="${a.src}" alt="">`, '');
  if (a.t === 'ico') return box(`<img src="${a.src}" alt="" class="fit">`, `background:linear-gradient(135deg,#2a2a2a,${PICONS[a.i || 0][1]}55)`);
  if (a.t === 'char') { const c = CHARMAP[a.id] || CHARS[0]; return box(`<div class="spr" style="background-image:url('assets/chars/${c.id}_${a.act || 'idle'}.png')"></div>`, `background:linear-gradient(160deg,${c.col}40,#15151b 72%)`); }
  const ic = PICONS[a.i || 0]; return box(ic[0], `background:linear-gradient(135deg,#2a2a2a,${ic[1]}55);display:flex;align-items:center;justify-content:center;font-size:${Math.round(px * .44)}px`);
}
const recentImgs = (k, act, cur) => (U.images || []).filter(im => im.k === k).map(im => `<button class="icn ${cur && cur.src === im.src ? 'on' : ''}" data-act="${act}" data-v="${im.id}">${artHTML({ t:im.k, src:im.src, i:cur && cur.i || 0 }, 36)}</button>`).join('');
const charGrid = (act, cur) => `<div class="chgrid">${CHARS.map(ch => { const on = cur && cur.t === 'char' && cur.id === ch.id; return `<button class="chb ${on ? 'on' : ''}" data-act="${act}" data-t="char" data-v="${ch.id}">${artHTML({ t:'char', id:ch.id, act: on ? cur.act : 'idle' }, 60)}<small>${ch.name}${ch.aka ? '<i>' + ch.aka + '</i>' : ''}</small></button>`; }).join('')}</div>`;
const poseRow = (act, cur) => cur && cur.t === 'char' ? `<div class="chips">${POSES.map(p => `<button class="chip ${(cur.act || 'idle') === p ? 'on' : ''}" data-act="${act}" data-v="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>` : '';
function coverPicker(c) {
  const cv = c.cover, tab = c.ctab || 'icon'; let body = '';
  if (tab === 'icon') body = `<div class="chips">${PICONS.map((ic, i) => `<button class="icn ${cv.t === 'icon' && cv.i === i ? 'on' : ''}" data-act="cvSet" data-t="icon" data-v="${i}" style="background:linear-gradient(135deg,#2a2a2a,${ic[1]}66)">${ic[0]}</button>`).join('')}${recentImgs('ico', 'cvImg', cv)}<button class="icn add" data-act="pickImage" data-v="ico" aria-label="Upload icon">＋</button></div><div class="hint">Tap ＋ to upload your own icon. A PNG or SVG with a transparent background works best.</div>`;
  else if (tab === 'char') body = charGrid('cvSet', cv) + poseRow('cvPose', cv) + '<div class="hint">Litejam Universe characters. They stay animated on your playlist tile.</div>';
  else if (tab === 'photo') body = `<div class="chips"><button class="icn add wide" data-act="pickImage" data-v="img">＋ Upload photo or GIF</button>${recentImgs('img', 'cvImg', cv)}</div><div class="hint">JPG, PNG and WebP are resized for you. GIFs up to 1 MB keep moving.</div>`;
  else body = `<div style="display:flex;gap:12px;align-items:center">${artHTML(U.profile.avatar, 64)}<div style="flex:1"><div style="font-size:14px;font-weight:700">${esc(U.profile.name)}</div><div class="hint" style="margin-top:2px">Uses your profile picture and follows it when you change your avatar.</div><button class="chip" data-act="avOpen" style="margin-top:8px">Change my avatar</button></div></div>`;
  return `<div><div class="flbl">Cover</div><div class="covrow">${artHTML(cv, 64)}<div class="seg">${[['icon','Icon'],['char','Character'],['photo','Photo / GIF'],['avatar','Avatar']].map(t => `<button class="${tab === t[0] ? 'on' : ''}" data-act="cvTab" data-v="${t[0]}">${t[1]}</button>`).join('')}</div></div>${body}
    <button class="chk" data-act="cvAuto" style="margin-top:10px"><i class="${cv.auto !== false ? 'on' : ''}">${cv.auto !== false ? '✓' : ''}</i><span>Switch to a collage of track artwork once the playlist has 4 tracks</span></button></div>`;
}
function onPickFile(e) {
  const f = e.target.files[0], kind = S.pickFor; e.target.value = ''; if (!f) return;
  if (!/^image\//.test(f.type)) return toast('Please choose an image file (JPG, PNG, GIF, WebP or SVG).');
  const done = (src, keep) => { const k = kind === 'ico' ? 'ico' : 'img';
    if (keep) U.images = [{ id:'im' + Date.now(), k, src }].concat(U.images || []).slice(0, 6);
    if (kind === 'avatar') U.profile.avatar = { t:'img', src }; else S.ctx.cover = { t:k, src, i: S.ctx.cover.i || 0, auto:false };
    if (!saveU()) toast('Shown for this session only — browser storage is full.'); renderSheet(); if (S.sheet === 'plName') plHint(); };
  const rd = new FileReader();
  if (f.type === 'image/gif') { if (f.size > 1e6) return toast('This GIF is ' + (f.size / 1e6).toFixed(1) + ' MB. Please use one under 1 MB.'); rd.onload = () => done(rd.result, false); return rd.readAsDataURL(f); }
  rd.onload = () => { const img = new Image(); img.onerror = () => toast('Could not read this image.');
    img.onload = () => { const max = kind === 'ico' ? 192 : 360, sc = Math.min(1, max / Math.max(img.width || max, img.height || max)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((img.width || max) * sc)); cv.height = Math.max(1, Math.round((img.height || max) * sc)); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      done(kind === 'ico' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', .86), true); };
    img.src = rd.result; };
  rd.readAsDataURL(f);
}

/* ---- All licks (…_Licks_All_Perf.wav) + Jam & Record on every lick (Pro view): the band loops the lick's bars, the mic records the player ---- */
const TAKES = {};                              // recorded takes per track (each remembers its lick), kept in memory for this session (prototype)
let REC = null;
const lk = (i) => (i === D.licks.length ? D.allLick : D.licks[i]);
const lkName = (i) => (i === D.licks.length ? 'All licks' : 'Lick ' + (i + 1));
function buildAllLick(p) {
  if (!p.licks.length || p.allLick) return; const a = p.licks[0], z = p.licks[p.licks.length - 1];
  p.allLick = { id:'All', all:true, startBar:a.startBar, endBar:z.endBar, startTick:a.startTick, endTick:z.endTick, chords:[], fretLow:Math.min(...p.licks.map(l => l.fretLow)), fretHigh:Math.max(...p.licks.map(l => l.fretHigh)),
    techniques:[...new Set([].concat(...p.licks.map(l => l.techniques)))], level:'Full solo', gp:a.gp.replace(/Lick0\d/, 'Licks_All'), notes:[].concat(...p.licks.map(l => l.notes)) };
}
const DUET = { LJ002:true };                    // tracks whose Call & response has an artist video to duet with. Mockup: only Classic Rock in Em, until the producer delivers real clips per lick
function jamPasses(l, mode) { return (S.lickOnce ? 1 : ROUNDS_MAX) * (mode === 'call' ? 2 : 1); }   // Once = one round. Loop = up to 5 rounds, or until the player stops
function jamStart(i, mode) {                    // record over lick i (Audio mode): one bar of count-in, then the lick's bars back to back.
  if (S.mode !== 'audio') return toast('Jam & Record uses the studio stems — switch to Audio mode.');
  if (AU.playing) stop();                       // 'call' = the original lick, then backing-only bars for the player · 'mine' = backing track only
  const go = (stream, vid) => { const rec = REC = { stream, chunks:[], mr:null }, l = lk(i), video = !!(stream && vid);
    if (stream) { try { rec.mr = new MediaRecorder(stream); rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); }; } catch (e) { rec.mr = null; } }
    S.jam = { state:'rec', lick:i, mode, passes:jamPasses(l, mode), video, duet:video && mode === 'call' && !!DUET[D.id] };
    S.challenge = null; S.lick = i; S.lickMode = mode; S.fb = 'lick'; S.loopKind = 'lick'; S.loop = { a:l.startTick, b:l.endTick }; AU.pausedTick = l.startTick;
    if (mode === 'call') S.ch.guide.mute = false; applyMix();
    updFretboard(true); updTimeline(); updTransport(); updLicks(); updMixer(); updDuet(); if (video) scrollToId('nowbar'); play({ forceCount:true }); };
  const fail = () => { toast('Microphone not available — saving a silent demo take so you can see the flow.'); go(null, false); };
  const AUD = { echoCancellation:false, noiseSuppression:false, autoGainControl:false }, md = navigator.mediaDevices;
  if (!(md && md.getUserMedia)) return fail();
  if (S.recVideo) md.getUserMedia({ audio:AUD, video:{ facingMode:'user' } }).then(st => go(st, true)).catch(() => { toast('Camera not available — recording audio only.'); md.getUserMedia({ audio:AUD }).then(st => go(st, false)).catch(fail); });
  else md.getUserMedia({ audio:AUD }).then(st => go(st, false)).catch(fail);
}
/* Video takes use a TikTok-duet layout in place of the stage: the player's camera on the left and, when the track has an artist clip for
   Call & response, the artist on the right (prototype: the coach character stands in for the artist's video). */
function updDuet() {
  const el = $('duet'), stg = $('now'); if (!el) return;
  const j = S.jam, on = !!(j && j.video);
  el.style.display = on ? '' : 'none'; if (stg) stg.style.display = on ? 'none' : '';
  if (!on) { el.innerHTML = ''; return; }
  const c = ST.cast || cast(), cat = CAT[trackCat()] || CAT.Upload; ST.lb = '~';
  el.innerHTML = `<div class="dpane"><video id="duetVid" playsinline ${j.state === 'rec' ? 'muted autoplay class="mirror"' : ''}></video><span class="dtag">You · ${esc(U.profile.name)}</span></div>` +
    (j.duet ? `<div class="dpane art"><div class="room"><i></i><i></i><i></i><b></b></div><div class="sp" id="duetSp" style="background-image:url('assets/chars/${c.coach}_idle.png')"></div>
      <span class="dchip" id="duetChip">👂 Listening</span><span class="dtag">Artist · ${esc(CHARMAP[c.coach].name)}</span><span class="dph">MOCKUP · artist video</span><u class="dprog"><u id="duetProg"></u></u></div>` : '') +
    `<div class="sbadge" id="duetBadge"></div>`;
  const v = $('duetVid');
  if (j.state === 'rec') { if (REC && REC.stream) { try { v.srcObject = REC.stream; } catch (e) {} } }
  else { v.src = j.url; j.audio = v; v.onended = () => { if (S.jam === j) stop(true); }; }
}
function jamArm(t0) {                           // called when playback is scheduled: start the recorder / the take exactly at the downbeat
  const d = Math.max(0, (t0 - AU.ctx.currentTime) * 1000), j = S.jam; if (!j) return;
  if (j.state === 'rec' && REC) REC.timer = setTimeout(() => { REC.started = performance.now(); if (REC.mr) { try { REC.mr.start(); } catch (e) {} } }, d);
  else if (j.state === 'play' && j.audio) j.timer = setTimeout(() => { j.audio.play().catch(() => {}); }, d);
}
function jamFinish(j) {
  if (j.state === 'play') { clearTimeout(j.timer); if (j.audio) j.audio.pause(); updDuet(); updLicks(); return; }
  const r = REC, tid = D.id; REC = null; updDuet(); if (!r) return; clearTimeout(r.timer); const dur = r.started ? (performance.now() - r.started) / 1000 : 0;
  const type = (r.mr && r.mr.mimeType) || (j.video ? 'video/webm' : 'audio/webm');
  const done = (url) => { if (r.stream) r.stream.getTracks().forEach(t => t.stop());
    if (dur < 1) { updLicks(); return toast('Take discarded — it was shorter than a second.'); }
    const list = TAKES[tid] = TAKES[tid] || [], tk = { id:'tk' + Date.now(), name:'Take ' + (list.filter(x => x.lick === j.lick).length + 1), url, dur, sim:!url, lick:j.lick, jmode:j.mode, video:!!(j.video && url), duet:!!j.duet, ext:/mp4/.test(type) ? 'mp4' : 'webm', mode:S.mode, bpm:S.bpm, tr:S.tr }; list.unshift(tk); updLicks();
    toast('Saved “' + tk.name + '” · ' + fmt(dur) + '. No score — this one is just for you.'); };
  if (r.mr && r.mr.state !== 'inactive') { r.mr.onstop = () => done(URL.createObjectURL(new Blob(r.chunks, { type }))); r.mr.stop(); } else done(null);
}
function lickCardPro(i, act) {                  // Pro view, same folded card as Normal: closed = one "Jam" button; open = mode, one red record button, two small options, takes
  const l = lk(i), all = i === D.licks.length, open = S.loopKind === 'lick' && S.lick === i, rec = !!(S.jam && S.jam.state === 'rec' && S.jam.lick === i), cur = S.jam && S.jam.state === 'play' ? S.jam.take : null, takes = (TAKES[D.id] || []).filter(t => t.lick === i);
  const armed = !S.jam && open && (S.lickMode === 'call' || S.lickMode === 'mine');
  const note = (S.lickMode === 'call' ? 'The original lick, then the same bars of backing track for your answer.' : 'Backing track only.') + (S.recVideo && S.lickMode === 'call' && DUET[D.id] ? ' On video the artist appears beside you.' : '');
  return `<div class="lick s ${open ? 'on' : ''}"${all ? ' id="f-all"' : ''}>
    <div class="lrow"><div class="lno ${all ? 'all' : ''}">${all ? '★' : i + 1}</div>
      <div class="li"><div class="t">${lkName(i)}</div><div class="m">${all ? 'The whole solo' : l.level} · bars ${l.startBar}–${l.endBar} · ${l.notes.length} notes</div></div>
      ${takes.length && !open ? `<button class="bestb tk" data-act="lickOpen" data-v="${i}" aria-label="Show ${takes.length} takes">${takes.some(t => t.video) ? '🎥' : '🎙'} ${takes.length}</button>` : ''}
      ${open ? '<button class="abtn stop" data-act="lickStop">✕ Done</button>' : `<button class="abtn go" data-act="lickPractice" data-v="${i}" data-m="call">▶ Jam</button>`}</div>
    ${!open ? '' : `<div class="steps">${act(i, 'call')}${act(i, 'mine')}</div>
      <div class="stepcap">${note}</div>
      ${S.mode !== 'audio' ? '' : (rec ? '<button class="abtn rec on" data-act="play">■ Stop & save take</button>' : `<button class="abtn rec ${armed ? 'armed' : ''}" data-act="jamRec" data-v="${i}">● Jam & Record</button>`)}
      <div class="popt"><div class="seg"><button class="${S.lickOnce ? '' : 'on'}" data-act="passMode" data-v="loop">${icon('loop_icon', 12)} Loop ×${ROUNDS_MAX}</button><button class="${S.lickOnce ? 'on' : ''}" data-act="passMode" data-v="once">1× Once</button></div>
        <div class="seg"><button class="${S.recVideo ? '' : 'on'}" data-act="recType" data-v="audio">🎙 Audio</button><button class="${S.recVideo ? 'on' : ''}" data-act="recType" data-v="video">🎥 Video</button></div></div>
      ${S.mode !== 'audio' ? '' : takes.map(tk => `<div class="take"><button class="ib ${cur === tk.id ? 'on' : ''}" data-act="${cur === tk.id ? 'play' : 'takePlay'}" data-v="${tk.id}">${cur === tk.id ? '■' : '▶'}</button><div class="ri"><div class="tt">${esc(tk.name)}</div><div class="mm">${tk.video ? '🎥' : '🎙'} ${fmt(tk.dur)} · ${tk.jmode === 'call' ? 'Call & response' : 'My turn'}${tk.duet ? ' · duet' : ''}${tk.sim ? ' · silent demo take' : ''} · kept until you reload</div></div>
        ${tk.url ? `<a class="ib" href="${tk.url}" download="${D.id}_${lkName(i).replace(/\s+/g, '')}_${esc(tk.name).replace(/\s+/g, '')}.${tk.ext || 'webm'}" aria-label="Save file">⬇</a>` : ''}<button class="ib" data-act="takeRename" data-v="${tk.id}" aria-label="Rename">✎</button><button class="ib" data-act="takeDel" data-v="${tk.id}" aria-label="Delete">✕</button></div>`).join('')}`}</div>`;
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
      ${[['#ff2020', 'Root note'], ['#3b82f6', 'Scale note'], ['#ffffff', 'Target: chord tone of the current chord'], ['#8dff1a', 'Lick: play this note now'], ['#ffb000', 'Lick: next note · blue note in Blues'], ['#123a70', 'Lick: the other notes of the lick (dim)']].map(c => `<div class="ci"><i style="width:12px;height:12px;border-radius:50%;background:${c[0]};margin-top:3px"></i><div><b style="font-weight:400">${c[1]}</b></div></div>`).join('')}</div>
    <div style="display:flex;gap:8px"><button class="cta alt" style="flex:1" data-act="bleTest">Test: light frets 0–12</button><button class="cta alt" style="flex:1" data-act="bleClear">LEDs off</button></div>
    <button class="cta alt" data-act="bleDisconnect" style="color:var(--red)">Disconnect</button>`;
  return h + `<p>Connect a real Litejam guitar and its fretboard LEDs follow this screen: scales, chord tones, target notes and the lick notes in time with the track.</p>
    <div class="cmp">${[['1', 'Switch the guitar on'], ['2', 'Close the Litejam app on your phone — the guitar accepts one connection at a time'], ['3', 'Tap Connect and pick your guitar in the browser’s list']].map(x => `<div class="ci"><i class="y">${x[0]}</i><div><b style="font-weight:400">${x[1]}</b></div></div>`).join('')}</div>
    ${BLE.err ? `<p style="color:var(--red)">${esc(BLE.err)}</p>` : ''}
    <button class="cta ${BLE.state === 'connecting' ? 'dis' : ''}" data-act="bleConnect">${BLE.state === 'connecting' ? 'Connecting…' : 'Connect guitar'}</button>
    <p>Uses Web Bluetooth: Chrome or Edge on a computer or Android phone. iPhone and iPad browsers cannot connect.</p>`;
}
function initBle() {
  updBle();
  Object.assign(ACT, {
    bleOpen: () => { S.ctx = {}; openSheet('ble'); },
    bleConnect: () => { if (BLE.state === 'off') bleConnect(); },
    bleDisconnect: () => { try { bleWrite(LED_CLEAR.slice(), true); } catch (e) {} const d = BLE.dev; setTimeout(() => { try { if (d && d.gatt.connected) d.gatt.disconnect(); } catch (e) {} }, 250); },
    bleSync: () => { BLE.sync = !BLE.sync; ledSync(true); renderSheet(); },
    bleTest: () => { const items = []; for (let f = 0; f <= 12; f++) for (let s = 0; s < 6; s++) items.push({ s, f, c: f % 2 ? [0, 110, 255] : [110, 255, 0] }); bleWrite(ledPayload(items), true); setTimeout(() => { if (S.sheet === 'ble') renderSheet(); }, 400); },
    bleClear: () => { bleWrite(LED_CLEAR.slice(), true); setTimeout(() => { if (S.sheet === 'ble') renderSheet(); }, 400); },
  });
}

/* ---- leaderboard: demo data today; real scores need note detection on the guitar + an account backend ---- */
const lbMax = (tid) => (DATA.packs[tid] ? DATA.packs[tid].licks.length : 3) * 1000;
function boardFor(tid, scope, sp) {             // one board per speed preset (sp: 'slow' | 'med' | 'full')
  sp = sp || 'full'; const r = rng(hash(tid + ':' + scope + (sp === 'full' ? '' : ':' + sp))), max = lbMax(tid), n = scope === 'friends' ? 7 : 30, off = Math.floor(r() * LB_NAMES.length), rows = [];
  for (let i = 0; i < n; i++) { const fall = scope === 'friends' ? .06 : .021, s = Math.round(max * Math.max(.2, (scope === 'week' ? .955 : .985) - i * fall - r() * .012) / 5) * 5;
    rows.push({ name:LB_NAMES[(off + i * 7) % LB_NAMES.length], score:s, acc:Math.round(s / max * 100), av: r() < .72 ? { t:'char', id:CHARS[1 + Math.floor(r() * (CHARS.length - 1))].id, act: r() < .5 ? 'idle' : 'power' } : { t:'icon', i:Math.floor(r() * PICONS.length) } }); }
  const me = scoreOf(tid, sp);
  if (me && me.total) rows.push({ name:U.profile.name, score:me.total, acc:0, done:Object.keys(me.licks).length + ' of ' + (max / 1000) + ' licks scored', av:{ t:'avatar' }, me:true });
  rows.sort((a, b) => b.score - a.score); rows.forEach((x, i) => { x.rank = i + 1; }); return rows;
}
const myRank = (tid, scope, sp) => { const m = boardFor(tid, scope, sp).find(x => x.me); return m ? m.rank : null; };
const lbRow = (x) => `<div class="lbr ${x.me ? 'me' : ''}"><span class="rk">${x.rank}</span>${artHTML(x.av, 34)}<div class="ri"><div class="tt">${esc(x.name)}${x.me ? ' <em>you</em>' : ''}</div><div class="mm">${x.done || x.acc + '% accuracy'}</div></div><b>${x.score.toLocaleString()}</b></div>`;
function updBoard() {                           // scores and the leaderboard belong to Normal view; Pro is free practice
  const el = $('f-board'); if (!el) return; if (D.own || !D.licks.length || S.pro) { el.innerHTML = ''; return; }
  if (!scoreSp()) { el.innerHTML = `<button class="lbmini" data-act="boardOpen">${artHTML({ t:'avatar' }, 30)}<div class="ri">Custom is practice only — scores count at <b>Slow</b>, <b>Medium</b> or <b>Full</b></div><span>🏆 Leaderboard ›</span></button>`; return; }
  const sp = scoreSp() || 'full', me = boardFor(D.id, 'week', sp).find(x => x.me);
  el.innerHTML = `<button class="lbmini" data-act="boardOpen">${artHTML(me ? me.av : { t:'avatar' }, 30)}<div class="ri">${me ? `<b>${SPLBL[sp]}</b> · you are <b>#${me.rank}</b> this week · <b class="pts">${me.score.toLocaleString()}</b>` : `Play a lick for score to join the <b>${SPLBL[sp]}</b> leaderboard`}</div><span>🏆 Leaderboard ›</span></button>`;
}
function finishChallenge() {
  const i = S.challenge, tid = D.id, sg = AU.segs[AU.segs.length - 1];
  if (HIT.lick !== i || HIT.seg !== sg) hitReset(sg, i); hitUpTo(Infinity);                    // judge the notes the frame loop has not reached yet
  const one = (k) => { const hs = HIT.seq.filter((h, x) => HIT.owner[x] === k), ok = hs.filter(h => h.j !== 'm');          // stand-in for note detection: the same judgements the stage showed
    return { acc:Math.round(ok.length / hs.length * 100), timing: ok.length ? Math.round(ok.reduce((a, h) => a + Math.abs(h.ms), 0) / ok.length) : 0, score:Math.min(1000, Math.round(hs.reduce((a, h) => a + h.pts, 0) / 5) * 5) }; };
  S.challenge = null; stop(); AU.pausedTick = S.loop ? S.loop.a : 0;
  const sp = scoreSp() || 'full', before = myRank(tid, 'week', sp);              // the run is filed under the speed preset it was played at
  const s = scoreOf(tid, sp, true); let ctx;
  if (i === D.licks.length) { const parts = D.licks.map((x, k) => one(k)), sum = parts.reduce((a, p) => a + p.score, 0), prev = s.allBest || 0;      // full solo: every lick is scored in the same take
    parts.forEach((p, k) => { if (p.score > (s.licks[k] || 0)) s.licks[k] = p.score; }); if (sum > prev) s.allBest = sum;
    ctx = { lick:i, parts, score:sum, max:parts.length * 1000, acc:Math.round(parts.reduce((a, p) => a + p.acc, 0) / parts.length), timing:Math.round(parts.reduce((a, p) => a + p.timing, 0) / parts.length), best:sum > prev, prev };
  } else { const p = one(i), prev = s.licks[i] || 0; if (p.score > prev) s.licks[i] = p.score; ctx = { lick:i, score:p.score, max:1000, acc:p.acc, timing:p.timing, best:p.score > prev, prev }; }
  s.total = Object.values(s.licks).reduce((a, b) => a + b, 0); saveU(); updLicks(); updBoard(); hudTick(false);
  S.ctx = Object.assign(ctx, { sp, total:s.total, before, after:myRank(tid, 'week', sp), combo:HIT.best }); openSheet('result');
}
function sheetSocial() {
  const c = S.ctx || {}; let h = '';
  if (S.sheet === 'avatar') { const av = U.profile.avatar;
    h = `<h3>Your profile <button data-act="avDone">✕</button></h3>
      <div style="display:flex;gap:12px;align-items:center">${artHTML(av, 72)}<div class="field" style="flex:1"><label for="avName">Display name</label><div class="inp"><input id="avName" maxlength="20" value="${esc(U.profile.name)}" autocomplete="off"></div></div></div>
      <div><div class="flbl">Litejam Universe character</div>${charGrid('avSet', av)}${poseRow('avPose', av)}</div>
      <div><div class="flbl">Or your own picture</div><div class="chips"><button class="icn add wide" data-act="pickImage" data-v="avatar">＋ Upload photo or GIF</button>${recentImgs('img', 'avImg', av)}</div>
        <div class="hint">Shown on leaderboards, in My Library and on playlists that use “Avatar” as their cover.</div></div>
      <button class="cta" data-act="avDone">Done</button>`; }
  else if (S.sheet === 'board') { const scope = c.scope || 'week', sp = c.sp || 'full', rows = boardFor(D.id, scope, sp), me = rows.find(x => x.me), top = rows.slice(0, 3), pod = [top[1], top[0], top[2]].filter(Boolean);
    h = `<h3>🏆 Leaderboard <button data-act="closeSheet">✕</button></h3>
      <div style="display:flex;gap:10px;align-items:center">${cover(findItem(D.id), 40)}<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700">${esc(D.title)}</div><div style="font-size:11.5px;color:rgba(255,255,255,.55)">Best score of each lick, added up · max ${lbMax(D.id).toLocaleString()}</div></div></div>
      <div class="seg full">${['slow', 'med', 'full'].map(v => `<button class="${sp === v ? 'on' : ''}" data-act="boardSp" data-v="${v}">${SPLBL[v]} · ${simpleBpm(v)} BPM</button>`).join('')}</div>
      <div class="seg full">${[['week','This week'],['all','All time'],['friends','Friends']].map(t => `<button class="${scope === t[0] ? 'on' : ''}" data-act="boardScope" data-v="${t[0]}">${t[1]}</button>`).join('')}</div>
      <div class="podium">${pod.map(x => `<div class="pd p${x.rank} ${x.me ? 'me' : ''}">${artHTML(x.av, x.rank === 1 ? 76 : 60)}<span class="medal">${['🥇','🥈','🥉'][x.rank - 1]}</span><div class="tt">${esc(x.name)}</div><b>${x.score.toLocaleString()}</b></div>`).join('')}</div>
      <div style="display:flex;flex-direction:column;gap:6px">${rows.slice(3, 10).map(lbRow).join('')}${me && me.rank > 10 ? '<div class="lbgap">⋯</div>' + lbRow(me) : ''}</div>
      ${me ? '' : `<div class="lbr me">${artHTML({ t:'avatar' }, 34)}<div class="ri"><div class="tt">${esc(U.profile.name)} <em>you</em></div><div class="mm">No score yet. Take a 🏆 Scored run on any lick to enter.</div></div></div>`}
      <p>Demo data. Real scores need note detection on the guitar and a Litejam account. One leaderboard per speed preset (Slow, Medium, Full) in the original key, so everyone on a board plays the same challenge. Custom tempo or key is practice only.</p>`; }
  else if (S.sheet === 'takeName') h = `<h3>Rename take <button data-act="closeSheet">✕</button></h3><div class="field"><label for="tkName">Take name</label><div class="inp"><input id="tkName" maxlength="30" value="${esc(c.name)}" autocomplete="off"></div><div class="hint">Only you can see and hear your takes.</div></div><button class="cta" data-act="takeSave">Save</button>`;
  else if (S.sheet === 'result') { const stars = c.score >= c.max * .85 ? 3 : (c.score >= c.max * .7 ? 2 : 1);
    h = `<h3>${lkName(c.lick)} · scored run · ${SPLBL[c.sp || 'full']} <button data-act="closeSheet">✕</button></h3>
      <div class="resbox">${artHTML({ t:'avatar' }, 72)}<div><div class="big">${c.score.toLocaleString()}</div><div class="stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></div>${c.best ? `<span class="pill g">New personal best${c.prev ? ' · +' + (c.score - c.prev) : ''}</span>` : `<span class="pill x">Best stays ${c.prev}</span>`}</div></div>
      <div class="statrow"><div><b>${c.acc}%</b><small>Notes hit</small></div><div><b>±${c.timing} ms</b><small>Timing</small></div><div><b>${c.total.toLocaleString()}</b><small>Track total</small></div><div><b>#${c.after}</b><small>${c.before && c.before !== c.after ? 'was #' + c.before : 'This week'}</small></div></div>
      ${c.parts ? `<div class="chips" style="justify-content:center">${c.parts.map((p, k) => `<span class="chip">Lick ${k + 1} · <b style="color:var(--yellow)">${p.score}</b></span>`).join('')}</div>` : ''}
      <div style="display:flex;gap:8px"><button class="cta alt" style="flex:1" data-act="challenge" data-v="${c.lick}">Try again</button><button class="cta" style="flex:1" data-act="boardOpen">Leaderboard</button></div>
      <p>Demo score. In the app the guitar listens to every note: right pitch and right time earn points, bends and vibrato are checked on the notes that have them.</p>`; }
  return h;
}
function initSocial() {
  if (!U.profile) U.profile = { name:'Bank', avatar:{ t:'char', id:'bank-apisak', act:'idle' } };
  U.images = U.images || []; U.scores = U.scores || {};
  $('filePick').addEventListener('change', onPickFile);
  document.addEventListener('input', (e) => { if (e.target.id === 'avName') { U.profile.name = e.target.value.trim() || 'Player'; saveU(); } else if (e.target.id === 'tkName') S.ctx.name = e.target.value; });
  const reSheet = () => { renderSheet(); if (S.sheet === 'plName') plHint(); };
  Object.assign(ACT, {
    cvTab: (d) => { S.ctx.ctab = d.v; if (d.v === 'avatar') S.ctx.cover = { t:'avatar', auto:false }; reSheet(); },
    cvSet: (d) => { S.ctx.cover = d.t === 'char' ? { t:'char', id:d.v, act:'idle', auto:false } : { t:'icon', i:+d.v, auto:false }; reSheet(); },
    cvPose: (d) => { S.ctx.cover.act = d.v; reSheet(); },
    cvImg: (d) => { const im = U.images.find(x => x.id === d.v); if (im) S.ctx.cover = { t:im.k, src:im.src, i:S.ctx.cover.i || 0, auto:false }; reSheet(); },
    cvAuto: () => { S.ctx.cover.auto = S.ctx.cover.auto === false; reSheet(); },
    pickImage: (d) => { S.pickFor = d.v; $('filePick').click(); },
    avOpen: () => { const ret = S.sheet === 'plName' ? S.ctx : null; S.ctx = { ret }; openSheet('avatar'); },
    avSet: (d) => { U.profile.avatar = { t:'char', id:d.v, act:'idle' }; saveU(); renderSheet(); },
    avPose: (d) => { U.profile.avatar.act = d.v; saveU(); renderSheet(); },
    avImg: (d) => { const im = U.images.find(x => x.id === d.v); if (im) { U.profile.avatar = { t:'img', src:im.src }; saveU(); renderSheet(); } },
    avDone: () => { const ret = S.ctx && S.ctx.ret; if (ret) { S.ctx = ret; S.sheet = 'plName'; renderSheet(); plHint(); } else { closeSheet(); if (S.screen === 'library') renderLibrary(); else { updBoard(); updStage(); updMixer(); frame(true); } } },
    boardOpen: () => { S.ctx = { scope:'week', sp:(S.ctx && S.sheet === 'result' && S.ctx.sp) || scoreSp() || 'full' }; openSheet('board'); },
    boardSp: (d) => { S.ctx.sp = d.v; renderSheet(); },
    boardScope: (d) => { S.ctx.scope = d.v; renderSheet(); },
    challenge: (d) => { closeSheet(); if (S.pro) return; if (!scoreSp()) return ACT.scoreHint(); S.challenge = +d.v; startLick(+d.v, 'mine'); toast('Scored run · ' + SPLBL[scoreSp()] + ': play ' + lkName(+d.v).toLowerCase().replace('lick', 'Lick').replace('all Licks', 'all licks') + ' once after the count-in.'); },
    jamRec: (d) => { const i = +d.v, m = d.m || (S.loopKind === 'lick' && S.lick === i && (S.lickMode === 'call' || S.lickMode === 'mine') ? S.lickMode : null);   // records the mode chosen on that card
      if (!m) return toast('Open ' + lkName(i) + ' and choose Call & response or My turn first.'); jamStart(i, m); },
    takePlay: (d) => { const tk = (TAKES[D.id] || []).find(x => x.id === d.v); if (!tk) return; if (AU.playing) stop();          // replay a take with the band, at the mode / tempo / key it was recorded in
      if (S.mode !== tk.mode) setMode(tk.mode); S.bpm = tk.bpm; S.tr = tk.tr; const l = lk(tk.lick), a = tk.url && !tk.video ? new Audio(tk.url) : null; S.lickMode = tk.jmode; if (tk.jmode === 'call') { S.ch.guide.mute = false; applyMix(); updMixer(); }
      S.challenge = null; S.lick = tk.lick; S.fb = 'lick'; S.loopKind = 'lick'; S.loop = { a:l.startTick, b:l.endTick }; AU.pausedTick = l.startTick;
      if (a) a.onended = () => { if (S.jam && S.jam.take === tk.id) stop(true); };
      S.jam = { state:'play', take:tk.id, audio:a, url:tk.url, video:!!tk.video, duet:!!tk.duet, lick:tk.lick, mode:tk.jmode, passes:Math.max(1, Math.ceil(tk.dur / ((l.endTick - l.startTick) / tps()) - 0.02)) };
      updHeader(); updFretboard(true); updTimeline(); updTransport(); updLicks(); updDuet(); if (tk.video) scrollToId('nowbar'); play({ noCount:true }); if (!tk.url) toast('Silent demo take — only the band plays.'); },
    takeRename: (d) => { const tk = (TAKES[D.id] || []).find(x => x.id === d.v); if (!tk) return; S.ctx = { id:tk.id, name:tk.name }; openSheet('takeName'); },
    takeSave: () => { const tk = (TAKES[D.id] || []).find(x => x.id === S.ctx.id); if (tk) tk.name = (S.ctx.name || '').trim() || tk.name; closeSheet(); updLicks(); },
    takeDel: (d) => { const l = TAKES[D.id] || [], tk = l.find(x => x.id === d.v); if (!tk) return; if (S.jam && S.jam.take === tk.id) stop(); if (tk.url) URL.revokeObjectURL(tk.url); TAKES[D.id] = l.filter(x => x !== tk); updLicks(); toast('Take deleted.'); },
  });
}

/* ---- own upload: a reduced track pack (no Style mode, no licks) ---- */
function makeUploadPack(u) { const b = DATA.packs.LJ002, minor = u.minor !== false;
  return { id:u.id, own:true, mediaId:'LJ002', title:u.name, timeSig:'4/4', bpm:110, ppq:480, ticksPerBar:1920, beatTicks:480, bars:16, endTick:30720, keyPc:u.keyPc, keySuffix: minor ? ' minor' : ' major',
    loop:{ a:0, b:30720 }, loopName:'Whole track', loopNote:'Repeats the whole upload. Use A–B below for a shorter section.', sections:[{ from:1, to:16, name:'AI BEAT GRID' }],
    channels:[['drums','Drums','AI-separated stem'],['bass','Bass','AI-separated stem'],['harmony','Other','AI-separated stem']],
    scales: minor ? [['pentMinor','Suggested','The safe choice for the detected key.'],['natMinor','Intermediate','All 7 notes of the detected key.'],['follow','Advanced','Follows the AI-detected chords — fix wrong chords first.']]
                  : [['pentMajor','Suggested','The safe choice for the detected key.'],['major','Intermediate','All 7 notes of the detected key.'],['follow','Advanced','Follows the AI-detected chords — fix wrong chords first.']],
    followName:'Chord pentatonics', chords:u.chords || JSON.parse(JSON.stringify(b.chords)), licks:[], style:[], sampleMap:null, files:{} }; }
function ownSave() { const u = U.uploads.find(x => x.id === D.id); if (!u) return; u.keyPc = D.keyPc; u.minor = D.keySuffix === ' minor'; u.chords = D.chords; saveU(); }
function runAnalysis(name) {
  const st = ['Uploading file', 'Separating stems', 'Detecting beats & tempo', 'Detecting chords & key'], dur = [700, 1300, 900, 1100], total = dur.reduce((a, b) => a + b, 0); let el = 0;
  const draw = () => { let acc = 0, cur = st.length; for (let i = 0; i < dur.length; i++) { acc += dur[i]; if (el < acc) { cur = i; break; } }
    $('anList').innerHTML = st.map((s, i) => `<div class="${i < cur ? 'done' : (i === cur ? 'act' : '')}"><i>${i < cur ? '✓' : i + 1}</i>${s}</div>`).join(''); $('anBar').style.width = Math.min(100, el / total * 100) + '%'; };
  $('anName').textContent = name; $('anOvl').classList.add('show'); draw();
  const iv = setInterval(() => { el += 100; draw(); if (el >= total + 300) { clearInterval(iv); $('anOvl').classList.remove('show');
    const u = { id:'MY' + (U.upSeq++), name, keyPc:4, minor:true }; U.uploads.unshift(u); DATA.packs[u.id] = makeUploadPack(u); U.recent = [u.id].concat(U.recent).slice(0, 12); saveU();
    setTrack(u.id); renderNotes(); openPlayer(); toast('Analysis done — E minor, 110 BPM, 16 bars. Check the chords and fix any that look wrong.'); } }, 100);
}
function initLibrary() {
  buildCatalog(); U.uploads.forEach(u => { DATA.packs[u.id] = makeUploadPack(u); });
  $('view').addEventListener('scroll', () => { if (S.tab === 'track' && S.screen === 'library' && S.lib.view === 'list') vlRender(); });
  document.addEventListener('input', (e) => { const id = e.target.id;
    if (id === 'q') { S.lib.q = e.target.value; applyFilters(); $('view').scrollTop = 0; listMeta(); }
    else if (id === 'plName') { S.ctx.name = e.target.value; plHint(); }
    else if (id === 'upName') { S.ctx.name = e.target.value; $('upCount').textContent = e.target.value.length + '/40'; } });
  const openSheetCtx = (kind, ctx) => { S.ctx = ctx; openSheet(kind); if (kind === 'plName') { plHint(); const i = $('plName'); if (i) setTimeout(() => i.focus(), 60); } };
  Object.assign(ACT, {
    openTrack: (d) => { const t = findItem(d.v); if (!t) return;
      if (!DATA.packs[t.id]) return toast(t.real ? t.id + ' is in production — LJ001 and LJ002 are ready to play.' : 'Placeholder entry — the demo catalogue shows how browsing works with 1,200 tracks.');
      U.recent = [t.id].concat(U.recent.filter(x => x !== t.id)).slice(0, 12); saveU(); if (D.id !== t.id) { setTrack(t.id); renderNotes(); } openPlayer(); },
    libTab: (d) => { S.lib.view = d.v; S.lib.q = ''; S.lib.f = {}; renderLibrary(); $('view').scrollTop = 0; },
    browseBy: (d) => { S.lib.browse = d.v; const y = $('view').scrollTop; renderDiscover(); $('view').style.scrollBehavior = 'auto'; $('view').scrollTop = y; $('view').style.scrollBehavior = ''; },
    browse: (d) => { if (S.screen === 'player') { stop(); S.screen = 'library'; } S.lib.f = {}; S.lib.f[d.d] = d.d === 'key' ? +d.v : d.v; S.lib.q = ''; S.lib.view = 'list'; renderLibrary(); $('view').scrollTop = 0; },
    seeAll: (d) => { S.lib.f = JSON.parse(d.f || '{}'); S.lib.q = ''; S.lib.view = 'list'; renderLibrary(); $('view').scrollTop = 0; },
    openSearch: () => { S.lib.f = {}; S.lib.q = ''; S.lib.view = 'list'; renderLibrary(); $('view').scrollTop = 0; setTimeout(() => { const i = $('q'); if (i) i.focus(); }, 60); },
    filterOpen: (d) => openSheetCtx('filter', { dim:d.v }),
    filterSet: (d) => { const k = S.ctx.dim; if (d.v === '') delete S.lib.f[k]; else S.lib.f[k] = k === 'key' ? +d.v : d.v; closeSheet(); $('view').scrollTop = 0; refreshLib(); },
    filterToggle: (d) => { S.lib.f[d.v] = !S.lib.f[d.v]; $('view').scrollTop = 0; refreshLib(); },
    filterClear: () => { S.lib.f = {}; $('view').scrollTop = 0; refreshLib(); },
    sortNext: () => { const k = Object.keys(SORTS); S.lib.sort = k[(k.indexOf(S.lib.sort) + 1) % k.length]; $('view').scrollTop = 0; refreshLib(); },
    fav: (d) => { const on = U.favs.includes(d.v); U.favs = on ? U.favs.filter(x => x !== d.v) : [d.v].concat(U.favs); saveU(); if (S.screen === 'player') updLicks(); else if (S.lib.view === 'list') vlRender(true); else renderLibrary(); toast(on ? 'Removed from Favourites' : 'Added to Favourites'); },
    addTo: (d) => openSheetCtx('addTo', { track:d.v }),
    plToggle: (d) => { const p = U.playlists.find(x => x.id === d.v), t = S.ctx.track, on = p.tracks.includes(t); p.tracks = on ? p.tracks.filter(x => x !== t) : p.tracks.concat([t]); saveU(); renderSheet(); toast(on ? 'Removed from “' + p.name + '”' : 'Added to “' + p.name + '”'); },
    plNew: (d) => openSheetCtx('plName', { mode:'new', name:'', cover:{ t:'icon', i:U.playlists.length % 8, auto:true }, ctab:'icon', track:d.v || null }),
    plRename: (d) => { const p = U.playlists.find(x => x.id === d.v); const cv = JSON.parse(JSON.stringify(p.cover || { t:'icon', i:p.icon || 0, auto:true })); openSheetCtx('plName', { mode:'rename', id:p.id, name:p.name, cover:cv, ctab:{ char:'char', img:'photo', avatar:'avatar' }[cv.t] || 'icon' }); },
    plSug: (d) => { S.ctx.name = d.v; $('plName').value = d.v; plHint(); },
    plSave: () => { const c = S.ctx, name = plFinalName(c.name, c.id);
      if (c.mode === 'rename') { const p = U.playlists.find(x => x.id === c.id); const ch = p.name !== name; p.name = name; p.cover = c.cover; toast(ch ? 'Renamed to “' + name + '”' : 'Playlist updated'); }
      else { const p = { id:'p' + (++U.seq), name, cover:c.cover, tracks:c.track ? [c.track] : [] }; U.playlists.unshift(p); toast(c.track ? 'Created “' + name + '” with 1 track' : 'Created “' + name + '”'); if (!c.track && S.screen === 'library') { S.lib.view = 'playlist'; S.lib.pid = p.id; } }
      saveU(); closeSheet(); if (S.screen === 'library' && S.lib.view !== 'list') renderLibrary(); },
    plOpen: (d) => { S.lib.view = 'playlist'; S.lib.pid = d.v; renderLibrary(); $('view').scrollTop = 0; },
    plDelete: (d) => { const p = U.playlists.find(x => x.id === d.v); U.playlists = U.playlists.filter(x => x.id !== d.v); saveU(); S.lib.view = 'mine'; renderLibrary(); toast('Deleted “' + p.name + '”. The tracks stay in the library.'); },
    plRemove: (d) => { const p = U.playlists.find(x => x.id === S.lib.pid); if (!p) return; p.tracks = p.tracks.filter(x => x !== d.v); saveU(); renderLibrary(); },
    plPlay: () => { const ids = S.lib.pid === 'fav' ? U.favs : (U.playlists.find(x => x.id === S.lib.pid) || { tracks:[] }).tracks, first = ids.find(id => DATA.packs[id]); if (first) ACT.openTrack({ v:first }); else toast('No playable track in this playlist yet.'); },
    upOpen: () => openSheetCtx('upload', { step:0, name:'', ok:false }),
    upPick: (d) => { S.ctx.step = +d.v; if (S.ctx.step) S.ctx.name = 'My backing track'; renderSheet(); },
    upOk: () => { S.ctx.ok = !S.ctx.ok; renderSheet(); },
    upAnalyze: () => { if (!S.ctx.ok) return toast('Please confirm you have the right to use this recording.'); if (U.uploads.length >= 5) return toast('Free plan limit reached (5 uploads). Delete one or upgrade.'); const name = (S.ctx.name || '').trim() || 'My backing track'; closeSheet(); runAnalysis(name); },
    chordEdit: () => { S.chordEdit = !S.chordEdit; updTimeline(); const b = $('ceBtn'); if (b) { b.classList.toggle('on', S.chordEdit); b.textContent = S.chordEdit ? '✓ Done' : '✎ Edit chords'; } if (S.chordEdit) toast('Tap a bar to fix its chord.'); frame(true); },
    chordPick: (d) => { const c = D.chords[+d.v]; openSheetCtx('chord', { bar:+d.v, root:NOTE.indexOf(c.root), q:c.quality }); },
    chordSet: (d) => { S.ctx[d.k] = d.k === 'root' ? +d.v : d.v; renderSheet(); },
    chordSave: (d) => { const c = S.ctx, old = D.chords[c.bar].sym, sym = NOTE[c.root] + { maj:'', min:'m', dom7:'7', min7:'m7', maj7:'maj7' }[c.q];
      D.chords.forEach((x, i) => { if (i === c.bar || (d.v === 'all' && x.sym === old)) { x.sym = sym; x.root = NOTE[c.root]; x.quality = c.q; } });
      ownSave(); closeSheet(); updTimeline(); updFretboard(false); frame(true); toast('Chord updated to ' + sym + '.'); },
    ownKey: (d) => { D.keyPc = +d.v; ownSave(); updHeader(); updFretboard(true); updLicks(); renderSheet(); },
    ownMode: (d) => { const u = U.uploads.find(x => x.id === D.id); u.minor = d.v === 'minor'; u.keyPc = D.keyPc; u.chords = D.chords; saveU(); const tick = getTick(); DATA.packs[D.id] = makeUploadPack(u); const was = AU.playing; setTrack(D.id); AU.pausedTick = tick; renderPlayer(); openSheet('scale'); if (was) play({ noCount:true }); },
    speed: (d) => { const pct = Math.max(50, Math.min(100, Math.round(S.bpm / BASE_BPM * 100) + +d.v)); S.bpm = BASE_BPM * pct / 100; updHeader(); updTransport(); restart(); },
    upDelete: () => { const id = D.id; stop(); U.uploads = U.uploads.filter(u => u.id !== id); U.recent = U.recent.filter(x => x !== id); U.favs = U.favs.filter(x => x !== id); U.playlists.forEach(p => { p.tracks = p.tracks.filter(x => x !== id); }); delete DATA.packs[id]; saveU(); setTrack('LJ001'); S.screen = 'library'; S.lib.view = 'mine'; renderNotes(); renderView(); toast('Upload deleted.'); },
    artSet: (d) => { S.art = d.v; renderNotes(); if (S.tab === 'track') { const y = $('view').scrollTop; renderView(); $('view').style.scrollBehavior = 'auto'; $('view').scrollTop = y; $('view').style.scrollBehavior = ''; } },
    demoCat: () => { S.demo = !S.demo; buildCatalog(); renderNotes(); if (S.tab === 'track' && S.screen === 'library') renderLibrary(); toast(S.demo ? 'Demo catalogue on: 1,200 entries (1,190 placeholders).' : 'Showing the 10 real tracks only.'); },
  });
  initSocial(); initBle();
}

/* ================= stage · coach · band characters · hit feedback =================
   Litejam Universe characters in the player: a stage with the style's coach and the player's own character, the mixer as a band,
   Call & response with a coach speech bubble, and per-note feedback on the player's turn (simulated — there is no note detection yet). */
const HOSTS = { Blues:'bank-apisak', Rock:'rockmaster', Pop:'pitchy-rock', Funk:'g-force-killerfish', 'Neo Soul':'piarna', Jazz:'piarna', Metal:'sebastian', Latin:'pitchy-rock', Ambient:'crystal-power', Country:'deadbeat', 'Thai Pop':'pitchy-rock', Reggae:'g-force-killerfish', Upload:'crystal-power' };
const BAND_PREF = { drums:'deadbeat', bass:'g-force-killerfish', harmony:'pitchy-rock' };
const STRN = ['high E', 'B', 'G', 'D', 'A', 'low E'];
const ST = { cast:null, sig:'', lb:'', rb:'', bc:'', say:null, sayKey:'', bandSig:'', tipN:0, ghost:null, react:{} };
const HIT = { seg:null, lick:-1, seq:[], owner:[], val:[], combo:0, best:0, power:0, pts:0, ult:0, lastNote:null, n:{ p:0, g:0, m:0 } };
const shade = (hex, f) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))).toString(16).padStart(2, '0')).join('');
const trackCat = () => { const it = findItem(D.id); return (it && it.cat) || REAL_CAT[D.id] || 'Upload'; };
function cast() {                                 // who stands where: the player's character, the style's coach, one band member per stem
  const av = U.profile.avatar, you = av && av.t === 'char' && CHARMAP[av.id] ? av.id : 'bank-apisak';
  const pick = U.coach && U.coach[trackCat()];                                  // the player's own choice of coach for this style
  let coach = (pick && CHARMAP[pick] && pick) || HOSTS[trackCat()] || CHARS[1 + hash(D.id) % (CHARS.length - 1)].id;
  if (coach === you) coach = you === 'rockmaster' ? 'sebastian' : 'rockmaster';
  const used = new Set([coach, you]), band = {};
  const take = (pref) => { const id = !used.has(pref) ? pref : CHARS.map(c => c.id).find(x => !used.has(x)); used.add(id); return id; };
  CH.forEach(([k, name]) => { band[k] = k === 'guide' ? coach : take(k === 'harmony' && /organ|key|piano|synth|pad/i.test(name) ? 'piarna' : (BAND_PREF[k] || 'pitchy-rock')); });
  return { you, coach, band };
}
function updStage() {
  const el = $('now'); if (!el) return;
  const c = ST.cast = cast(), cat = CAT[trackCat()] || CAT.Upload, av = U.profile.avatar, pic = av && av.t !== 'char';
  Object.values(ST.react).forEach(clearTimeout); Object.assign(ST, { sig:'', lb:'~', rb:'~', bc:'', say:null, sayKey:'', bandSig:'', react:{} });
  [c.coach, c.you].forEach(id => ['idle', 'attack', NO_SLASH[id] ? 'power' : 'slash'].concat(Object.keys(REACT[id] || {}).map(r => 'r_' + r)).forEach(a => { const im = new Image(); im.src = `assets/chars/${id}_${a}.png`; }));
  el.className = 'pstage';
  el.innerHTML = `<div class="sky" style="background:radial-gradient(ellipse at 50% -10%,${shade(cat.b, .7)} 0,${cat.a} 42%,${shade(cat.a, .22)} 84%)"></div>
    <div class="beam"></div><div class="amps"><i></i><i></i></div><div class="floor" style="background:linear-gradient(180deg,${shade(cat.a, .5)},${shade(cat.a, .14)});border-top-color:${shade(cat.b, .45)}"></div>
    <div class="sbadge" id="stL"></div><div class="sbadge r d" id="stR"></div>
    <div class="fx" id="fxCoach"></div><div class="fx" id="fxYou"></div><div class="fx" id="fxBolt"></div>
    <button class="who l" id="whoCoach" data-act="coachTip" aria-label="Coach ${esc(CHARMAP[c.coach].name)}: tap for a tip"><div class="sp" id="spCoach" style="background-image:url('assets/chars/${c.coach}_idle.png')"></div><div class="tag">Coach · <b>${esc(CHARMAP[c.coach].name)}</b><span class="swap" data-act="coachNext" role="button" aria-label="Change coach">⇄</span></div></button>
    <button class="who r" id="whoYou" data-act="avOpen" aria-label="You: change your character"><div class="sp flip" id="spYou" style="background-image:url('assets/chars/${c.you}_idle.png')"></div><div class="tag">${pic ? artHTML(av, 15) : ''}You · <b>${esc(U.profile.name)}</b></div></button>
    <div class="bubble" id="stBubble"></div><div class="jfloat" id="stJudge"></div><div class="cfloat" id="stCombo"></div>`;
  updHud(); LAST.bar = -1; LAST.beat = -1;
}
/* ---- coach lines: built from the lick's own notes (first note, bends, vibrato, landing note) ---- */
const noteNm = (n) => NOTE[mod(n[4] + S.tr, 12)];
function coachTips(l) {
  const ns = l.notes.filter(n => !n[6]); if (!ns.length) return Object.assign(['Listen first, then copy me.'], { your:'Your turn!' });
  const f = ns[0], last = ns[ns.length - 1], pos = (n) => 'fret ' + lickFret(n[3], l) + ', ' + STRN[n[2] - 1] + ' string', tips = [];
  tips.push('Listen first. I start on ' + noteNm(f) + ' — ' + pos(f) + '.');
  const b = ns.find(n => n[5]); if (b) tips.push('Bend the ' + noteNm(b) + ' up ' + (b[5] >= 2 ? 'a whole step' : 'a half step') + ' — ' + pos(b) + '.');
  const v = ns.find(n => n[7]); if (v) tips.push('Let the long ' + noteNm(v) + ' sing — add vibrato.');
  const c = chordAt(Math.min(D.bars - 1, Math.floor(last[0] / TPB))), iv = mod(last[4] + S.tr - c.pc, 12), role = { 0:'the root', 3:'the minor 3rd', 4:'the 3rd', 7:'the 5th', 10:'the b7' }[iv];
  tips.push('Land on ' + noteNm(last) + (role && c.iv.includes(iv) ? ' — ' + role + ' of ' + c.label + '.' : ' to finish the phrase.'));
  tips.your = 'Your turn! Start on ' + pos(f) + '.';
  return tips;
}
function sayNow(text, ms) { ST.say = { text, until: ms ? performance.now() + ms : 0 }; const b = $('stBubble'); if (b) b.textContent = text; }
function coachTip() {                             // tapping the coach
  if (S.loopKind === 'lick' && D.licks.length) { const t = coachTips(lk(S.lick)); return sayNow(t[ST.tipN++ % t.length], 4500); }
  const c = chordAt(Math.min(D.bars - 1, Math.floor(getTick() / TPB))), box = boxRange(), sc = scaleNow(Math.floor(getTick() / TPB));
  const lines = ['Over ' + c.label + ', aim for ' + c.iv.slice(0, 3).map(i => NOTE[(c.pc + i) % 12]).join(', ') + '.', 'Start in box 1 — frets ' + box[0] + '–' + box[1] + ' of ' + sc.name + '.'];
  if (D.licks.length) lines.push(S.pro ? 'Want a lick? Tap ⇄ Call & response on Lick 1 and copy me.' : 'Want a lick? Tap ▶ Practise on Lick 1 and copy me.');
  sayNow(lines[ST.tipN++ % lines.length], 4500);
}
/* ---- per-note feedback on the player's turn (stand-in for note detection) ---- */
function hitReset(seg, i) {
  const l = lk(i), cnt = {};
  Object.assign(HIT, { seg, lick:i, seq:[], combo:0, best:0, power:0, pts:0, ult:0, lastNote:null, n:{ p:0, g:0, m:0 } });
  HIT.owner = l.all ? [].concat(...D.licks.map((x, k) => x.notes.map(() => k))) : l.notes.map(() => i);
  HIT.owner.forEach(k => { cnt[k] = (cnt[k] || 0) + 1; }); HIT.val = HIT.owner.map(k => 1000 / cnt[k]);          // every lick is worth 1,000
  hudTick(false);
}
function hitUpTo(tick) {
  const l = lk(HIT.lick); let ch = false;
  while (HIT.seq.length < l.notes.length && l.notes[HIT.seq.length][0] + 50 <= tick) {
    const i = HIT.seq.length, r = Math.random(), j = r < .66 ? 'p' : (r < .91 ? 'g' : 'm');
    const ms = j === 'm' ? 0 : Math.round((j === 'p' ? Math.random() * 24 : 25 + Math.random() * 35) * (Math.random() < .5 ? -1 : 1)), pts = HIT.val[i] * (j === 'p' ? 1 : (j === 'g' ? .6 : 0));
    HIT.seq.push({ j, ms, pts }); HIT.n[j]++; HIT.pts += pts; HIT.combo = j === 'm' ? 0 : HIT.combo + 1; HIT.best = Math.max(HIT.best, HIT.combo);
    HIT.power = Math.max(0, Math.min(100, HIT.power + (j === 'p' ? 9 : (j === 'g' ? 3 : -8)))); HIT.lastNote = l.notes[i]; ch = true; }
  return ch;
}
function react(elId, ch, name) {                   // one-shot reaction sheet (4–5 frames with their own durations); the pose loop resumes afterwards
  const fr = (REACT[ch] || {})[name], e = $(elId); if (!fr || !e || ST.react[elId]) return false;
  const who = e.parentElement, N = fr.length; who.classList.add('react');
  e.style.animation = 'none'; e.style.backgroundSize = N * 100 + '% 100%'; e.style.backgroundImage = `url('assets/chars/${ch}_r_${name}.png')`;
  const step = (i) => { if (i >= N || !e.isConnected) { delete ST.react[elId]; e.style.animation = ''; e.style.backgroundSize = ''; e.style.backgroundPositionX = ''; who.classList.remove('react'); ST.sig = ''; return; }
    e.style.backgroundPositionX = (i / (N - 1) * 100) + '%'; ST.react[elId] = setTimeout(() => step(i + 1), fr[i]); };
  step(0); return true;
}
function hitFx() {
  const h = HIT.seq[HIT.seq.length - 1], n = HIT.lastNote, jf = $('stJudge'), cf = $('stCombo'); if (!h || !jf) return;
  const ult = HIT.power >= 100; if (ult) { HIT.power = 0; HIT.ult = performance.now() + 2 * 60000 / S.bpm; }
  jf.innerHTML = `<b class="${ult ? 'u' : h.j}">${ult ? 'ULTIMATE!' : { p:'PERFECT!', g:'GOOD', m:'MISS' }[h.j]}</b>${h.j === 'm' ? '' : '<i>+' + Math.round(h.pts) + '</i>'}`;
  jf.classList.remove('pop'); void jf.offsetWidth; jf.classList.add('pop');
  cf.innerHTML = HIT.combo >= 2 ? '<small>COMBO</small>×' + HIT.combo : '';
  if (ult) sayNow('ULTIMATE! ⚡', 1600); else if (h.j === 'm') sayNow('Keep going!', 1200); else if (h.j === 'p' && n[5]) sayNow('Nice bend! 🔥', 1400);
  else if (h.j === 'p' && n[7]) sayNow('Sweet vibrato!', 1400); else if (HIT.combo === 5) sayNow('5 in a row!', 1400); else if (HIT.combo === 10) sayNow('On fire! 🔥', 1400);
  const c = ST.cast; if (!c) return;                                               // characters that ship reaction sheets act them out
  if (ult) { react('spYou', c.you, 'celebrate'); react('spCoach', c.coach, 'celebrate'); }
  else if (h.j === 'm') react('spCoach', c.coach, 'miss'); else if (h.j === 'p' && (n[5] || n[7] || HIT.combo % 4 === 0)) react('spCoach', c.coach, 'perfect'); else if (h.j === 'g' && HIT.combo % 3 === 0) react('spCoach', c.coach, 'good');
}
const hudOn = () => !D.own && S.loopKind === 'lick' && !!D.licks.length && (S.lickMode !== 'listen' || S.challenge != null);
function updHud() {
  const el = $('hud'); if (!el) return;
  if (!hudOn()) { el.innerHTML = ''; el.style.display = 'none'; ST.ghost = null; return; }
  if (HIT.lick !== S.lick) hitReset(null, S.lick);
  let vs = ''; ST.ghost = null;
  if (S.challenge != null) { const sp = scoreSp() || 'full', rows = boardFor(D.id, 'week', sp), me = rows.find(x => x.me), g = me ? (me.rank > 1 ? rows[me.rank - 2] : rows[1]) : rows[rows.length - 1], all = S.challenge === D.licks.length;
    const sc = scoreOf(D.id, sp), tot = sc ? sc.total : 0, runMax = all ? D.licks.length * 1000 : 1000, need = g.score - (tot - (!sc ? 0 : (all ? tot : (sc.licks[S.challenge] || 0)))) + 5;   // points this run needs to pass the ghost on the track total
    ST.ghost = { name:g.name, rank:g.rank, target:Math.max(5, Math.min(need, runMax)), note: me && me.rank === 1 ? 'stay ahead of #2' : (need <= runMax ? 'pass #' + g.rank : 'chasing #' + g.rank) };
    vs = `<div class="vs"><div class="vsc me">${artHTML({ t:'avatar' }, 30)}<div><b>${esc(U.profile.name)}</b><small id="hudMe"></small></div></div><div class="vsc">${artHTML(g.av, 30)}<div><b>Ghost · ${esc(g.name)}</b><small id="hudGh"></small></div></div></div>`; }
  el.style.display = '';
  el.innerHTML = `<div class="hudtop"><span id="hudCnt"></span><span id="hudN"></span></div><div class="judge" id="hudPips"></div>
    <div class="pm"><span>⚡ Power</span><div class="pmb"><i id="hudPw"></i></div><b id="hudPts"></b></div>${vs}
    <div class="hudnote">Demo feedback — simulated in this prototype. In the app the guitar listens to every note. A full Power meter triggers the Ultimate pose.</div>`;
  hudTick(false);
}
function hudTick(fx) {
  const pp = $('hudPips'); if (!pp || HIT.lick < 0) return;
  const N = HIT.owner.length, k = HIT.seq.length, live = AU.playing && HIT.seg && k < N;
  $('hudCnt').innerHTML = `Notes · <b class="p">${HIT.n.p} perfect</b> · <b class="g">${HIT.n.g} good</b> · <b class="m">${HIT.n.m} miss</b>`; $('hudN').textContent = k + ' / ' + N;
  pp.className = 'judge' + (N > 40 ? ' many' : ''); pp.innerHTML = HIT.owner.map((o, i) => `<i class="${i < k ? HIT.seq[i].j : (i === k && live ? 'c' : '')}"></i>`).join('');
  $('hudPw').style.width = HIT.power + '%'; $('hudPts').textContent = Math.round(HIT.pts).toLocaleString() + ' pts';
  const g = ST.ghost; if (g && $('hudGh')) { $('hudMe').textContent = Math.round(HIT.pts).toLocaleString() + ' pts · this run'; $('hudGh').textContent = Math.round(g.target * k / N).toLocaleString() + ' / ' + g.target.toLocaleString() + ' · ' + g.note; }
  if (fx) hitFx();
}
/* ---- every frame: spotlight, poses, badges, bubble, band ---- */
const setSp = (id, ch, act, dur) => { const e = $(id); if (!e || ST.react[id]) return; e.style.backgroundImage = `url('assets/chars/${ch}_${act}.png')`; e.style.animationDuration = dur; };
function stageTick(tick, cnt, bar) {
  const el = $('now'), c = ST.cast; if (!el || !c || !$('spCoach')) return;
  const now = performance.now(), lickOn = S.loopKind === 'lick' && !!D.licks.length, seg = AU.playing && AU.segs.length ? (cnt ? cnt.seg : curSeg()) : null;
  let who = '', badge = '', bcls = '';
  if (seg) {
    if (S.jam) { who = 'you'; const rec = S.jam.state === 'rec'; const cl = S.jam.mode === 'call'; badge = (rec ? '● REC' : '▶ YOUR TAKE') + (cl ? (seg.guideOn ? ' · original lick' : ' · your bars') : '') + ' · round ' + ((cl ? seg.pass >> 1 : seg.pass) + 1) + ' / ' + Math.ceil((S.jam.passes || 1) / (cl ? 2 : 1)); bcls = rec ? 'rec' : 'l'; }
    else if (lickOn) { const sc = S.challenge != null, mine = sc || S.lickMode === 'mine' || (S.lickMode === 'call' && !seg.guideOn);
      who = mine ? 'you' : 'coach'; bcls = cnt ? 'c' : (sc ? 's' : (mine ? 'y' : 'l'));
      badge = (sc ? '🏆 SCORED RUN' : (mine ? '🎸 YOUR TURN' : '👂 LISTEN')) + (S.pro && !sc ? ' · round ' + ((S.lickMode === 'call' ? seg.pass >> 1 : seg.pass) + 1) + ' / ' + (S.lickOnce ? 1 : ROUNDS_MAX) : (S.lickMode === 'call' && !sc ? ' · round ' + ((seg.pass >> 1) + 1) : '')) + (cnt ? ' · ' + (cnt.k ? 4 : 3) : ''); }
    else who = 'you';
  }
  const play = !!seg && !cnt && AU.ctx.currentTime >= seg.t0, ult = who === 'you' && HIT.ult > now;
  const aC = who === 'coach' && play ? 'attack' : 'idle', aY = who === 'you' && play ? (ult ? (NO_SLASH[c.you] ? 'power' : 'slash') : 'attack') : 'idle', aura = who === 'you' && play && lickOn && !S.jam && (HIT.combo >= 4 || ult);
  const sig = [lickOn, who, aC, aY, aura, ult, S.bpm].join('|');
  if (sig !== ST.sig) { ST.sig = sig; const cyc = (120 / S.bpm).toFixed(3) + 's';              // one strum cycle = 2 beats
    el.className = 'pstage' + (lickOn ? ' lick' : '') + (who ? ' on-' + who : '') + (ST.say ? ' say' : '');
    setSp('spCoach', c.coach, aC, aC === 'idle' ? '1.1s' : cyc); setSp('spYou', c.you, aY, aY === 'idle' ? '1.1s' : cyc);
    $('fxCoach').className = 'fx' + (who === 'coach' && play && lickOn ? ' show' : ''); $('fxYou').className = 'fx' + (aura ? ' show' : ''); $('fxBolt').className = 'fx' + (ult ? ' show' : '');
    if (who !== 'you' || !lickOn) { $('stJudge').innerHTML = ''; $('stCombo').innerHTML = ''; } }
  const lb = badge + '|' + bcls; if (lb !== ST.lb) { ST.lb = lb; const e = $('stL'); e.textContent = badge; e.className = 'sbadge ' + bcls + (badge ? ' show' : '');
    const db = $('duetBadge'); if (db) { db.textContent = badge; db.className = 'sbadge ' + bcls + (badge ? ' show' : ''); } }
  const dsp = $('duetSp'); if (dsp) { const p = !!seg && !cnt && seg.guideOn && AU.ctx.currentTime >= seg.t0, k = p + '|' + S.bpm;
    if (dsp.dataset.k !== k) { dsp.dataset.k = k; dsp.style.backgroundImage = `url('assets/chars/${c.coach}_${p ? 'attack' : 'idle'}.png')`; dsp.style.animationDuration = p ? (120 / S.bpm).toFixed(3) + 's' : '1.1s'; dsp.parentNode.classList.toggle('live', p);
      const chip = $('duetChip'); if (chip) chip.textContent = p ? '🎸 Playing the lick' : (seg && !cnt ? '👂 Your bars' : '👂 Listening'); }
    const pg = $('duetProg'); if (pg && seg) pg.style.width = Math.max(0, Math.min(100, (tick - seg.tick0) / (seg.endTick - seg.tick0) * 100)).toFixed(1) + '%'; }
  let rb = ''; if (lickOn) { const l = lk(S.lick), nb = l.endBar - l.startBar + 1; rb = 'Bar ' + Math.max(1, Math.min(nb, bar + 2 - l.startBar)) + ' / ' + nb; } else if (BLE.state === 'on') rb = '● LED sync';
  if (rb !== ST.rb) { ST.rb = rb; const e = $('stR'); e.textContent = rb; e.className = 'sbadge r d' + (rb ? ' show' : '') + (lickOn ? '' : ' led'); }
  // coach bubble: one line per pass, taken from the lick itself
  if (lickOn && seg && !S.jam) { const key = seg.pass + ':' + who + ':' + S.lick + ':' + S.lickMode + ':' + S.challenge;
    if (key !== ST.sayKey) { ST.sayKey = key; const tips = coachTips(lk(S.lick));
      if (who === 'coach') sayNow(tips[(S.lickMode === 'call' ? seg.pass >> 1 : seg.pass) % tips.length]); else sayNow(S.challenge != null ? 'One take. Make it count!' : tips.your, 2 * TPB / tps() * 1000); } }
  else if (ST.sayKey) { ST.sayKey = ''; ST.say = null; }
  if (ST.say && ST.say.until && now > ST.say.until) ST.say = null;
  const bc = ST.say ? 'bubble show ' + (lickOn && who === 'coach' ? 'hi' : 'lo') : 'bubble'; if (bc !== ST.bc) { ST.bc = bc; $('stBubble').className = bc; el.classList.toggle('say', !!ST.say); }
  // the player's turn: judge each note as its time passes
  if (lickOn && who === 'you' && seg && !S.jam && hudOn()) { if (HIT.seg !== seg) hitReset(seg, S.lick); if (!cnt && hitUpTo(tick)) hudTick(true); }
  // the band: a member strums while its stem is audible
  const anySolo = CHKEYS.some(k => S.ch[k].solo), on = {}; let bs = S.bpm + '';
  CH.forEach(([k]) => { const ch = S.ch[k], none = S.mode === 'style' && k === 'harmony' && !D.sampleMap.harmony;
    on[k] = play && (S.jam ? true : (!(none || ch.mute || (anySolo && !ch.solo)) && (k !== 'guide' || (seg.guideOn && lickAtTick(tick) >= 0)))); bs += on[k] ? 1 : 0; });
  if (bs !== ST.bandSig) { ST.bandSig = bs; document.querySelectorAll('#f-mixer .sp[data-band]').forEach(e => { const k = e.dataset.band, p = on[k];
    e.style.backgroundImage = `url('assets/chars/${c.band[k]}_${p ? 'attack' : 'idle'}.png')`; e.style.animationDuration = (120 / S.bpm).toFixed(3) + 's'; e.classList.toggle('play', !!p); }); }
}

/* ================= player ================= */
function renderPlayer() {
  $('view').innerHTML = `<div class="pad" id="player">
    <div class="hd"><button class="back" data-act="back">‹</button>${cover(findItem(D.id) || { id:D.id, cat:'Upload', keyPc:D.keyPc, own:true }, 36)}
      <div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(D.title)}</div><div style="font-size:11px;color:rgba(255,255,255,.5)">${D.own ? 'Your upload · AI analysis' : D.id + ' · Litejam Track'} · ${D.timeSig} · ${D.bars} bars</div></div>
      <div style="display:flex;gap:6px" id="kchips"></div></div>
    <div class="modebar" id="f-mode"></div>
    <div class="now" id="nowbar"></div>
    <div class="pstage" id="now"></div>
    <div class="duet" id="duet" style="display:none"></div>
    <div id="hud"></div>
    <div class="fbbar" id="fbbar"></div>
    <div id="fbBox"></div>
    <div id="legend" class="legend"></div>
    <div id="tabBox"></div>
    <div id="f-timeline"><div class="lbl">Chord timeline${D.own ? ' <span class="pill y">AI</span><button class="chip mini" data-act="chordEdit" id="ceBtn">✎ Edit chords</button>' : ''} <small id="timeLbl"></small></div><div class="tl" id="tl" style="margin-top:6px"></div></div>
    <div class="card" id="f-transport"></div>
    <div id="f-licks" style="display:flex;flex-direction:column;gap:8px"></div>
    <div id="f-board" style="display:flex;flex-direction:column;gap:8px"></div>
    <div id="f-mixer" style="display:flex;flex-direction:column;gap:8px"></div>
    <div id="f-more"></div>
  </div>`;
  updHeader(); updStage(); updFretboard(true); updTimeline(); updTransport(); updLicks(); updBoard(); updMixer(); updMore(); frame(true);
}
function updHeader() {
  if (!$('kchips')) return;
  $('kchips').innerHTML = `<div class="kchip" style="color:var(--green)">${NOTE[keyPc()]}${D.keySuffix}</div><div class="kchip" style="color:var(--blue)">${Math.round(S.bpm)} BPM</div>`;
  const vsw = `<button class="vsw ${S.pro ? 'on' : ''}" data-act="viewToggle" role="switch" aria-checked="${S.pro}" aria-label="Pro view">Pro<i></i></button>`;
  const sel = speedSel(), CAP = {
    pro:'<b style="color:#fff">Pro view</b> — free practice on the studio recording at full speed. Tempo, key and scores are in Normal view.',
    full:'<b style="color:#fff">Normal view</b> — copy the coach and play for score. Turn on Pro for free practice with Jam & Record.',
    slow:'<b style="color:#fff">Slow practice</b> — the band is re-played from MIDI so the tempo can drop. This speed has its own scores.',
    med:'<b style="color:#fff">Medium practice</b> — the band is re-played from MIDI so the tempo can drop. This speed has its own scores.',
    custom:'<b style="color:#fff">Custom tempo and key</b> — practice only. Scores count at Slow, Medium or Full.' };
  const body = D.own ? `<span class="pill y" style="font-size:11px;padding:5px 8px">AI</span><div class="cap"><b style="color:#fff">Your upload</b> — chords, key and beat grid are detected by AI. Use ✎ Edit chords if something sounds off.</div>`
    : `<div class="cap">${CAP[S.pro ? 'pro' : sel]}</div>`;
  $('f-mode').innerHTML = body + vsw;
}
function updNow(bar) {                         // the chord row stays as it was: NOW large, NEXT beside it, four beat dots
  const el = $('nowbar'); if (!el) return;
  let nb = bar + 1; if (S.loop && (bar + 1) * TPB >= S.loop.b) nb = Math.floor(S.loop.a / TPB);
  el.innerHTML = `<div><div class="k">NOW</div><div class="c1">${chordAt(bar).label}</div><div class="beats" id="beats"><i></i><i></i><i></i><i></i></div></div>
    <div><div class="k" style="color:rgba(255,255,255,.35)">NEXT</div><div class="c2">${nb < D.bars ? chordAt(nb).label : '—'}</div><div style="height:14px"></div></div>`;
  LAST.beat = -1;
}
function updFretboard(scroll) {
  if (!$('fbBox')) return;
  const bar = Math.min(D.bars - 1, Math.floor(getTick() / TPB)), sc = scaleNow(bar), c = chordAt(bar), box = boxRange();
  const seg = (v, l) => `<button class="${S.fb === v ? 'on' : ''}" data-act="fb" data-v="${v}">${l}</button>`;
  $('fbbar').innerHTML = `<div class="seg">${seg('scale', 'Scale')}${seg('chord', 'Chord')}${D.licks.length ? seg('lick', 'Lick') : ''}</div>
    <button class="scalechip" data-act="openScale"><span style="color:var(--blue)">♪</span><b>${S.fb === 'lick' ? lkName(S.lick) + ' · ' + sc.name : sc.name}</b><em>Edit ›</em></button>`;
  let dots, hi = null, legend;
  const tPcs = S.targets ? c.iv.map(i => (c.pc + i) % 12) : null;
  if (S.fb === 'chord') { dots = chordDots(c);
    legend = [['#FF2020','Root'],['#ADFE00','3rd'],['#FFCC00','5th'],['#50BCFF','b7']]; }
  else if (S.fb === 'lick') { const l = lk(S.lick);
    dots = scaleDots(sc.root, sc.iv, { faint:true, labels:S.labels }).concat(lickDots(l)); hi = [Math.max(0, lickFret(l.fretLow, l)), lickFret(l.fretHigh, l)];
    legend = [['#ADFE00','Playing now'],['#FFCC00','Next note'],['#555','Scale (dim)']]; }
  else { const range = S.pos === 'box' ? box : null; if (range) hi = range;
    dots = scaleDots(sc.root, sc.iv, { range, labels:S.labels, targetPcs:tPcs, blueIv: S.scale === 'blues' ? 6 : null });
    legend = [['#FF2020','Root'],['#50BCFF','Scale note']]; if (S.scale === 'blues') legend.push(['#FFCC00','Blue note']); if (S.targets) legend.push(['ring', 'Target: ' + c.label + ' chord tone']); }
  const prev = document.querySelector('#fbBox .fbscroll'), sl = prev ? prev.scrollLeft : 0;
  FB.dots = dots; FB.show = true; if (S.fb !== 'lick') { FB.on = new Set(); FB.nx = null; }
  $('fbBox').innerHTML = fbHTML(dots, hi);
  const sc2 = document.querySelector('#fbBox .fbscroll');
  sc2.scrollLeft = sl;
  if (scroll) sc2.scrollLeft = hi ? Math.max(0, hi[0] * FW - 40) : (S.fb === 'scale' ? Math.max(0, box[0] * FW - 60) : 0);
  $('legend').innerHTML = legend.map(([col, t]) => `<span><i style="${col === 'ring' ? 'background:#50BCFF;box-shadow:0 0 0 2px #fff' : 'background:' + col}"></i>${t}</span>`).join('');
  updTab(); LAST.active = null; ledSync();
}
function updTab() {
  const box = $('tabBox'); if (!box) return;
  if (S.fb !== 'lick') { box.innerHTML = ''; return; }
  const l = lk(S.lick), nb = l.endBar - l.startBar + 1, W = 24 + nb * TABW + 16;
  let h = `<div class="lbl" style="margin-bottom:6px">Tab · ${lkName(S.lick)} <small>${l.gp}</small></div><div class="tabstrip" id="tabstrip"><div class="tabin" style="width:${W}px">`;
  for (let s = 0; s < 6; s++) h += `<div class="ln" style="top:${34 + s * 12}px"></div><div class="tl6" style="top:${28 + s * 12}px">${'eBGDAE'[s]}</div>`;
  for (let b = 0; b <= nb; b++) { h += `<div class="bl" style="left:${24 + b * TABW}px"></div>`;
    if (b < nb) h += `<div class="bn" style="left:${30 + b * TABW}px">Bar ${l.startBar + b}<b>${chordAt(l.startBar - 1 + b).label}</b></div>`; }
  l.notes.forEach((n, i) => { const x = 24 + 14 + (n[0] - l.startTick) / TPB * (TABW - 8), y = 34 + (n[2] - 1) * 12 - 6;
    h += `<div class="tn ${n[6] ? 'm' : ''}" data-n="${i}" style="left:${x}px;top:${y}px">${n[6] ? 'x' : lickFret(n[3], l)}</div>`;
    if (n[5]) h += `<div class="tb" style="left:${x}px;top:${y - 9}px">${bendTxt(n[5]).replace('↑', '⤴')}</div>`;
    else if (n[7]) h += `<div class="tb" style="left:${x}px;top:${y - 9}px;color:#50BCFF">~~</div>`; });
  h += '<div class="ph" id="tabPh"></div></div></div>';
  box.innerHTML = h;
}
function updTimeline() {
  const el = $('tl'); if (!el) return;
  const W = D.bars * BARP + 4;
  let h = `<div class="tlin" style="width:${W}px"><div class="lane"${D.licks.length ? '' : ' style="height:0"'}>`;
  D.licks.forEach((l, i) => { h += `<button class="${S.loopKind === 'lick' && S.lick === i ? 'on' : ''}" data-act="lickLoop" data-v="${i}" style="left:${(l.startBar - 1) * BARP}px;width:${(l.endBar - l.startBar + 1) * BARP - 4}px">🎸 Lick ${i + 1}</button>`; });
  h += '</div><div class="bars">';
  for (let b = 0; b < D.bars; b++) { const sec = D.sections.find(s => s.from === b + 1), c = chordAt(b);
    const inLoop = S.loop && b * TPB >= S.loop.a && b * TPB < S.loop.b;
    let mark = ''; if (S.loop && b * TPB === S.loop.a) mark = 'A'; if (S.loop && (b + 1) * TPB === S.loop.b) mark = mark ? 'A=B' : 'B';
    h += `<button class="bar ${inLoop ? 'lp' : ''} ${S.chordEdit ? 'ed' : ''}" data-act="${S.chordEdit ? 'chordPick' : 'seek'}" data-v="${b}" data-b="${b}"><div class="s">${sec ? sec.name : ''}<em>${mark}</em></div><div class="c">${c.label}<small>${b + 1}</small></div></button>`; }
  h += `</div><div class="tlph" id="tlPh" style="top:${(D.licks.length ? 24 : 0) + 15}px"></div></div>`;
  el.innerHTML = h; LAST.bar = -1;
}
function loopLabel() { if (!S.loop) return 'Loop off'; if (S.loopKind === 'lick') return lkName(S.lick); const a = S.loop.a / TPB + 1, b = S.loop.b / TPB; return S.loopKind === 'blues' ? D.loopName : (a === b ? 'Bar ' + a : 'Bars ' + a + '–' + b); }
function updTransport() {                       // both views: Metronome · Play · Loop. Normal adds the Speed row; Pro is locked to the studio recording at full speed
  const el = $('f-transport'); if (!el) return;
  el.innerHTML = `<div class="trow">
      ${D.own ? `<div class="tbox"><button class="step" data-act="speed" data-v="-10">−</button><span style="min-width:62px;text-align:center;color:${S.bpm === BASE_BPM ? '#fff' : 'var(--green)'}">${Math.round(S.bpm / BASE_BPM * 100)}% speed</span><button class="step" data-act="speed" data-v="10">+</button></div>`
              : `<button class="tbox ${S.metro ? 'act' : ''}" data-act="metro">${icon('metronome_icon', 15)}Metronome</button>`}
      <button class="playb" data-act="play">${icon(AU.playing ? 'pause_icon' : 'play_icon', 22)}</button>
      <button class="tbox ${S.loop ? 'act' : ''}" data-act="openLoop">${icon('loop_icon', 15)}${loopLabel()}</button>
    </div>` + (S.pro || D.own ? '' : speedRow());
}
/* Normal view speed. Slow / Medium / Full are presets in the original key: each has its own scores and leaderboard, so user data falls into three clean groups.
   Slow and Medium run on Style mode (MIDI + samples); Full is the studio stems. Custom = Style mode with free tempo and key, practice only. */
const SPLBL = { slow:'🐢 Slow', med:'Medium', full:'⚡ Full' };
function simpleBpm(v) { const r5 = (f) => Math.round(BASE_BPM * f / 5) * 5; return v === 'slow' ? r5(0.7) : (v === 'med' ? r5(0.85) : BASE_BPM); }
function speedSel() { if (S.mode === 'audio') return 'full'; if (S.custom || S.tr) return 'custom'; return S.bpm === simpleBpm('slow') ? 'slow' : (S.bpm === simpleBpm('med') ? 'med' : 'custom'); }
function scoreSp() { const v = speedSel(); return v === 'custom' || S.pro || D.own ? null : v; }                 // the score group of the current setting, or null when it does not count
function scoreOf(tid, sp, make) {               // Full keeps the original record; Slow and Medium live beside it
  U.scores = U.scores || {}; let s = U.scores[tid]; if (!s) { if (!make) return null; s = U.scores[tid] = { licks:{}, total:0 }; }
  if (sp === 'full') return s; s.sp = s.sp || {}; if (!s.sp[sp]) { if (!make) return null; s.sp[sp] = { licks:{}, total:0 }; } return s.sp[sp];
}
function speedRow() {
  const sel = speedSel(), st = S.mode === 'style';
  return `<div class="spd"><div class="seg">${['slow', 'med', 'full'].map(v => `<button class="${sel === v ? 'on' : ''}" data-act="simpleSpeed" data-v="${v}">${SPLBL[v]}<small>${simpleBpm(v)}</small></button>`).join('')}<button class="${sel === 'custom' ? 'on' : ''}" data-act="simpleSpeed" data-v="custom">🎛 Custom</button></div></div>` +
    (sel !== 'custom' ? '' : `<div class="cust"><div><span>Tempo</span><button class="step" data-act="cBpm" data-v="-5">−</button><b>${Math.round(S.bpm)} BPM</b><button class="step" data-act="cBpm" data-v="5">+</button></div>
      <div><span>Key</span><button class="step" data-act="cTr" data-v="-1">−</button><b>${NOTE[keyPc()]}${S.tr ? ' (' + (S.tr > 0 ? '+' : '') + S.tr + ')' : ''}</b><button class="step" data-act="cTr" data-v="1">+</button></div></div>
      <div class="hudnote">Custom is practice only. Scores and the leaderboard count at Slow, Medium or Full in the original key.</div>`);
}
function setSpeed(v) {
  const was = S.mode;
  if (S.challenge != null) S.challenge = null;                                   // a scored run belongs to one speed
  if (v === 'full') { if (was !== 'audio') { setMode('audio'); toast('Full speed: the studio recording in the original key.'); } updBoard(); return; }
  if (v === 'custom') { S.custom = true; toast('Custom: change tempo and key freely. Practice only — scores count at Slow, Medium or Full.'); }
  else { S.custom = false; S.bpm = simpleBpm(v); S.tr = 0;
    if (was === 'audio') toast(SPLBL[v] + ': the band switches to MIDI' + (D.sampleMap && !D.sampleMap.harmony ? ' (drums and bass on this track)' : '') + ' so the tempo can drop. This speed has its own scores.'); }
  if (was === 'style') { updHeader(); updFretboard(true); updTimeline(); updTransport(); updLicks(); restart(); } else setMode('style');
  updBoard();
}
function updLicks() {
  const el = $('f-licks'); if (!el) return;
  updHud();
  if (D.own) { const sim = CATALOG.filter(t => t.keyPc === keyPc()).sort((a, b) => (b.playable - a.playable) || (b.real - a.real) || b.plays - a.plays).slice(0, 3);
    el.innerHTML = `<div class="lbl">🔒 Only on Litejam Tracks</div><div class="card" style="gap:10px">${[['Style mode', 'Change tempo and key with no audio artefacts — needs the producer’s MIDI + samples.'], ['Guide licks', 'LED + tab licks with Listen / Call & response — written and recorded per track.'], ['Leaderboard & scored runs', 'Scores come from verified licks, so only Litejam Tracks have a leaderboard.'], ['Verified chords & loop points', 'Checked by a musician. Uploads rely on AI detection.']].map(x => `<div class="ci"><i class="n">🔒</i><div><b>${x[0]}</b><small>${x[1]}</small></div></div>`).join('')}</div>
      <div class="lbl">Litejam Tracks in ${NOTE[keyPc()]} <button class="more" data-act="browse" data-d="key" data-v="${keyPc()}">See all ›</button></div>` + sim.map(t => trow(t)).join('') + '<button class="chip" data-act="upDelete" style="align-self:flex-start;color:var(--red)">Delete this upload</button>'; return; }
  const best = (i) => { const sp = scoreSp(), s = sp && scoreOf(D.id, sp); return !s ? 0 : (i === D.licks.length ? (s.allBest || 0) : (s.licks[i] || 0)); };   // best at the current speed preset
  const KIND = { listen:'listen', call:'copy', mine:'mine' }, LBL = S.pro ? { listen:'▶ Listen', call:'⇄ Call & response', mine:'🎸 My turn' } : { listen:'👂 Listen', call:'🔁 Copy me', mine:'🎸 My turn' };
  const act = (i, m) => `<button class="abtn ${KIND[m]} ${S.challenge == null && S.loopKind === 'lick' && S.lick === i && S.lickMode === m ? 'on' : ''}" data-act="lickPractice" data-v="${i}" data-m="${m}">${LBL[m]}</button>`;
  if (!S.pro) {                                 // Normal view: one green button per lick; Listen / Copy me and the score button appear only on the lick being practised
    const open = S.loopKind === 'lick' ? S.lick : -1, first = open < 0 ? D.licks.findIndex((l, i) => !best(i)) : -1;
    el.innerHTML = `<div class="lbl">🎸 Licks <small>copy the coach, then play for score</small></div>` +
      D.licks.map((l, i) => lickCardSimple(i, act, best, i === first)).join('') + lickCardSimple(D.licks.length, act, best, false);
    return; }
  el.innerHTML = `<div class="lbl">🎸 Licks <small>free practice · no scores</small></div>` +     // Pro: one button per lick; modes, record and options appear only on the lick that is open
    D.licks.map((l, i) => lickCardPro(i, act)).join('') + lickCardPro(D.licks.length, act);
}
const STEPCAP = { listen:'<b>Listen</b> — the coach plays. Watch the lights and the tab.', call:'<b>Copy me</b> — the coach plays one round, then it is your turn.', mine:'Tap <b>Listen</b> or <b>Copy me</b> to practise again, or play for score.' };
function lickCardSimple(i, act, best, first) {
  const l = lk(i), all = i === D.licks.length, open = S.loopKind === 'lick' && S.lick === i, b = best(i), sc = S.challenge === i;
  return `<div class="lick s ${open ? 'on' : ''}"${all ? ' id="f-all"' : ''}>
    <div class="lrow"><div class="lno ${all ? 'all' : ''}">${all ? '★' : i + 1}</div>
      <div class="li"><div class="t">${lkName(i)}${first ? '<span class="pill g">Start here</span>' : ''}</div><div class="m">${all ? 'The whole solo' : l.level} · bars ${l.startBar}–${l.endBar} · ${l.notes.length} notes</div></div>
      ${b ? `<span class="bestb">🏆 ${b.toLocaleString()}</span>` : ''}
      ${open ? '<button class="abtn stop" data-act="lickStop">✕ Done</button>' : `<button class="abtn go" data-act="lickPractice" data-v="${i}" data-m="call">▶ Practise</button>`}</div>
    ${open ? `<div class="steps">${act(i, 'listen')}${act(i, 'call')}</div>
      <div class="stepcap">${sc ? '<b>Scored run</b> — one take after the count-in, guide muted.' : STEPCAP[S.lickMode]}</div>
      ${scoreSp() ? `<button class="abtn score ${sc ? 'on' : ''}" data-act="challenge" data-v="${i}">🏆 Play for score · ${SPLBL[scoreSp()]}${b ? ' · best ' + b.toLocaleString() : ''}</button>` : '<button class="abtn score off" data-act="scoreHint">🏆 Scores count at Slow, Medium or Full</button>'}` : ''}</div>`;
}
function updMore() {                            // Normal view only: one door to Pro
  const el = $('f-more'); if (!el) return;
  el.innerHTML = S.pro || D.own ? '' : `<div class="promo"><div><b>✨ Ready to jam freely?</b><small>Pro view swaps scores for free practice on the studio recording: call & response, play alone, Jam & Record on every lick.</small></div><button class="abtn pro" data-act="viewToggle">Turn on Pro</button></div>`;
}
const viewMode = (m) => (S.pro ? (m === 'listen' ? 'call' : m) : (m === 'mine' ? 'call' : m));   // Normal: Listen / Copy me · Pro: Call & response / My turn
function setView(pro, quiet) {
  S.pro = !!pro;
  if (S.jam) stop();                                                             // Jam & Record lives in Pro
  if (S.pro) S.challenge = null;                                                 // scored runs live in Normal
  S.lickMode = viewMode(S.lickMode);
  const back = S.pro && S.mode === 'style';                                      // Style mode (tempo, key) lives in Normal only: Pro always plays the studio recording at full speed
  if (back) setMode('audio');
  updHeader(); updTransport(); updLicks(); updBoard(); updMixer(); updMore();
  if (!quiet) toast(S.pro ? (back ? 'Pro view: back to the studio recording at full speed. Tempo and key are in Normal view.' : 'Pro view: call & response, solo practice and Jam & Record on the studio recording. No scores here.') : 'Normal view: copy the coach, play for score, choose your speed.');
}
function updMixer() {                           // the plain version's mixer (M / S / volume per stem), folded away under a toggle
  const el = $('f-mixer'); if (!el) return;
  const anySolo = CHKEYS.some(k => S.ch[k].solo), src = D.own ? 'AI-separated stems' : (S.mode === 'audio' ? 'studio stems' : 'MIDI + samples');
  el.innerHTML = `<button class="lbl mixtog" data-act="mixToggle" aria-expanded="${!!S.mixOpen}">${icon('speaker_icon', 15)} Mixer <small>${src}${S.mixOpen ? '' : ' · tap to open'}</small><i>${S.mixOpen ? '▴' : '▾'}</i></button>` + (!S.mixOpen ? '' : CH.map(([k, name, srcLbl]) => { const c = S.ch[k];
    const none = S.mode === 'style' && k === 'harmony' && !D.sampleMap.harmony;
    const sub = S.mode === 'audio' ? srcLbl : (k === 'guide' ? '05_TABS → synth' : (none ? 'no MIDI / samples yet — silent' : '02_MIDI + 03_SAMPLES'));
    return `<div class="mx ${(none || c.mute || (anySolo && !c.solo)) ? 'off' : ''}"><div class="n">${esc(name)}<small>${esc(sub)}</small></div>
      <button class="b m ${c.mute ? 'on' : ''}" data-act="mute" data-v="${k}" aria-label="Mute ${esc(name)}">M</button><button class="b s ${c.solo ? 'on' : ''}" data-act="solo" data-v="${k}" aria-label="Solo ${esc(name)}">S</button>
      <input type="range" min="0" max="100" value="${c.vol}" data-vol="${k}" aria-label="${esc(name)} volume"><div class="v" id="v-${k}">${c.mute ? '—' : c.vol + '%'}</div></div>`; }).join(''));
}

/* ================= sheets ================= */
function openSheet(kind) { S.sheet = kind; renderSheet(); $('sheetbg').classList.add('show'); }
function closeSheet() { S.sheet = null; S.abA = null; $('sheetbg').classList.remove('show'); }
function renderSheet() {
  const el = $('sheet'); let h = '';
  if (['filter', 'addTo', 'plName', 'upload', 'chord', 'avatar', 'board', 'result', 'takeName', 'ble'].includes(S.sheet)) { el.innerHTML = S.sheet === 'ble' ? sheetBle() : (sheetLib() || sheetSocial()); return; }
  if (S.sheet === 'scale') {
    const bar = Math.floor(getTick() / TPB), box = boxRange();
    h = `<h3>Scale on fretboard <button data-act="closeSheet">✕</button></h3><p>${D.own ? 'Suggested from the AI-detected key. If the key sounds wrong, correct it below.' : 'Suggested for this track by the producer metadata (<b>scale_focus</b>: ' + esc(DATA.tracks.find(t => t.id === D.id).scale) + ').'} The same notes light up on the guitar LEDs.</p>` +
      D.scales.map(([k, lvl, desc]) => { const nm = k === 'follow' ? SCALE_LIB.follow.name + ' (' + D.followName + ')' : NOTE[keyPc()] + ' ' + SCALE_LIB[k].name;
        return `<button class="ropt ${S.scale === k ? 'on' : ''}" data-act="scale" data-v="${k}"><div><div class="rt">♪ ${nm}</div><div class="rd">${desc}</div></div><span class="rr pill ${lvl === 'Beginner' ? 'g' : 'b'}">${lvl}</span></button>`; }).join('') +
      (D.own ? `<div class="flbl">Detected key <span style="color:rgba(255,255,255,.5)">— tap to correct</span></div><div class="bgrid" style="grid-template-columns:repeat(6,1fr)">${NOTE.map((n, i) => `<button class="${i === D.keyPc ? 'a' : ''}" data-act="ownKey" data-v="${i}">${n}</button>`).join('')}</div><div class="seg" style="align-self:flex-start"><button class="${D.keySuffix === ' minor' ? 'on' : ''}" data-act="ownMode" data-v="minor">Minor</button><button class="${D.keySuffix === ' major' ? 'on' : ''}" data-act="ownMode" data-v="major">Major</button></div>` : '') +
      `<div class="opt"><span style="font-size:13px">Position</span><div class="seg"><button class="${S.pos === 'full' ? 'on' : ''}" data-act="pos" data-v="full">Full neck</button><button class="${S.pos === 'box' ? 'on' : ''}" data-act="pos" data-v="box">Box 1 · frets ${box[0]}–${box[1]}</button></div></div>
       <div class="opt"><span style="font-size:13px">Labels</span><div class="seg"><button class="${S.labels === 'notes' ? 'on' : ''}" data-act="labels" data-v="notes">Notes</button><button class="${S.labels === 'degrees' ? 'on' : ''}" data-act="labels" data-v="degrees">Degrees</button></div></div>
       <div class="opt"><span style="font-size:13px">Target notes <span style="color:rgba(255,255,255,.5);font-size:11px">— ring the chord tones of the current chord</span></span><button class="tog ${S.targets ? 'on' : ''}" data-act="targets">${S.targets ? 'On' : 'Off'}</button></div>`;
  } else if (S.sheet === 'loop') {
    const ro = (on, act, v, t, d) => `<button class="ropt ${on ? 'on' : ''}" data-act="${act}" data-v="${v}"><div><div class="rt" style="color:#fff">${t}</div><div class="rd">${d}</div></div></button>`;
    h = `<h3>Loop <button data-act="closeSheet">✕</button></h3>` +
      ro(!S.loop, 'loopSet', 'off', 'Off — play the track once', D.bars + ' bars · ' + D.sections.map(s => s.name.toLowerCase()).join(', ')) +
      ro(S.loopKind === 'blues', 'loopSet', 'blues', D.loopName + ' · bars ' + (D.loop.a / TPB + 1) + '–' + (D.loop.b / TPB), D.loopNote) +
      D.licks.map((l, i) => ro(S.loopKind === 'lick' && S.lick === i, 'lickLoop', i, 'Lick ' + (i + 1) + ' · bars ' + l.startBar + '–' + l.endBar, 'Loop the lick with the guide guitar')).join('') +
      (D.allLick && S.mode === 'audio' ? ro(S.loopKind === 'lick' && S.lick === D.licks.length, 'lickLoop', D.licks.length, 'All licks · bars ' + D.allLick.startBar + '–' + D.allLick.endBar, 'Loop the whole solo (Licks_All_Perf)') : '') +
      `<div style="font-size:13px;margin-top:4px">Custom A–B <span style="color:rgba(255,255,255,.5);font-size:11px">— ${S.abA == null ? 'tap the first bar' : 'now tap the last bar'}</span></div><div class="bgrid">` +
      Array.from({ length: D.bars }, (_, b) => { const inL = S.loopKind === 'ab' && S.loop && b * TPB >= S.loop.a && b * TPB < S.loop.b;
        return `<button class="${S.abA === b ? 'a' : (inL ? 'in' : '')}" data-act="ab" data-v="${b}">${b + 1}</button>`; }).join('') + '</div>';
  }
  el.innerHTML = h;
}

/* ================= scale tab ================= */
function renderScaleTab() {
  const iv = STYPES[S.sType], name = NOTE[S.sKey] + ' ' + S.sType;
  const keys = NOTE.map((n, i) => `<button class="chip ${i === S.sKey ? 'on' : ''}" style="flex:1;padding:8px 0;text-align:center;${i === S.sKey ? 'background:var(--red);color:#fff' : ''}" data-act="sKey" data-v="${i}">${n}</button>`);
  FB.dots = scaleDots(S.sKey, iv, { blueIv: S.sType === 'Pentatonic Blues' ? 6 : null }); FB.show = true; FB.on = new Set(); FB.nx = null; ledSync();
  const sug = DATA.tracks.map(t => { const m = TRK_SCALE[t.id]; if (!m.t.includes(S.sType)) return null; return { t, exact: m.pc === S.sKey, m }; }).filter(Boolean).sort((a, b) => b.exact - a.exact).slice(0, 4);
  $('view').innerHTML = `<div class="pad">
    <div class="h1" style="margin:6px 0"><span>${name} </span><span style="color:#fff">Scale</span></div>
    ${fbHTML(scaleDots(S.sKey, iv, { blueIv: S.sType === 'Pentatonic Blues' ? 6 : null }))}
    <div class="card" id="f-jam" style="border:1px solid rgba(173,254,0,.35)"><div class="lbl">▶ Jam with this scale <em class="new">NEW</em><small>Play with Track</small></div>
      ${sug.length ? sug.map(x => `<button class="trk ${DATA.packs[x.t.id] ? 'ready' : 'soon'}" style="background:var(--panel2)" data-act="jam" data-v="${x.t.id}"><div style="flex:1;min-width:0"><div class="tt">${esc(trackTitle(x.t))} · ${x.t.bpm} BPM</div>
        <div class="mm">${x.exact ? 'Perfect match — same key and scale' : 'Same scale in ' + NOTE[x.m.pc] + ' — transpose to ' + NOTE[S.sKey] + ' in Style mode'}</div></div><span class="pill ${x.exact ? 'g' : 'x'}">${DATA.packs[x.t.id] ? (x.exact ? 'Match' : 'Transpose') : 'Soon'}</span></button>`).join('')
        : '<div class="sub">No Litejam Track uses this scale yet.</div>'}</div>
    <div style="height:2px;background:#424148"></div>
    <div style="font-size:14px;color:#FF0000">Choose your key</div>
    <div style="display:flex;gap:4px">${keys.slice(0, 6).join('')}</div><div style="display:flex;gap:4px">${keys.slice(6).join('')}</div>
    <div style="font-size:14px;color:var(--green)">Type of scale</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">${Object.keys(STYPES).map(t => `<button class="chip ${t === S.sType ? 'on' : ''}" style="padding:12px 2px;font-size:10px;font-weight:700;text-align:center;white-space:normal" data-act="sType" data-v="${t}">${t}</button>`).join('')}</div>
  </div>`;
}

/* ================= frame loop ================= */
const LAST = { bar:-1, beat:-1, active:null, turn:'', count:-1, lick:-1 };
const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function frame(force) {
  if (S.tab !== 'track' || S.screen !== 'player' || !$('player')) return;
  const tick = getTick(), bar = Math.min(D.bars - 1, Math.floor(tick / TPB)), beat = Math.floor((tick % TPB) / BEAT);
  if (AU.playing && S.fb === 'lick' && S.loopKind !== 'lick') { const li = lickAtTick(tick); if (li >= 0 && li !== S.lick) { S.lick = li; updFretboard(true); updLicks(); } }
  if (bar !== LAST.bar || force) {
    LAST.bar = bar; updNow(bar);
    document.querySelectorAll('#tl .bar').forEach(b => b.classList.toggle('cur', +b.dataset.b === bar));
    if (S.fb === 'chord' || S.scale === 'follow' || (S.targets && S.fb === 'scale')) updFretboard(false);
    const tl = $('tl'); if (tl && AU.playing) tl.scrollLeft = Math.max(0, bar * BARP - 130);
  }
  const cnt = lickCounting(), beatKey = cnt ? 'c' + cnt.k : beat;
  if (beatKey !== LAST.beat) { LAST.beat = beatKey; const bs = $('beats'); if (bs) [...bs.children].forEach((d, i) => { d.className = cnt ? (i === 2 + cnt.k ? 'on cnt' : '') : ((AU.playing && i === beat) ? ('on' + (i === 0 ? ' acc' : '')) : ''); }); }
  const ph = $('tlPh'); if (ph) ph.style.left = (2 + tick / TPB * BARP - 1) + 'px';
  const tlb = $('timeLbl'); if (tlb) tlb.textContent = fmt(tick / tps()) + ' / ' + fmt(END / tps()) + ' · bar ' + (bar + 1);
  // lick LED + tab
  if (S.fb === 'lick' && D.licks.length) { const l = lk(S.lick); let act = [], nx = -1;
    if (cnt) nx = 0;
    else if (tick >= l.startTick && tick < l.endTick) l.notes.forEach((n, i) => { if (tick >= n[0] && tick < n[0] + Math.max(n[1], 200)) act.push(i); else if (nx < 0 && n[0] > tick) nx = i; });
    else if (tick < l.startTick) nx = 0;
    const sig = act.join(',') + '|' + nx;
    if (sig !== LAST.active) { LAST.active = sig;
      const kOf = (i) => { const n = l.notes[i]; return (n[2] - 1) + '_' + (n[6] ? 0 : lickFret(n[3], l)); };
      const on = new Set(act.map(kOf)), nxK = nx >= 0 ? kOf(nx) : null;
      document.querySelectorAll('#fbBox .dot[data-k]').forEach(d => { d.classList.toggle('on', on.has(d.dataset.k)); d.classList.toggle('nx', !on.has(d.dataset.k) && d.dataset.k === nxK); });
      document.querySelectorAll('#tabBox .tn').forEach(d => d.classList.toggle('on', act.includes(+d.dataset.n)));
      FB.on = on; FB.nx = nxK; ledSync(); }
    const tp = $('tabPh'); if (tp) { const inL = tick >= l.startTick && tick < l.endTick; tp.style.display = inL ? 'block' : 'none';
      if (inL) { const x = 24 + 14 + (tick - l.startTick) / TPB * (TABW - 8); tp.style.left = x + 'px'; const ts = $('tabstrip'); if (ts && AU.playing) ts.scrollLeft = Math.max(0, x - 150); } } }
  stageTick(tick, cnt, bar);            // spotlight, poses, turn badge, coach bubble, hit feedback, band
  // count-in overlay
  const co = $('countOvl'); if (AU.playing && AU.countUntil && AU.ctx.currentTime < AU.countUntil) { co.classList.add('show'); $('countNum').textContent = Math.min(4, Math.floor((AU.ctx.currentTime - AU.countStart) / AU.countBeat) + 1); } else co.classList.remove('show');
}
function loop() { frame(false); requestAnimationFrame(loop); }
requestAnimationFrame(loop); setInterval(() => frame(false), 120);   // interval keeps state fresh when the tab is hidden

/* ================= actions ================= */
let toastT; function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function setLoop(kind, a, b) { if (S.jam) stop(); S.loopKind = kind; S.loop = kind ? { a, b } : null; updTimeline(); updTransport(); updLicks(); if (AU.playing) restart(kind ? a : getTick()); else if (kind) { AU.pausedTick = a; } frame(true); }
function setTrack(id) {
  if (AU.ctx && AU.playing) stop();
  D = DATA.packs[id]; buildAllLick(D); TPB = D.ticksPerBar; BEAT = D.beatTicks; END = D.endTick; BASE_BPM = D.bpm; PPQ = D.ppq; CH = D.channels;
  Object.assign(S, { mode:'audio', custom:false, fb:'scale', scale:D.scales[0][0], pos:'full', lick:0, lickMode:'listen', loopKind:null, loop:null, abA:null, bpm:BASE_BPM, tr:0 });
  S.ch.guide.mute = true; CHKEYS.forEach(k => { S.ch[k].solo = false; });
  AU.pausedTick = 0; AU.segs = []; AU.buf = AU.bufs[D.mediaId || id] || {}; AU.ready = !!AU.loaded[D.mediaId || id]; S.chordEdit = false; S.challenge = null; applyMix(true);
  Object.assign(LAST, { bar:-1, beat:-1, active:null, turn:'' }); HIT.lick = -1; HIT.seg = null; ST.cast = null;
}
function openPlayer(preset) { S.tab = 'track'; S.screen = 'player'; if (preset) Object.assign(S, preset);
  if (S.pro && S.mode === 'style') S.pro = false;   // e.g. "Jam with this scale" in another key: tempo and key live in Normal view
  renderView(); return ensureAudio().catch(() => {}); }
function setMode(m) { if (S.mode === m || (m === 'style' && S.pro)) return; if (S.jam) stop();   /* Pro is locked to Audio */ S.mode = m; if (m === 'audio') { S.bpm = BASE_BPM; S.tr = 0; S.custom = false; }
  updHeader(); updFretboard(true); updTimeline(); updTransport(); updLicks(); updMixer(); restart(); }
function startLick(i, m) {
  if (S.jam) stop();
  S.lick = i; S.lickMode = m; S.fb = 'lick'; if (m !== 'mine') S.ch.guide.mute = false; applyMix();
  const l = lk(i); S.loopKind = 'lick'; S.loop = { a: l.startTick, b: l.endTick };
  updFretboard(true); updTimeline(); updTransport(); updLicks(); updMixer();
  if (AU.playing) restart(l.startTick, true); else { AU.pausedTick = l.startTick; play(); }
}
const ACT = {
  tab: (d) => { if (d.v !== 'track' && AU.playing) stop(); S.tab = d.v; renderView(); },
  filter: (d) => { S.filter = d.v; renderLibrary(); },
  openTrack: (d) => { if (!DATA.packs[d.v]) return toast(d.v + ' is in production — LJ001 and LJ002 have assets delivered.'); if (D.id !== d.v) { setTrack(d.v); renderNotes(); } openPlayer(); },
  jam: (d) => { if (!DATA.packs[d.v]) return toast(d.v + ' is in production — LJ001 (A blues) and LJ002 (E minor) are ready to jam.');
    setTrack(d.v); renderNotes(); const want = { 'Pentatonic Blues':'blues', 'Natural minor':'natMinor' }[S.sType], has = (k) => D.scales.some(s => s[0] === k);
    const dk = mod(S.sKey - D.keyPc + 6, 12) - 6; openPlayer({ fb:'scale', scale: want && has(want) ? want : D.scales[0][0], mode: dk ? 'style' : 'audio', tr: dk ? Math.max(-5, Math.min(5, dk)) : 0 }); },
  back: () => { stop(); S.screen = 'library'; renderView(); },
  mode: (d) => setMode(d.v),
  fb: (d) => { if (d.v === 'lick' && !D.licks.length) return; S.fb = d.v; if (d.v === 'lick') { const li = lickAtTick(getTick()); if (li >= 0 && S.loopKind !== 'lick') S.lick = li; } updFretboard(true); updLicks(); frame(true); },
  openScale: () => openSheet('scale'), openLoop: () => openSheet('loop'), closeSheet: (d, e, el) => { if (el.id === 'sheetbg' && e.target !== el) return; closeSheet(); },
  scale: (d) => { S.scale = d.v; if (S.fb === 'chord') S.fb = 'scale'; renderSheet(); updFretboard(true); },
  pos: (d) => { S.pos = d.v; renderSheet(); updFretboard(true); }, labels: (d) => { S.labels = d.v; renderSheet(); updFretboard(false); },
  targets: () => { S.targets = !S.targets; renderSheet(); updFretboard(false); },
  seek: (d) => { const t = +d.v * TPB; if (S.loop && (t < S.loop.a || t >= S.loop.b)) { S.loopKind = null; S.loop = null; S.challenge = null; updTimeline(); updTransport(); updLicks(); } AU.pausedTick = t; restart(t); },
  play: () => { if (AU.playing) { const ch = S.challenge != null; S.challenge = null; stop(); if (ch) { updLicks(); toast('Scored run cancelled.'); } } else play(); },
  metro: () => { S.metro = !S.metro; updTransport(); updLicks(); }, countIn: () => { S.countIn = !S.countIn; updTransport(); },
  needStyle: () => toast(D.own ? 'Key change needs Style mode (MIDI + samples) — only Litejam Tracks have it.' : 'Tempo and key are fixed in Audio mode. Switch to Style to change them.'),
  bpm: (d) => { if (S.jam) stop(); S.bpm = Math.max(Math.round(BASE_BPM * 0.7 / 5) * 5, Math.min(Math.round(BASE_BPM * 1.4 / 5) * 5, S.bpm + +d.v)); updHeader(); updTransport(); restart(); },
  tr: (d) => { if (S.jam) stop(); S.tr = Math.max(-5, Math.min(5, S.tr + +d.v)); updHeader(); updFretboard(true); updTimeline(); updTransport(); updLicks(); restart(); },
  loopSet: (d) => { if (d.v === 'off') setLoop(null); else setLoop('blues', D.loop.a, D.loop.b); closeSheet(); },
  ab: (d) => { const b = +d.v; if (S.abA == null) { S.abA = b; renderSheet(); } else { const a = Math.min(S.abA, b), z = Math.max(S.abA, b); S.abA = null; setLoop('ab', a * TPB, (z + 1) * TPB); closeSheet(); } },
  lickLoop: (d) => { closeSheet(); startLick(+d.v, viewMode(S.lickMode)); },
  lickPractice: (d) => startLick(+d.v, d.m),
  lickStop: () => { if (AU.playing) stop(); ACT.exitLick(); },
  viewToggle: () => setView(!S.pro),
  simpleSpeed: (d) => setSpeed(d.v),
  mixToggle: () => { S.mixOpen = !S.mixOpen; updMixer(); },
  lickOpen: (d) => { const i = +d.v, l = lk(i); if (AU.playing) stop(); S.challenge = null; S.lick = i; S.lickMode = viewMode(S.lickMode); S.fb = 'lick'; S.loopKind = 'lick'; S.loop = { a:l.startTick, b:l.endTick }; AU.pausedTick = l.startTick;   // open a lick card without starting playback (to reach its takes)
    updFretboard(true); updTimeline(); updTransport(); updLicks(); frame(true); },
  recType: (d) => { S.recVideo = d.v === 'video'; updLicks(); toast(S.recVideo ? 'Jam & Record will use your camera and microphone.' : 'Jam & Record will use your microphone only.'); },
  cBpm: (d) => { ACT.bpm(d); updLicks(); updBoard(); }, cTr: (d) => { ACT.tr(d); updBoard(); },
  scoreHint: () => toast('Scores count at Slow, Medium or Full in the original key. Pick one in the Speed row.'),
  passMode: (d) => { S.lickOnce = d.v === 'once'; updLicks(); toast(S.lickOnce ? 'Once: one round, then it stops.' : 'Loop: up to ' + ROUNDS_MAX + ' rounds back to back, then it stops.'); },
  exitLick: () => { S.challenge = null; S.ch.guide.mute = true; applyMix(); S.fb = 'scale'; updFretboard(true); updMixer(); setLoop(null); },
  mute: (d) => { S.ch[d.v].mute = !S.ch[d.v].mute; applyMix(); updMixer(); }, solo: (d) => { S.ch[d.v].solo = !S.ch[d.v].solo; applyMix(); updMixer(); },
  sKey: (d) => { S.sKey = +d.v; renderScaleTab(); }, sType: (d) => { S.sType = d.v; renderScaleTab(); },
  demo: (d) => demo(d.v),
  coachTip: () => coachTip(),
  coachNext: () => { const cat = trackCat(), ids = CHARS.map(x => x.id).filter(id => id !== ST.cast.you), nx = ids[(ids.indexOf(ST.cast.coach) + 1) % ids.length];
    U.coach = U.coach || {}; U.coach[cat] = nx; saveU(); updStage(); updMixer(); frame(true); toast(CHARMAP[nx].name + ' now coaches your ' + cat + ' tracks.'); },
  lickCount: () => { S.lickCount = !S.lickCount; updLicks(); toast(S.lickCount ? 'Half-bar count-in on: 2 beats before every lick pass.' : 'Count-in off: lick passes loop back to back.'); },
  pickTrack: (d) => { if (D.id !== d.v) setTrack(d.v); renderNotes(); if (S.tab === 'track' && S.screen === 'player') openPlayer(); else renderView(); },
};
let holdT = null, holdAt = 0;                 // band members: tap = mute, hold = solo
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (!el) return; if (Date.now() - holdAt < 700 && el.closest('.band')) return; const fn = ACT[el.dataset.act]; if (fn) fn(el.dataset, e, el); });
document.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-hold]'); clearTimeout(holdT); if (!b) return; const k = b.dataset.hold;
  holdT = setTimeout(() => { holdAt = Date.now(); ACT.solo({ v:k }); const nm = (CH.find(c => c[0] === k) || [])[1] || k; toast(S.ch[k].solo ? nm + ' solo — hold again to bring the band back.' : nm + ' solo off.'); }, 450); });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => clearTimeout(holdT)));
document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-hold]')) e.preventDefault(); });
document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.vol; if (!k) return; S.ch[k].vol = +e.target.value; applyMix(); const v = $('v-' + k); if (v) v.textContent = S.ch[k].mute ? '—' : S.ch[k].vol + '%'; });

/* ================= feature notes (Thai) ================= */
const FEATURES = [
  ['F1', 'Track Library — คลัง Litejam Tracks', 'หน้าแรกของแท็บ Play with Track เปลี่ยนจาก “อัปโหลดเพลงเอง” เป็นคลังเพลงที่ Litejam ผลิต 10 แทร็ก กรองตามระดับได้ การ์ดแต่ละใบบอกสไตล์ คีย์ BPM สเกลที่ใช้ และของที่มีในแทร็ก ส่วนอัปโหลดเพลงเอง (V1) ยังอยู่เป็นทางเลือกด้านล่าง',
    ['Metadata MASTER › Track_Info'], [['LJ001 + LJ002', 'ok', 'เล่นได้แล้ว 2 แทร็ก อีก 8 แทร็กแสดงเป็น In production']]],
  ['F2', 'Audio mode + Mixer — เล่นกับ stem จริง', 'เล่นเสียงที่ producer อัดมา แยกปรับกลอง เบส และ harmony ได้ทีละช่อง (Mute, Solo, Volume) เช่นปิดเบสเพื่อฝึกเดินเบสเอง หรือ Solo กลองเพื่อฝึกจังหวะ ใน mix ไม่มีกีตาร์ลีดตามบรีฟ จึงเหลือที่ให้ผู้เล่น',
    ['01_AUDIO › Drums / Bass / Harmony .wav'], [['LJ001', 'ok', 'stem ครบ 3 ไฟล์ (Drums, Bass, Organ) ความยาวและจุดเริ่มตรงกัน'], ['LJ002', 'ok', 'stem ครบ 3 ไฟล์ (Drums, Bass, Rhythm Guitar) ยาว 16 บาร์พอดี แต่ producer วางไว้ในโฟลเดอร์ใหม่ 06_STEMS และยังใช้ชื่อไฟล์เดิม']]],
  ['F3', 'Chord timeline + NOW / NEXT', 'แถบคอร์ดรายบาร์เลื่อนตามเพลง แตะบาร์เพื่อกระโดดไปเล่นจากตรงนั้น ด้านบนแสดงคอร์ดปัจจุบันตัวใหญ่ คอร์ดถัดไป และจุดจังหวะ 4 จุดต่อบาร์',
    ['Track_Info › chords_by_bar', '02_MIDI_STYLE › Harmony.mid'], [['LJ001', 'ok', 'คอร์ดถอดจาก MIDI ออร์แกน รอ producer ยืนยัน'], ['LJ002', 'ok', 'ไม่มี MIDI ของ harmony จึงใช้ root จาก MIDI เบส + ชนิดคอร์ดตามบรีฟ (Em | C | G | D) รอ producer ยืนยัน']]],
  ['F4', 'Scale on fretboard — หัวใจของ Scale Mode', 'เฟรตบอร์ด (และ LED บนกีตาร์) ติดสเกลที่เหมาะกับแทร็กทันที แต่ละแทร็กมี 3 ตัวเลือกไล่ระดับ จบที่ Follow the chord ซึ่งเปลี่ยนสเกลตามคอร์ด มี Box position, แสดงเป็นโน้ตหรือ degree และ Target notes ที่วงขาวโน้ตในคอร์ดปัจจุบันให้เล็งลงจังหวะเปลี่ยนคอร์ด',
    ['Track_Info › scale_focus', 'chords_by_bar'], [['LJ001', 'ok', 'A Minor Pentatonic · A Blues · Mixolydian ตามคอร์ด'], ['LJ002', 'ok', 'E Minor Pentatonic · E Natural Minor · pentatonic ตามคอร์ด']]],
  ['F5', 'Smart Loop — ลูปตามท่อน', 'ลูปได้ 3 แบบ: ลูปหลักตามจุดลูปใน metadata, ลูปเฉพาะ lick, และ A–B เลือกบาร์เอง ลูปต่อกันแบบ sample-accurate',
    ['Track_Info › loop_start_tick / loop_end_tick', '01_AUDIO'], [['LJ001', 'wait', 'ยังไม่ได้ export เป็น seamless loop (15 บาร์ มีท่อนจบ) รอยต่อบาร์ 8→1 จึงสะดุดเล็กน้อย'], ['LJ002', 'ok', 'stem และ MIDI ยาว 16 บาร์พอดี (34.9 วินาที) ลูปทั้งเพลงได้เลย ยังไม่ได้ฟังรอยต่อด้วยหู']]],
  ['F6', 'Style mode — เปลี่ยน tempo และคีย์', 'สลับจากเสียงอัดเป็นการเล่นใหม่จาก MIDI + sample ในแอป จึงปรับ tempo และเปลี่ยนคีย์ ±5 ได้โดยเสียงไม่เพี้ยน คอร์ด สเกล และ lick บนเฟรตบอร์ดย้ายตามคีย์ใหม่ทั้งหมด',
    ['02_MIDI_STYLE › .mid', '03_SAMPLES › DR / BS / HM .wav'], [['LJ001', 'wait', 'เล่นได้ครบ 3 เครื่อง แต่ sample มีแค่ 1 โน้ต 1 ระดับความแรง เสียงจึงบางและแข็ง'], ['LJ002', 'wait', 'มี MIDI เฉพาะกลองกับเบส ไม่มี MIDI และ chord-shot sample ของ rhythm guitar จึงเล่นได้แค่กลอง + เบส · tempo meta มาครบแล้ว']]],
  ['F7', 'Guide Licks — LED + Tab + Call & response', 'แต่ละ lick มี 3 โหมด: Listen ฟังกีตาร์จริงพร้อมไฟ LED วิ่งตามโน้ตและแท็บเลื่อน, Call & response สลับรอบ “ฟัง” กับ “ตาคุณ”, และ My turn ปิดเสียงไกด์เหลือแต่ไฟนำทาง ก่อนทุกรอบมี count-in ครึ่งบาร์ (2 จังหวะ นับ 3–4) และโน้ตแรกติดไฟเหลืองรอไว้ ผู้เล่นจึงตั้งมือทันโน้ตแรก และเปิด Metronome เสริมระหว่างฝึกได้จากแถบเดียวกัน เมื่อเล่นทั้งเพลงในโหมด Lick ไฟจะเปลี่ยน lick ให้เองตามบาร์',
    ['04_GUIDE_LICKS › Perf.wav', '05_TABS › .gp', 'Metadata MASTER › Lick_Index'], [['LJ001', 'wait', '3 lick (บรีฟขอ 4), Lick 3 ยาว 5 บาร์ และทุกตัวมี bend เต็มเสียง จึงยังไม่มีระดับ Beginner'], ['LJ002', 'wait', '3 lick (บรีฟขอ 4): Lick 1 ยาว 4 บาร์มี bend เต็มเสียง, Lick 2–3 ยาว 2 บาร์ เขบ็ต 1 ชั้นไม่มี bend แต่เล่นช่วงเฟรต 10–15 เกินเกณฑ์ Beginner (0–12)']]],
  ['F8', 'Metronome + Count-in ตาม time signature', 'นับเข้า 4 จังหวะตาม pulse ของเพลงก่อนเริ่ม และเปิด metronome ทับได้ จังหวะแรกของบาร์เน้นเสียงสูง',
    ['Track_Info › time_signature / pulse_note / bpm'], [['LJ001', 'ok', '12/8 นับด้วยโน้ตตัวดำประจุด'], ['LJ002', 'ok', '4/4 นับด้วยโน้ตตัวดำ']]],
  ['F9', 'Jam with this scale — ทางเข้าจากแท็บ Scale', 'ในแท็บ Scale เดิม เมื่อเลือกคีย์และชนิดสเกล จะมีการ์ดแนะนำแทร็กที่ใช้สเกลนั้น กดแล้วเข้า player พร้อมสเกลเดียวกัน ถ้าคีย์ไม่ตรงจะเปิด Style mode และย้ายคีย์ให้',
    ['Track_Info › key_center / scale_focus'], [['LJ001 + LJ002', 'ok', 'จับคู่ได้ครบ 10 แทร็ก กดเล่นได้ 2 แทร็ก เช่น A Pentatonic Blues → LJ001, E Pentatonic minor → LJ002']]],
  ['F10', 'คลังเพลงสำหรับหลักพันเพลง — ค้นหา หมวดหมู่ ภาพปก', 'หน้า Litejam Tracks ใหม่มีช่องค้นหา, แถว Continue jamming, Browse by 5 มิติ (Style, Scale, Level, Key, Tempo), แถวแนะนำเลื่อนแนวนอน และหน้ารายการที่กรองซ้อนกันได้พร้อมเรียงลำดับ ภาพปกสร้างอัตโนมัติและมี 3 แนวให้เทียบจากปุ่ม “แนวภาพปก” ด้านบน: (A) ฉากประจำ Style วาดเป็นภาพประกอบ 12 ฉาก แต่ละแทร็กได้มุมครอป โทนสี และรายละเอียดต่างกันเล็กน้อย (B) ฉากเดียวกัน + ตัวละคร Litejam Universe ประจำ Style บนการ์ดหมวด (C) LED fretboard ที่ติดไฟตามสเกลและคีย์จริงของเพลงนั้น ใส่ภาพจริงทับทีหลังได้ รายการยาวใส่เฉพาะแถวที่มองเห็นลงหน้าจอ จึงเลื่อน 1,200 แถวได้ลื่น',
    ['Track_Info › style / key_center / scale_focus / bpm / level'], [['ดีไซน์', 'new', 'ทดสอบด้วยคลังจำลอง 1,200 รายการ (ของจริง 10 + placeholder 1,190) หมวดหมู่ทั้งหมดมาจากคอลัมน์ที่มีอยู่แล้วใน Metadata MASTER ไม่ต้องขอข้อมูลเพิ่มจาก producer']]],
  ['F11', 'My Library + Playlist — ตั้งชื่อได้ 4 ทาง', 'My Library รวม playlist, Favourites และเพลงที่อัปโหลด สร้าง playlist ได้จากปุ่ม New playlist หรือจากเมนู ⋯ ของแทร็ก การตั้งชื่อมี 4 ทาง: (1) พิมพ์เองได้สูงสุด 40 ตัวอักษร (2) แตะชื่อแนะนำที่ระบบคิดจากแทร็กหรือเนื้อหาใน playlist เช่น “Blues jams” หรือ “A Pentatonic Blues practice” (3) เว้นว่าง ระบบตั้งให้เป็น “My playlist N” (4) เปลี่ยนชื่อภายหลังได้ทุกเมื่อ ชื่อซ้ำจะเติม (2) ให้เอง ปก playlist เลือกได้ 4 แบบ: ไอคอน (รวมอัปโหลดไอคอนเอง), ตัวละคร Litejam Universe แบบเคลื่อนไหว เลือกท่าได้, รูปหรือ GIF ที่อัปโหลดเอง และ Avatar ของผู้ใช้ ถ้าเปิดตัวเลือก collage ไว้ ปกจะเปลี่ยนเป็นภาพรวมของ 4 เพลงแรกเมื่อมีครบ 4 เพลง',
    ['ข้อมูลผู้ใช้ (ไม่ใช้ asset จาก producer)'], [['ดีไซน์', 'new', 'prototype เก็บ playlist ไว้ในเบราว์เซอร์นี้เท่านั้น แอปจริงต้องผูกกับบัญชีผู้ใช้']]],
  ['F12', 'อัปโหลดเพลงเอง — เหลือ feature อะไรบ้าง', 'อัปโหลดได้จาก My Library ก่อนอัปโหลดมีรายการ “ได้อะไร” กับ “มีเฉพาะใน Litejam Tracks” ให้เห็นชัด ตั้งชื่อแทร็กได้โดยระบบดึงจากชื่อไฟล์มาให้ก่อน และต้องยืนยันสิทธิ์ใช้งาน หน้า player ของเพลงอัปโหลดตัด Style mode กับ Guide licks ออก ติดป้าย AI แก้คอร์ดและคีย์ที่ AI ฟังผิดได้ ช้าลงได้ 50–100% และแนะนำ Litejam Tracks คีย์เดียวกันแทน feature ที่ล็อกไว้',
    ['ไฟล์ของผู้ใช้ + AI analysis'], [['ดีไซน์', 'new', 'prototype จำลองผลวิเคราะห์ด้วยเสียงของ LJ002 · การช้าลงใน prototype ทำให้เสียงต่ำลงด้วย แอปจริงต้องใช้ time-stretch · เพดาน 10 นาทีและ 5 เพลงในแพ็กฟรีเป็นตัวเลขสมมติ']]],
];
FEATURES.push(['F13', 'โปรไฟล์ + Scored run + Leaderboard ต่อแทร็ก', 'ผู้ใช้มีโปรไฟล์ (ชื่อที่แสดง + Avatar เป็นตัวละคร Litejam Universe หรือรูป/GIF ของตัวเอง) แต่ละ lick มีปุ่ม Scored run: นับเข้าครึ่งบาร์ เล่น 1 รอบโดยไม่มีเสียงไกด์ แล้วขึ้นผลคะแนน (คะแนน, ดาว, % โน้ตที่โดน, ความแม่นจังหวะ, อันดับที่เปลี่ยน) คะแนนของแทร็ก = คะแนนดีที่สุดของแต่ละ lick รวมกัน Leaderboard ของแต่ละ backing track มีแท็บ This week / All time / Friends โพเดียม 3 อันดับแรกพร้อม Avatar และแถวของผู้ใช้ปักไว้เสมอ หน้ารายการเพลงแสดงคะแนนดีที่สุดของผู้ใช้ด้วย Scored run และ Leaderboard อยู่ใน Normal view เท่านั้น ส่วน Pro เป็นการฝึกอิสระที่ไม่มีคะแนน คะแนนแยกเป็น 3 หมวดตาม preset ความเร็ว คือ Slow, Medium และ Full (คีย์เดิม) แต่ละหมวดมีคะแนนดีที่สุดและ Leaderboard ของตัวเอง ข้อมูลผู้ใช้จึงตกอยู่ใน 3 กลุ่มที่เทียบกันได้ ส่วน Custom (ปรับ BPM หรือคีย์เอง) เป็นการฝึกเท่านั้น ไม่เก็บคะแนน',
  ['04_GUIDE_LICKS + 05_TABS (โน้ตเฉลยของ lick)', 'บัญชีผู้ใช้'], [['ดีไซน์เผื่ออนาคต', 'new', 'คะแนนและรายชื่อใน prototype เป็นข้อมูลจำลอง ของจริงต้องมี (1) การตรวจจับโน้ตจากกีตาร์ (2) ระบบบัญชีและ backend เก็บคะแนน กติกาที่วางไว้: นับเฉพาะ Audio mode ที่ tempo เดิม เพื่อให้ทุกคนเล่นโจทย์เดียวกัน และเพลงที่อัปโหลดเองไม่มี leaderboard']]]);
FEATURES.push(['F14', 'All licks + Jam & Record ในทุก lick (Pro view · Audio mode)', 'การ์ด All licks รวมทุก lick ของแทร็กเป็นโซโลเดียว ฝึกได้เหมือน lick เดี่ยว ใน Pro view ทุกการ์ด (Lick 1–3 และ All licks) มีปุ่มแดง ● Jam & Record ปุ่มเดียว ผู้ใช้เลือกแบบก่อนด้วยปุ่ม Call & response หรือ My turn ของการ์ดนั้น ปุ่มแดงจะเปลี่ยนจากแดงโปร่งเป็นแดงทึบพร้อมบรรทัดบอกว่าจะอัดแบบไหน แล้วกดเพื่ออัดในแบบที่เลือก (ถ้ายังไม่เลือกแบบ ปุ่มจะแจ้งให้เลือกก่อน) แบบการอัดมี 2 แบบ: Call & response = เล่น lick ต้นฉบับ 1 รอบ ตามด้วย backing track ช่วงบาร์เดียวกันให้ผู้ใช้ตอบ สลับกันไป, My turn = backing track อย่างเดียว ทั้งสองแบบนับเข้า 1 บาร์ครั้งเดียวตอนเริ่ม แล้วเล่นต่อกันโดยไม่มี count-in คั่น ตัวเลือก Loop / Once ใช้กับการอัดด้วย: Once อัด 1 รอบแล้วบันทึกเอง, Loop อัดได้สูงสุด 5 รอบหรือจนกว่าจะกดหยุด เลือกชนิดการอัดได้บนการ์ดที่เปิดอยู่: 🎙 Audio หรือ 🎥 Video (เสียงพร้อมวิดีโอ) แบบวิดีโอใช้กล้องหน้า ระหว่างอัดเวทีจะเปลี่ยนเป็นจอแบบ duet ของ TikTok คือภาพผู้ใช้อยู่ซ้าย และถ้าแทร็กนั้นมีคลิปศิลปินสำหรับ Call & response ศิลปินจะอยู่ขวาและเล่นท่อน lick ต้นฉบับ (mockup: เปิดไว้เฉพาะ LJ002 Classic Rock in Em ครึ่งขวาเป็นเฟรมวิดีโอจำลองของศิลปิน ใช้ตัวละครโค้ชถ่ายครึ่งตัวในห้อง มีป้าย MOCKUP ป้ายสถานะว่ากำลังเล่น lick หรือกำลังฟัง และแถบความคืบหน้าของท่อน) ถ้าไม่มีคลิปศิลปินหรือเป็น My turn จะเห็นภาพผู้ใช้เต็มจอ Take วิดีโอเปิดดูย้อนหลังพร้อมวงได้ และทุก take มีปุ่ม ⬇ บันทึกไฟล์ Take เก็บไว้ใต้ lick ที่อัด เปิดฟังพร้อมวงแบบเดียวกับตอนอัดได้ เปลี่ยนชื่อหรือลบได้ ไม่มีคะแนน Pro ล็อกที่ Audio mode ความเร็วเต็ม จึงอัดทับ stem จริงเสมอ การ์ด Jam & Record แบบเดิมที่อัดทับไฟล์ Licks_Demo ทั้งเพลงถูกตัดออกแล้ว',
  ['01_AUDIO › stems', '04_GUIDE_LICKS › Licks_All_Perf.wav'], [['LJ001 + LJ002', 'ok', 'อัดได้ทุก lick และ All licks ใน Audio mode'], ['prototype', 'new', 'Take เก็บไว้จนกว่าจะรีเฟรชหน้า · ต้องอนุญาตไมโครโฟน (และกล้องสำหรับวิดีโอ) ถ้าไม่มีกล้องจะอัดเสียงอย่างเดียว ถ้าไม่มีไมค์จะบันทึกเป็น take เงียบ · ไฟล์ที่กด ⬇ มีเฉพาะภาพและเสียงของผู้ใช้ ยังไม่ได้รวมเสียงวงหรือภาพศิลปินเป็นคลิปเดียว · ไฟล์ Licks_Demo.wav ไม่ได้ใช้แล้วแต่ยังฝังอยู่ใน media'], ['producer', 'wait', 'ยังไม่มีวิดีโอศิลปินจริงสำหรับ duet ต้องขอเพิ่มเป็น asset ต่อ lick']]]);
FEATURES.push(['F15', 'เชื่อมกีตาร์จริงผ่าน BLE — ไฟ LED ตามหน้าจอ', 'ปุ่ม Connect ที่แถบบนสุดเชื่อมกีตาร์ Litejam ผ่าน Web Bluetooth เมื่อเชื่อมแล้วไฟบนเฟรตบอร์ดจริงจะตามหน้าจอทุกโหมด: สเกล (root แดง, โน้ตสเกลน้ำเงิน, Target notes ขาว), Chord tones, และ Lick ที่ไฟเขียวคือโน้ตที่ต้องเล่นตอนนี้ ไฟเหลืองคือโน้ตถัดไป รวมถึงแท็บ Scale เดิม มีหน้าสถานะแสดงชื่อกีตาร์ แบตเตอรี่ จำนวนเฟรมที่ส่ง ปุ่มทดสอบไฟ และปุ่มปิดไฟ',
  ['โปรโตคอลเดียวกับแอป: service 00EE › characteristic EE04'], [['ต้องทดสอบกับกีตาร์จริง', 'new', 'เขียนตามรูปแบบเฟรมของแอป Litejam และทดสอบกับอุปกรณ์จำลองแล้ว แต่ยังไม่ได้ลองกับกีตาร์จริง · ใช้ได้ใน Chrome หรือ Edge บนคอมพิวเตอร์และ Android ผ่าน https หรือ localhost · iPhone และ iPad เชื่อมไม่ได้ · ต้องปิดแอป Litejam บนมือถือก่อน']]]);
FEATURES.push(['F16', 'เวที + วงเป็นตัวละคร Litejam Universe', 'ส่วนบนของ player เป็นเวที สีฉากตาม Style ของแทร็ก โค้ชประจำ Style ยืนซ้าย ตัวละครของผู้ใช้ยืนขวา (ใช้ตัวละครจากโปรไฟล์ แตะเพื่อเปลี่ยน) คอร์ด NOW / NEXT และจุดจังหวะยังอยู่แถวเดิมเหนือเวที ตัวใหญ่ชัดเหมือนก่อน ตอนเล่นแสงไฟส่องคนที่กำลังเล่นและตัวละครดีดตามจังหวะ 2 บีตต่อรอบ แตะโค้ชเพื่อขอคำแนะนำ เช่น โน้ตเป้าหมายของคอร์ดตอนนั้น ส่วน Mixer กลับมาเป็นแถบ M / S / volume ต่อ stem เหมือนเวอร์ชันธรรมดา (เลิกใช้ “The band” ที่เป็นตัวละคร) และพับเก็บไว้ใต้หัวข้อ Mixer แตะหัวข้อเพื่อกางออก',
  ['Litejam Universe Pixel V2 › idle / attack / slash atlas', '01_AUDIO › stems', 'Metadata MASTER › style'], [['ใช้ได้แล้ว', 'ok', 'ใช้ sprite จริง 9 ตัวละคร · โค้ชต่อ Style และตัวละครประจำ stem เป็นข้อเสนอ ยังแก้ได้ แตะ ⇄ ที่ป้ายโค้ชเพื่อเปลี่ยนโค้ชของ Style นั้นเอง'], ['Punkman (Alex Maybe)', 'ok', 'ตัวละครตัวที่ 9 จาก punkman › pixel_v2 (idle, walk, attack, power) เลือกเป็นตัวละครของผู้ใช้ ปกเพลย์ลิสต์ หรือโค้ชได้ และเป็นตัวแรกที่มีท่า reaction จาก reactions_v3: เป็นโค้ชจะชูกำปั้นเมื่อ PERFECT ยิ้มเมื่อ GOOD ทำหน้าเสียดายเมื่อ MISS และ celebrate ตอน Ultimate · ยังไม่มี atlas ท่า slash จึงใช้ท่า power แทนตอน Ultimate'], ['ต้องการ source เพิ่ม', 'v2', 'ทุกตัวละครตอนนี้ถือกีตาร์ ถ้าต้องการมือกลอง / เบส / คีย์บอร์ดที่ตรงเครื่อง ต้องมี sprite ท่าใหม่']]]);
FEATURES.push(['F17', 'Call & response กับโค้ช', 'ตอนฝึก lick เวทีสูงขึ้นและแสดงว่าใครเล่นอยู่: รอบ LISTEN ไฟส่องโค้ช โค้ชเล่นพร้อมบอลลูนคำแนะนำ 1 ประโยคต่อรอบ รอบ YOUR TURN ไฟย้ายมาที่ตัวละครของผู้ใช้ ป้ายซ้ายบนบอกรอบและนับ 3–4 ตอน count-in ป้ายขวาบนบอกบาร์ คำแนะนำสร้างจากโน้ตของ lick นั้นจริง ๆ เช่น โน้ตแรกอยู่เฟรตไหนสายไหน โน้ตที่ต้อง bend ขึ้นเท่าไร โน้ตที่ใส่ vibrato และโน้ตจบเป็นโน้ตอะไรของคอร์ด',
  ['05_TABS › .gp (string, fret, bend, vibrato)', '04_GUIDE_LICKS › Perf.wav', 'Chord_Progression'], [['LJ001 + LJ002', 'ok', 'ใช้ได้กับทุก lick และ All licks ทั้ง Listen, Call & response และ My turn']]]);
FEATURES.push(['F18', 'YOUR TURN — ผลตอบรับรายโน้ต', 'ตอนผู้ใช้เล่น (Call & response, My turn, Scored run) แต่ละโน้ตขึ้น PERFECT / GOOD / MISS พร้อมแต้ม มี COMBO แถบจุดรายโน้ตใต้เวที และ Power meter ที่เต็มแล้วตัวละครทำท่า Ultimate โค้ชชมเมื่อ bend หรือ vibrato ตรง ใน Scored run มี “Ghost” คือผู้เล่นอันดับถัดไปบน leaderboard ให้ไล่ตาม และคะแนนสรุปท้ายรอบคิดจากผลรายโน้ตชุดเดียวกับที่เห็นบนเวที',
  ['05_TABS (โน้ตเฉลย)', 'Litejam Universe › fx-charge / fx-charged-bolt'], [['ผลตัดสินเป็นการจำลอง', 'new', 'prototype สุ่มผลของแต่ละโน้ต เพราะยังไม่มี note detection แอปจริงต้องฟังเสียงกีตาร์หรืออ่านจากกีตาร์ Litejam'], ['กติกาเป็นข้อเสนอ', 'new', 'lick ละ 1,000 แต้ม · GOOD ได้ 60% · Power เต็มแล้วได้ท่า Ultimate อย่างเดียว ยังไม่บวกแต้ม']]]);
FEATURES.push(['F19', 'Normal view / Pro view — แบ่งหน้าที่ชัดเจน', 'หน้า player มี 2 มุมมอง สลับด้วยสวิตช์ “Pro” ข้างคำอธิบายด้านบน หน้าเปิดมาเป็น Normal ทุกครั้ง (ไม่จำ Pro ข้ามการเข้าใช้) Normal = เล่นตามโค้ชแล้วเก็บคะแนน และเป็นที่เดียวที่มี Style mode: แต่ละ lick มีปุ่มเขียว ▶ Practise การ์ดที่กำลังฝึกกางออกเป็น 👂 Listen กับ 🔁 Copy me และปุ่มทอง 🏆 Play for score แถว Speed มี 4 ตัวเลือก คือ 🐢 Slow (70%) · Medium (85%) · ⚡ Full เป็น preset คีย์เดิมที่เก็บคะแนนได้ และ 🎛 Custom ที่ปรับ BPM กับคีย์ได้อิสระแต่เป็นการฝึกเท่านั้น Slow / Medium / Custom เล่นด้วย MIDI + samples ส่วน Full เล่น stem จริง Leaderboard แยกตาม preset ทั้ง 3 Pro = ฝึกอิสระ ล็อกที่ Audio mode ความเร็วเต็มเสมอ ไม่มี Style, BPM, คีย์, คะแนน หรือ Leaderboard และใช้การ์ดแบบพับเหมือน Normal: แต่ละ lick เห็นปุ่มเขียว ▶ Jam ปุ่มเดียว การ์ดที่เปิดอยู่จึงมี ⇄ Call & response กับ 🎸 My turn ปุ่มแดง ● Jam & Record ปุ่มเดียว และตัวเลือกเล็ก 2 ชุด (Loop ×5 / Once กับ 🎙 Audio / 🎥 Video) จำนวน take ของ lick ที่พับอยู่แสดงเป็นป้ายเล็กให้แตะเปิด นับเข้า 1 บาร์เฉพาะตอนเริ่ม แล้วเล่นต่อกันไม่มี count-in คั่น เลือก Loop (วนได้สูงสุด 5 รอบแล้วหยุดเอง) หรือ Once ได้ เมื่อเปิด Pro ขณะอยู่ที่ Slow / Medium / Custom ระบบกลับมา Full ให้เอง สีปุ่มมีความหมายเดียวกันตลอด: เขียว = เล่น, ฟ้า = ฟัง, ทอง = คะแนน, แดง = อัดเสียง', ['02_MIDI + 03_SAMPLES (Slow / Medium / Custom)', '01_AUDIO › stems (Full, Pro)'], [['prototype', 'new', 'ปุ่ม “ลองดู” ของ F14, F18 เปิด Pro ให้เอง และ F6, F13 กลับมา Normal ให้เอง · คะแนนและ Leaderboard ยังเป็นข้อมูลจำลอง'], ['LJ002', 'wait', 'Slow / Medium / Custom เหลือแค่กลองกับเบส เพราะยังไม่มี MIDI + samples ของ harmony']]]);
const OWN_ROWS = [
  ['เล่นเสียง + Mixer', 'stem จริงจาก producer + กีตาร์ไกด์', 'stem ที่ AI แยก (Drums / Bass / Other) คุณภาพขึ้นกับไฟล์'],
  ['Chord timeline', 'นักดนตรีตรวจแล้ว', 'AI ถอด แก้เองได้ทีละบาร์หรือทุกบาร์ที่เป็นคอร์ดเดียวกัน'],
  ['สเกลบนเฟรตบอร์ด + LED', 'สเกลที่คัดไว้ 3 ระดับ', 'แนะนำจากคีย์ที่ AI ตรวจ แก้คีย์และ major / minor เองได้'],
  ['Loop', 'ลูปหลัก + ลูป lick + A–B', 'ทั้งเพลง + A–B'],
  ['เปลี่ยน tempo', 'Style mode เสียงไม่เพี้ยน', 'ช้าลงได้ 50–100% เท่านั้น'],
  ['เปลี่ยนคีย์', '±5 ใน Style mode', 'ไม่มี'],
  ['Guide licks (LED + tab + call & response)', 'มี', 'ไม่มี'],
  ['Metronome + count-in', 'ตรง grid ของเพลง', 'ตาม beat ที่ AI ตรวจ'],
  ['Playlist, Favourites, ตั้งชื่อ', 'มี', 'มี และตั้งชื่อแทร็กเองได้'],
  ['Scored run + Leaderboard', 'มี (ดีไซน์เผื่ออนาคต)', 'ไม่มี เพราะไม่มีโน้ตเฉลยที่ตรวจแล้ว'],
  ['ข้อจำกัด', '—', 'ไฟล์ไม่เกิน 10 นาที · เป็นส่วนตัว ไม่แชร์ · ต้องยืนยันสิทธิ์'],
];
const ASSET_ROWS = [
  ['01_AUDIO', 'F2, F5', 'stem ครบ 3 ไฟล์ · ยังไม่ seamless', 'มี FullMix.wav (16 บาร์) · “FullMix New.wav” ยาวราว 140 วินาที ยังไม่ได้เปิดตรวจ · “2.LJ002 Licks123.wav” เป็นชื่อเก่าซ้ำกับ Licks_Demo · ไม่มี Preview.mp3'],
  ['06_STEMS', 'F2', '—', 'โฟลเดอร์ใหม่ที่ producer สร้าง: 1.Drum / 2.Bass / 3.Rhythm Guitar .wav ตามบรีฟควรอยู่ใน 01_AUDIO ชื่อ LJ002_Drums / _Bass / _Harmony'],
  ['02_MIDI_STYLE', 'F3, F6', '3 ไฟล์แยกเครื่อง · ไม่มี tempo meta', 'Drums + Bass · มี tempo และ time-signature meta แล้ว · ขาด Style_Main, Harmony, StyleRender_Check · ทุก part ยังอยู่ ch1 · ไม่มี LOOP marker'],
  ['03_SAMPLES', 'F6', 'กลอง 4, เบส 1 โน้ต, ออร์แกน 1 โน้ต', 'กลอง 4 + เบส 1 โน้ต ระดับเดียว · เลขในชื่อไฟล์ไม่ตรง MIDI: Snare 037 (MIDI เล่น 38), OpenedHH 042 (46), Crash 049 (57), BS_033_E1 (วัดได้ E1 = 28) · ไม่มี HM · ไม่มี Sample_Map.csv'],
  ['04_GUIDE_LICKS', 'F7', 'Perf.wav 3 lick + รวม · ไม่มี .mid', 'Lick01–03_Perf, Licks_All_Perf, Licks_Demo ตั้งชื่อถูก · ไม่มี .mid'],
  ['05_TABS', 'F7', '.gp 3 lick + รวม', '.gp 4 ไฟล์ตั้งชื่อถูก อ่าน string/fret ได้ครบ · ไม่มี PDF · ไม่มีชื่อคอร์ดในแท็บ'],
  ['Metadata MASTER', 'F1, F3–F5, F8, F9', 'กรอกเบื้องต้นจาก audit', 'ยังไม่ได้ตรวจว่า producer กรอกแถว LJ002 แล้วหรือยัง'],
];
function renderNotes() {
  $('notes').innerHTML = `<h1>Scale Mode · <span>Play with Track V2</span></h1>
    <p class="lead">Prototype นี้เล่นด้วย source asset จริงที่ producer ส่งมาแล้ว 2 แทร็ก คือ <b>LJ001 Slow Blues in A</b> และ <b>LJ002 Classic Rock in Em</b> (stems, MIDI, samples, licks, tabs) เพื่อดูว่า asset แต่ละโฟลเดอร์กลายเป็น feature อะไรใน Scale Mode เลือกแทร็กแล้วกดปุ่ม “ลองดู” ในแต่ละข้อเพื่อให้หน้าจอด้านซ้ายแสดง feature นั้น</p>
    <div class="pick">ลองกับแทร็ก ${Object.keys(DATA.packs).filter(id => !DATA.packs[id].own).map(id => `<button class="chip ${D.id === id ? 'on' : ''}" data-act="pickTrack" data-v="${id}">${id} · ${esc(DATA.packs[id].title)}</button>`).join('')}<button class="chip ${S.demo ? 'on' : ''}" data-act="demoCat">คลังจำลอง 1,200 เพลง: ${S.demo ? 'เปิด' : 'ปิด'}</button></div>
    <div class="pick" id="artPick">แนวภาพปก ${[['scene', 'A · ฉากประจำ Style (ใช้เป็นหลัก)'], ['mascot', 'B · ฉาก + ตัวละคร'], ['led', 'C · LED fretboard ของเพลง']].map(x => `<button class="chip ${S.art === x[0] ? 'on' : ''}" data-act="artSet" data-v="${x[0]}">${x[1]}</button>`).join('')}</div>
    <h2>Features ที่ออกแบบจาก source asset</h2>` +
    FEATURES.map(f => `<div class="ft"><div class="top"><span class="id">${f[0]}</span><span class="nm">${f[1]}</span></div><p>${f[2]}</p>
      <div class="as">ใช้ asset: ${f[3].map(a => `<code>${a}</code>`).join('')}</div>
      ${f[4].map(s => `<div class="st ${s[1]}"><b>${s[0]}</b> ${s[1] === 'ok' ? '✓ ใช้ได้แล้ว' : (s[1] === 'new' ? '◆ ดีไซน์ใหม่' : '⚠ ต้องรอ v2')} — ${s[2]}</div>`).join('')}
      <button class="try" data-act="demo" data-v="${f[0]}">ลองดู ${f[0]} ›</button></div>`).join('') +
    `<h2>อัปโหลดเพลงเอง: เทียบกับ Litejam Track</h2><div class="tblwrap"><table class="tblx"><tr><th>Feature</th><th>Litejam Track</th><th>เพลงที่อัปโหลดเอง</th></tr>` + OWN_ROWS.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('') + `</table></div>
    <h2>ตรวจ source เทียบบรีฟ v2.1</h2><div class="tblwrap"><table class="tblx"><tr><th>โฟลเดอร์</th><th>Feature</th><th>LJ001 (ส่ง 8 พ.ย.)</th><th>LJ002 (ส่ง 13 พ.ย.)</th></tr>` +
    ASSET_ROWS.map(r => `<tr><td><code>${r[0]}</code></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('') + `</table></div>
    <p class="foot">ข้อจำกัดของ prototype: เสียงถูกแปลงเป็น AAC เพื่อให้ไฟล์เล็ก · ยังไม่เชื่อมไฟ LED กับกีตาร์จริง · ยังไม่มีการตรวจจับโน้ตที่ผู้เล่นเล่นหรือให้คะแนน · กีตาร์ไกด์ใน Style mode เป็นเสียงสังเคราะห์จากแท็บ เพราะเสียงอัดจริงเปลี่ยน tempo ไม่ได้<br>ไฟล์: <code style="color:#50BCFF">index.html</code> + <code style="color:#50BCFF">app.js</code> + <code style="color:#50BCFF">media/</code> · เพิ่มแทร็กใหม่ได้โดยเพิ่ม config ใน <code style="color:#50BCFF">build_media.py</code> แล้วรัน <code style="color:#50BCFF">python3 build_media.py</code></p>`;
}
function scrollToId(id) { setTimeout(() => { const el = $(id); if (el) $('view').scrollTop = Math.max(0, el.offsetTop - 8); }, 60); if (window.innerWidth <= 1020) window.scrollTo({ top: 0, behavior: 'smooth' }); }
function demo(id) {
  if (id === 'F1' || id === 'F10') { stop(); S.tab = 'track'; S.screen = 'library'; S.lib.view = 'discover'; renderView(); return scrollToId(id === 'F10' ? 'f-browse' : 'view'); }
  if (id === 'F11') { stop(); S.tab = 'track'; S.screen = 'library'; S.lib.view = 'mine'; renderView(); scrollToId('f-playlists'); return setTimeout(() => ACT.plNew({}), 350); }
  if (id === 'F12') { stop(); S.tab = 'track'; S.screen = 'library'; S.lib.view = 'mine'; renderView(); return setTimeout(() => ACT.upOpen(), 250); }
  if (D.own) { setTrack('LJ001'); renderNotes(); }
  if (['F14', 'F18'].includes(id) && !S.pro) setView(true, true);               // these demos show controls that live in Pro view
  if (['F6', 'F13'].includes(id) && S.pro) setView(false, true);                // tempo / key, scores and the leaderboard live in Normal view
  if (id === 'F2') S.mixOpen = true;
  if (id === 'F19') return openPlayer().then(() => { setView(false, true); scrollToId('f-licks'); });
  if (id === 'F15') return openPlayer().then(() => { ACT.bleOpen(); });
  if (id === 'F14') return openPlayer().then(() => { updLicks(); scrollToId('f-all'); });
  if (id === 'F13') return openPlayer().then(() => { scrollToId('f-board'); setTimeout(() => ACT.boardOpen(), 400); });
  if (id === 'F9') { stop(); S.tab = 'scale'; S.sKey = D.keyPc; S.sType = D.id === 'LJ001' ? 'Pentatonic Blues' : 'Pentatonic minor'; renderView(); return scrollToId('f-jam'); }
  const go = (fn, target) => openPlayer().then(() => { fn(); scrollToId(target); });
  if (id === 'F2') go(() => { setMode('audio'); if (!AU.playing) play(); }, 'f-mixer');
  if (id === 'F3') go(() => { if (!AU.playing) play(); }, 'nowbar');
  if (id === 'F4') go(() => { S.fb = 'scale'; S.scale = D.scales[1][0]; S.targets = true; updFretboard(true); openSheet('scale'); }, 'now');
  if (id === 'F5') go(() => { setLoop('blues', D.loop.a, D.loop.b); if (!AU.playing) play(); }, 'f-timeline');
  if (id === 'F6') go(() => { setSpeed('custom'); S.bpm = BASE_BPM - 10; updHeader(); updTransport(); restart(); if (!AU.playing) play(); }, 'f-transport');
  if (id === 'F7' || id === 'F17') go(() => { startLick(0, 'call'); }, 'now');
  if (id === 'F16') go(() => { if (!AU.playing) play(); }, 'now');
  if (id === 'F18') go(() => { startLick(0, 'mine'); }, 'now');
  if (id === 'F8') go(() => { S.metro = true; S.countIn = true; updTransport(); if (AU.playing) stop(); play(); }, 'f-transport');
}

initLibrary(); setTrack('LJ001'); renderNotes(); renderView();
window.LJ = { S, AU, BLE, FB, ledPayload, ledItems, getTick, play, stop, demo, ACT, setTrack, get D() { return D; } };   // exposed for debugging in the console
})();
