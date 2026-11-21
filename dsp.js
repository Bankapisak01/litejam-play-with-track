/* Jam with Track — audio analysis and time-stretch, all in the browser (no server).
   analyze()      tempo, bar lines, one chord per bar and the key, read from the audio itself.
   stretchPlan()  WSOLA: where to cut the audio so it can play slower (or longer, for a pitch shift) without changing pitch.
   stretchApply() applies one plan to any stem, so every stem stays in sync with the others. */
(function () {
'use strict';
const tick = () => new Promise(r => setTimeout(r, 0));

// every channel of every stem, summed to mono and reduced to roughly `target` Hz
function monoMix(bufs, target) {
  const sr = bufs[0].sampleRate, D = Math.max(1, Math.round(sr / target)), len = Math.max.apply(null, bufs.map(b => b.length)), n = Math.floor(len / D), x = new Float32Array(n);
  bufs.forEach(b => { for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c), m = Math.min(n, Math.floor(d.length / D));
    for (let i = 0; i < m; i++) { let s = 0; const o = i * D; for (let k = 0; k < D; k++) s += d[o + k]; x[i] += s / D; } } });
  return { x, sr: sr / D, D };
}

/* ---- tempo ---- */
function onsetEnv(x, sr) {                       // how much louder / brighter each 10 ms frame is than the one before
  const hop = Math.max(1, Math.round(sr / 100)), win = hop * 2, n = Math.max(0, Math.floor((x.length - win - 1) / hop)), fl = new Float32Array(n);
  let pe = 0, ph = 0;
  for (let i = 0; i < n; i++) { let e = 0, h = 0; const o = i * hop;
    for (let k = 0; k < win; k++) { const v = x[o + k], d = v - x[o + k + 1]; e += v * v; h += d * d; }
    const le = Math.log(1 + 2000 * e / win), lh = Math.log(1 + 8000 * h / win);
    fl[i] = Math.max(0, le - pe) + Math.max(0, lh - ph); pe = le; ph = lh; }
  const w = 50, out = new Float32Array(n), pre = new Float64Array(n + 1);            // minus the local average, so loud passages do not swamp the beat
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + fl[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - w), b = Math.min(n, i + w); out[i] = Math.max(0, fl[i] - (pre[b] - pre[a]) / (b - a)); }
  return { f: out, fps: sr / hop };
}
function tempo(env) {
  const f = env.f, fps = env.fps, n = Math.min(f.length, Math.round(fps * 120));
  const ac = (lag) => { const i0 = Math.floor(lag), fr = lag - i0, m = n - i0 - 2; if (m < 10) return 0; let s = 0; for (let i = 0; i < m; i++) s += f[i] * (f[i + i0] * (1 - fr) + f[i + i0 + 1] * fr); return s / m; };
  let best = -1, bb = 110;
  for (let b = 55; b <= 190; b += 0.5) { const L = 60 / b * fps; let sum = 0; for (let k = 1; k <= 8; k++) sum += ac(k * L);            // a real beat repeats at every multiple of its length
    const sc = sum / 8 * Math.exp(-0.5 * Math.pow(Math.log2(b / 100), 2)); if (sc > best) { best = sc; bb = b; } }
  // refine on the whole track: fold the envelope at each candidate beat length and keep the sharpest fold
  const N = f.length, fold = (b, bins) => { const P = 60 / b * fps, acc = new Float64Array(bins); for (let i = 0; i < N; i++) { const p = i / P; acc[Math.floor((p - Math.floor(p)) * bins)] += f[i]; } return acc; };
  let fb = bb, fs = -1;
  for (let b = bb - 1.5; b <= bb + 1.5; b += 0.01) { const a = fold(b, 24); let mx = 0; for (let k = 0; k < 24; k++) { const v = a[k] + 0.5 * (a[(k + 23) % 24] + a[(k + 1) % 24]); if (v > mx) mx = v; } if (mx > fs) { fs = mx; fb = b; } }
  let bpm = Math.round(fb * 100) / 100; if (Math.abs(bpm - Math.round(bpm)) < 0.08) bpm = Math.round(bpm);
  const L0 = 60 / bpm * fps, r2 = ac(2 * L0), r3 = ac(3 * L0), r4 = ac(4 * L0), triple = r3 > 1.15 * Math.max(r2, r4);      // pulses grouped in threes: 12/8, 6/8 or a waltz
  const a = fold(bpm, 64); let k0 = 0; for (let k = 1; k < 64; k++) if (a[k] > a[k0]) k0 = k;
  const spb = 60 / bpm; let phase = (k0 + 0.5) / 64 * spb - 0.015; if (phase < -0.07) phase += spb; if (phase > spb - 0.07) phase -= spb;      // a beat right at the start of the file stays the first beat
  return { bpm, phase, triple, r: [r2, r3, r4] };
}

/* ---- chords and key ---- */
const LO = 28, HI = 83;                          // E1 … B5
function beatChroma(x, sr, t0, spb, nBeats) {    // Goertzel filter at every semitone, one measurement per beat
  const K = HI - LO + 1, coef = new Float64Array(K); for (let k = 0; k < K; k++) coef[k] = 2 * Math.cos(2 * Math.PI * 440 * Math.pow(2, (LO + k - 69) / 12) / sr);
  const tre = [], bas = [], en = [];
  for (let b = 0; b < nBeats; b++) { const a = Math.max(0, Math.round((t0 + b * spb) * sr)), z = Math.min(x.length, Math.round((t0 + (b + 1) * spb) * sr)), c = new Float32Array(12), d = new Float32Array(12); let e = 0;
    if (z - a > 64) { const P = new Float64Array(K);
      for (let k = 0; k < K; k++) { const cf = coef[k]; let s1 = 0, s2 = 0; for (let i = a; i < z; i++) { const s0 = x[i] + cf * s1 - s2; s2 = s1; s1 = s0; } P[k] = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - cf * s1 * s2)) / (z - a); }
      for (let k = 0; k < K; k++) { const m = LO + k; let p = P[k]; if (k >= 28) p -= 0.6 * P[k - 28]; if (k >= 34) p -= 0.4 * P[k - 34]; if (p < 0) p = 0;      // take out the 5th and 7th harmonics of lower notes: they fake a major third and a b7
        if (m >= 48) c[m % 12] += p; if (m <= 55) d[m % 12] += P[k]; }
      for (let i = a; i < z; i += 4) e += x[i] * x[i]; e /= (z - a) / 4; }
    tre.push(c); bas.push(d); en.push(e); }
  return { tre, bas, en };
}
function chordOf(c, d) {                         // best major / minor triad for a treble chroma c and a bass chroma d
  let cm = 1e-12, dm = 1e-12; for (let i = 0; i < 12; i++) { if (c[i] > cm) cm = c[i]; if (d[i] > dm) dm = d[i]; }
  let best = -1e9, pc = 0, q = 'maj';
  for (let r = 0; r < 12; r++) for (let t = 0; t < 2; t++) { const th = t ? 3 : 4, ot = t ? 4 : 3;
    const sc = (c[r] + 0.8 * c[(r + th) % 12] + 0.9 * c[(r + 7) % 12] - 0.6 * c[(r + ot) % 12]) / cm + 0.9 * d[r] / dm;
    if (sc > best) { best = sc; pc = r; q = t ? 'min' : 'maj'; } }
  const m3 = c[(pc + 3) % 12], M3 = c[(pc + 4) % 12], amb = Math.max(m3, M3) < 0.35 * c[pc] || Math.abs(M3 - m3) < 0.4 * Math.max(m3, M3);   // power chords and riffs leave the third unclear
  if (q === 'maj' && !amb && M3 > 1.5 * m3 && c[(pc + 10) % 12] > 0.62 * (c[pc] + M3 + c[(pc + 7) % 12]) / 3) q = 'dom7';
  return { pc, q, score: best, amb, ratio: (q === 'min' ? m3 / (M3 + 1e-12) : M3 / (m3 + 1e-12)) };
}
function barsFrom(ch, start, bpb, minBeats) {    // group beats into bars from beat `start`
  const out = []; for (let b = start; b + minBeats <= ch.tre.length; b += bpb) { const c = new Float32Array(12), d = new Float32Array(12); let e = 0, n = 0;
    for (let k = b; k < Math.min(ch.tre.length, b + bpb); k++) { for (let i = 0; i < 12; i++) { c[i] += ch.tre[k][i]; d[i] += ch.bas[k][i]; } e += ch.en[k]; n++; }
    out.push({ c, d, e: e / n }); }
  return out;
}
const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(a, b, rot) { let ma = 0, mb = 0; for (let i = 0; i < 12; i++) { ma += a[(i + rot) % 12]; mb += b[i]; } ma /= 12; mb /= 12; let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { const x = a[(i + rot) % 12] - ma, y = b[i] - mb; n += x * y; da += x * x; db += y * y; } return n / Math.sqrt(da * db + 1e-12); }
function keyOf(bars, chords) {
  const tot = new Float32Array(12); bars.forEach(b => { for (let i = 0; i < 12; i++) tot[i] += b.c[i]; });
  const real = chords.filter(c => !c.nc), first = real[0]; let best = -1e9, keyPc = 0, minor = false;
  const SC = [[0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10]];
  for (let r = 0; r < 12; r++) for (let m = 0; m < 2; m++) { const n = Math.max(1, real.length);
    const on = real.filter(c => c.pc === r).length / n, dia = real.filter(c => SC[m].includes((c.pc - r + 12) % 12)).length / n;      // tonic chord share · roots inside the scale
    const sc = corr(tot, m ? KS_MIN : KS_MAJ, r) + 0.45 * on + 0.5 * dia + (first && first.pc === r ? 0.4 : 0); if (sc > best) { best = sc; keyPc = r; minor = !!m; } }
  const blues = !minor && real.length > 0 && real.filter(c => [0, 5, 7].includes((c.pc - keyPc + 12) % 12)).length >= real.length * 0.85 && real.filter(c => c.q === 'dom7').length >= real.length * 0.2;      // only I, IV, V and plenty of 7th chords
  return { keyPc, minor, blues };
}

/* analyze(bufs, { onStage, bpm, off, bpb, mix }) — pass bpm + off to keep an edited grid and only re-read the chords */
async function analyze(bufs, o) {
  o = o || {}; const st = o.onStage || function () {}; let bpb = o.bpb || 4, dbg = null;
  st(0); await tick(); const mix = o.mix || monoMix(bufs, 11025), dur = mix.x.length / mix.sr;
  let bpm = o.bpm, phase = 0, fixed = o.bpm != null && o.off != null;
  if (!fixed) { st(1); await tick(); const tp = tempo(onsetEnv(mix.x, mix.sr)); bpm = tp.bpm; phase = tp.phase; dbg = tp.r;
    if (tp.triple && !o.bpb) { if (bpm >= 130) bpm = Math.round(bpm / 3 * 100) / 100; else bpb = 3; } }      // fast pulse in threes = compound time: the beat is three pulses long · slower = three beats in a bar
  st(2); await tick(); const spb = 60 / bpm; let off, bars;
  if (fixed) { off = o.off; bars = barsFrom(beatChroma(mix.x, mix.sr, off, spb, Math.floor((dur - off) / spb)), 0, bpb, Math.ceil(bpb / 2)); }
  else { const ch = beatChroma(mix.x, mix.sr, phase, spb, Math.floor((dur - phase) / spb)), nB = ch.tre.length;
    // the bar line: where the harmony changes most often, where one chord fits each bar best, and (a little) where the file starts
    const vec = ch.tre.map((c, i) => { const v = new Float32Array(24); let n = 1e-12; for (let k = 0; k < 12; k++) { v[k] = c[k]; v[12 + k] = ch.bas[i][k]; n += c[k] * c[k] + ch.bas[i][k] * ch.bas[i][k]; } n = Math.sqrt(n); for (let k = 0; k < 24; k++) v[k] /= n; return v; });
    const chg = new Float64Array(bpb), cnt = new Float64Array(bpb), fit = new Float64Array(bpb);
    for (let b = 1; b < nB; b++) { let d = 0; for (let k = 0; k < 24; k++) d += vec[b][k] * vec[b - 1][k]; chg[b % bpb] += 1 - d; cnt[b % bpb]++; }
    for (let s = 0; s < bpb; s++) { chg[s] /= Math.max(1, cnt[s]); const g = barsFrom(ch, s, bpb, bpb); let t = 0; g.forEach(b => { t += chordOf(b.c, b.d).score; }); fit[s] = g.length ? t / g.length : 0; }
    const cm = Math.max.apply(null, chg) || 1, fm = Math.max.apply(null, fit) || 1; let bs = -1e9, bo = 0;
    let e0 = 0, eA = 0; const n0 = Math.min(mix.x.length, Math.round(0.2 * mix.sr)); for (let i = 0; i < n0; i++) e0 += mix.x[i] * mix.x[i]; for (let i = 0; i < mix.x.length; i += 16) eA += mix.x[i] * mix.x[i];
    const hot = e0 / Math.max(1, n0) > 0.2 * eA / (mix.x.length / 16);          // the music starts right at the top of the file: backing tracks and loops usually start on beat 1
    for (let s = 0; s < bpb; s++) { const t = chg[s] / cm + 0.5 * fit[s] / fm + (phase + s * spb < 0.12 ? (hot ? 0.4 : 0.1) : 0); if (t > bs) { bs = t; bo = s; } }
    off = Math.max(0, phase + bo * spb); bars = barsFrom(ch, bo, bpb, Math.ceil(bpb / 2)); }
  st(3); await tick();
  const es = bars.map(b => b.e).sort((a, b) => a - b), med = es[Math.floor(es.length / 2)] || 0;
  const det = bars.map(b => { if (b.e < med * 0.03) return { nc: true }; const c = chordOf(b.c, b.d); return { pc: c.pc, q: c.q, amb: c.amb, ratio: c.ratio }; });
  const k = keyOf(bars, det), DIA = k.minor ? { 0:'min', 2:'min', 3:'maj', 5:'min', 7:'min', 8:'maj', 10:'maj' } : { 0:'maj', 2:'min', 4:'min', 5:'maj', 7:'maj', 9:'min', 11:'min' };
  const chords = det.map(c => { if (c.nc) return { nc: true }; const d = DIA[(c.pc - k.keyPc + 12) % 12], base = c.q === 'dom7' ? 'maj' : c.q;
    if (k.blues && [0, 5, 7].includes((c.pc - k.keyPc + 12) % 12)) return { pc: c.pc, q: 'dom7' };                                    // a blues is played with 7th chords throughout
    return { pc: c.pc, q: d && base !== d && (c.amb || c.ratio < 2.2) ? d : c.q }; });      // an unclear third takes the chord the key expects
  return { bpm, off, bpb, bars: chords.length, chords, keyPc: k.keyPc, minor: k.minor, blues: k.blues, dur, mix, dbg };
}

/* ---- WSOLA time-stretch ---- */
async function stretchPlan(mix, alpha, onProg) { // alpha = output length / input length; the cut points come from the mono mix, in full-rate samples
  const D = mix.D, N = 2048, Hs = N >> 1, Nd = Math.floor(N / D), Hd = Math.round(Hs / D), x = mix.x, tol = Math.round(0.008 * mix.sr);
  const inLen = x.length * D, outLen = Math.round(inLen * alpha), M = Math.max(1, Math.ceil(outLen / Hs)), pos = new Int32Array(M);
  let prev = 0;
  for (let m = 1; m < M; m++) {
    const nom = Math.round(m * Hs / alpha / D), tgt = prev + Hd; let best = -Infinity, bp = nom;
    if (tgt + Nd < x.length) for (let dl = -tol; dl <= tol; dl++) { const c = nom + dl; if (c < 0 || c + Nd >= x.length) continue; let s = 0, e = 1e-9;
      for (let i = 0; i < Nd; i += 2) { const v = x[c + i]; s += x[tgt + i] * v; e += v * v; } const sc = s / Math.sqrt(e); if (sc > best) { best = sc; bp = c; } }
    bp = Math.max(0, Math.min(x.length - 1, bp)); pos[m] = bp * D; prev = bp;
    if (m % 300 === 0) { if (onProg) onProg(m / M); await tick(); }
  }
  return { pos, N, Hs, outLen, alpha };
}
let HANN = null;
function stretchApply(ctx, buf, plan) {
  const pos = plan.pos, N = plan.N, Hs = plan.Hs; if (!HANN || HANN.length !== N) { HANN = new Float32Array(N); for (let i = 0; i < N; i++) HANN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); }
  const out = ctx.createBuffer(buf.numberOfChannels, plan.outLen + N, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) { const a = buf.getChannelData(c), o = out.getChannelData(c), L = a.length;
    for (let m = 0; m < pos.length; m++) { const p = pos[m], q = m * Hs; if (p >= L) break; const n = Math.min(N, L - p);
      if (m === 0) { for (let i = 0; i < n; i++) o[q + i] += (i < Hs ? 1 : HANN[i]) * a[p + i]; } else for (let i = 0; i < n; i++) o[q + i] += HANN[i] * a[p + i]; } }
  return out;
}

window.JWT_DSP = { monoMix, analyze, stretchPlan, stretchApply, onsetEnv, tempo };
})();
