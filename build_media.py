# -*- coding: utf-8 -*-
"""Builds media/<id>_media.js (audio as base64 AAC) + media/lj_data.js for the Play with Track V2 prototype.

Source = ../LJ001_IngestPack_V1 and ../LJ002_IngestPack_V1 (producer deliveries + Litejam ingest audit files).
Audio is transcoded WAV 48k/24b -> AAC m4a with macOS afconvert and embedded as data URIs in JS files,
so index.html works from file:// (no fetch) and Web Audio can decode sample-accurate buffers.
Run:  python3 build_media.py            (all tracks)      python3 build_media.py LJ002   (one track's audio + data)
To add a track: put its ingest pack next to the others and add an entry to TRACKS_CFG below.
"""
import os, sys, json, csv, base64, subprocess, tempfile, ast, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'media')
os.makedirs(OUT, exist_ok=True)

TRACKS_CFG = {
    'LJ001': {
        'pack': '../LJ001_IngestPack_V1', 'src': 'LJ001-1', 'title': 'Slow Blues in A', 'keyPc': 9, 'keySuffix': ' Blues', 'beatTicks': 720,
        # key -> (delivered file, where it lives / should live in Drive, bitrate)
        'audio': [('drums', 'STEMS/1.Drum.wav', '01_AUDIO/LJ001_Drums.wav', 128000), ('bass', 'STEMS/2.Bass.wav', '01_AUDIO/LJ001_Bass.wav', 112000),
                  ('harmony', 'STEMS/3.Organ.wav', '01_AUDIO/LJ001_Harmony.wav', 128000), ('guide', 'LICKS/1.Licks 123.wav', '04_GUIDE_LICKS/LJ001_Licks_All_Perf.wav', 128000),
                  ('demo', 'FULL MIX/2.LJ001 Licks 123.wav', '04_GUIDE_LICKS/LJ001_Licks_Demo.wav', 128000),
                  ('s_kick', 'SAMP/1.Kick.wav', '03_SAMPLES/LJ001_DR_035_Kick_L3.wav', 96000), ('s_snare', 'SAMP/2.Snare.wav', '03_SAMPLES/LJ001_DR_037_SideStick_L3.wav', 96000),
                  ('s_hat', 'SAMP/3.Hi-Hat.wav', '03_SAMPLES/LJ001_DR_042_ClosedHH_L3.wav', 96000), ('s_crash', 'SAMP/4.Crash.wav', '03_SAMPLES/LJ001_DR_049_Crash_L3.wav', 96000),
                  ('s_bass', 'SAMP/5.Bass.wav', '03_SAMPLES/LJ001_BS_033_A1_L2.wav', 96000), ('s_harm', 'SAMP/6.Organ.wav', '03_SAMPLES/LJ001_HM_057_A3_L2.wav', 112000)],
        'channels': [['drums', 'Drums', '01_AUDIO · stem'], ['bass', 'Bass', '01_AUDIO · stem'], ['harmony', 'Organ', '01_AUDIO · harmony stem'], ['guide', 'Guide guitar', '04_GUIDE_LICKS · Perf']],
        # measured by the ingest audit: bass + organ MIDI are written one octave above the sounding pitch
        'sampleMap': {'drums': {'35': 's_kick', '37': 's_snare', '42': 's_hat', '49': 's_crash'}, 'drumLen': {'s_kick': 0.45, 's_snare': 0.3, 's_hat': 0.3, 's_crash': 3.6},
                      'bass': {'buf': 's_bass', 'root': 33, 'octave': -12}, 'harmony': {'buf': 's_harm', 'root': 57, 'octave': -12}},
        'sections': [{'from': 1, 'to': 8, 'name': '8-BAR BLUES'}, {'from': 9, 'to': 12, 'name': 'REPEAT'}, {'from': 13, 'to': 15, 'name': 'ENDING'}],
        'loopName': '8-bar blues', 'loopNote': 'Loop region from the track metadata (loop_start_tick → loop_end_tick)',
        'scales': [['pentMinor', 'Beginner', '5 notes that never clash with A7, D7 or E7. Start here.'], ['blues', 'Beginner', 'Minor pentatonic + the blue note (b5) for tension.'],
                   ['follow', 'Advanced', 'Mixolydian of each chord (A / D / E). The fretboard changes with every chord change.']],
        'followName': 'Mixolydian',
        'gp': {'Lick1': '05_TABS/LJ001_Lick01.gp', 'Lick2': '05_TABS/LJ001_Lick02.gp', 'Lick3': '05_TABS/LJ001_Lick03.gp'},
    },
    'LJ002': {
        'pack': '../LJ002_IngestPack_V1', 'src': 'LJ002-1', 'title': 'Classic Rock in Em', 'keyPc': 4, 'keySuffix': ' minor', 'beatTicks': 480,
        'audio': [('drums', 'STEMS/1.Drum.wav', '06_STEMS/1.Drum.wav', 128000), ('bass', 'STEMS/2.Bass.wav', '06_STEMS/2.Bass.wav', 112000),
                  ('harmony', 'STEMS/3.Rhythm Guitar.wav', '06_STEMS/3.Rhythm Guitar.wav', 128000), ('guide', 'LICKS/LJ002_Licks_All_Perf.wav', '04_GUIDE_LICKS/LJ002_Licks_All_Perf.wav', 128000),
                  ('demo', 'LICKS/LJ002_Licks_Demo.wav', '04_GUIDE_LICKS/LJ002_Licks_Demo.wav', 128000),
                  ('s_kick', 'SAMP/LJ002_DR_035_Kick_L3.wav', '03_SAMPLES/LJ002_DR_035_Kick_L3.wav', 96000), ('s_snare', 'SAMP/LJ002_DR_037_Snare_L3.wav', '03_SAMPLES/LJ002_DR_037_Snare_L3.wav', 96000),
                  ('s_hat', 'SAMP/LJ002_DR_042_OpenedHH_L3.wav', '03_SAMPLES/LJ002_DR_042_OpenedHH_L3.wav', 96000), ('s_crash', 'SAMP/LJ002_DR_049_Crash_L3.wav', '03_SAMPLES/LJ002_DR_049_Crash_L3.wav', 96000),
                  ('s_bass', 'SAMP/LJ002_BS_033_E1_L2.wav', '03_SAMPLES/LJ002_BS_033_E1_L2.wav', 96000)],
        'channels': [['drums', 'Drums', '06_STEMS · stem'], ['bass', 'Bass', '06_STEMS · stem'], ['harmony', 'Rhythm guitar', '06_STEMS · harmony stem'], ['guide', 'Guide guitar', '04_GUIDE_LICKS · Perf']],
        # MIDI drum notes differ from the numbers in the sample file names (38/46/57 vs 037/042/049); bass sample measured E1 = MIDI 28
        'sampleMap': {'drums': {'35': 's_kick', '38': 's_snare', '46': 's_hat', '57': 's_crash'}, 'drumLen': {'s_kick': 0.45, 's_snare': 0.7, 's_hat': 0.38, 's_crash': 3.6},
                      'bass': {'buf': 's_bass', 'root': 28, 'octave': -12}, 'harmony': None},
        'sections': [{'from': 1, 'to': 8, 'name': '8-BAR LOOP'}, {'from': 9, 'to': 16, 'name': 'REPEAT'}],
        'loopName': '16-bar loop', 'loopNote': 'The whole track is an exact 16-bar loop (loop_start_tick 0 → loop_end_tick 30720)',
        'scales': [['pentMinor', 'Beginner', '5 notes that fit Em, C, G and D. Start here.'], ['natMinor', 'Intermediate', 'All 7 notes of the key — adds F# and C to the pentatonic.'],
                   ['follow', 'Advanced', 'A pentatonic built on each chord (Em minor, C / G / D major). Lands on chord tones at every change.']],
        'followName': 'Chord pentatonics',
        'gp': {'Lick1': '05_TABS/LJ002_Lick01.gp', 'Lick2': '05_TABS/LJ002_Lick02.gp', 'Lick3': '05_TABS/LJ002_Lick03.gp'},
    },
}

only = sys.argv[1:] or list(TRACKS_CFG)
tmp = tempfile.mkdtemp()
packs = {}
for tid, cfg in TRACKS_CFG.items():
    PACK = os.path.join(HERE, cfg['pack']); SRC = os.path.join(PACK, cfg['src'])
    files = {}
    media_js = os.path.join(OUT, tid.lower() + '_media.js')
    if tid in only or not os.path.exists(media_js):
        media = {}
        for key, rel, target, br in cfg['audio']:
            dst = os.path.join(tmp, tid + key + '.m4a')
            subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(br), '-q', '127', os.path.join(SRC, rel), dst], check=True)
            b = open(dst, 'rb').read(); media[key] = 'data:audio/mp4;base64,' + base64.b64encode(b).decode('ascii')
            print('%s %-8s %6d kB  %s' % (tid, key, len(b) / 1024, rel))
        with open(media_js, 'w') as f:
            f.write('// generated by build_media.py — %s producer delivery, AAC transcodes for prototype use only\n' % tid)
            f.write('window.LJ_MEDIA = window.LJ_MEDIA || {}; window.LJ_MEDIA.%s = %s;\n' % (tid, json.dumps(media)))
    for key, rel, target, br in cfg['audio']: files[key] = {'delivered': rel, 'drive': target}

    info = json.load(open(os.path.join(PACK, tid + '_Track_Info.json')))
    chords = [{'bar': int(r['bar']), 'tick': int(r['tick']), 'sym': r['chord_symbol'], 'root': r['root'], 'quality': r['quality']}
              for r in csv.DictReader(open(os.path.join(PACK, tid + '_Chord_Progression.csv')))]
    idx = {r['lick_id']: r for r in csv.DictReader(open(os.path.join(PACK, tid + '_Lick_Index.csv')))}
    licks = []
    for l in json.load(open(os.path.join(PACK, tid + '_Licks.json')))['licks']:
        played = [n['fret'] for n in l['notes'] if 'mute' not in n['techniques']]
        licks.append({
            'id': l['lick_id'], 'startBar': l['start_bar'], 'endBar': l['end_bar'], 'startTick': l['start_tick'], 'endTick': l['end_tick'],
            'chords': l['chords_under'], 'fretLow': min(played), 'fretHigh': max(played), 'techniques': l['techniques'],
            'level': idx[l['lick_id']]['level_by_brief_rules'], 'gp': cfg['gp'][l['lick_id']],
            # [tick, durTicks, string(1=high e), fret, midi, bendSemitones, muted, vibrato]
            'notes': [[n['tick'], n['dur_ticks'], n['string_std_1_high'], n['fret'], n['midi_pitch'], n['bend_semitones'],
                       1 if 'mute' in n['techniques'] else 0, 1 if 'vibrato' in n['techniques'] else 0] for n in l['notes']],
        })
    code = {'drums': 0, 'bass': 1, 'organ': 2, 'harmony': 2}
    style = sorted(([code[r['instrument']], int(r['tick']), int(r['pitch']), int(r['vel']), int(r['dur_ticks'])]
                    for r in csv.DictReader(open(os.path.join(PACK, tid + '_Style_Events.csv')))), key=lambda e: e[1])
    bars, tpb = info['delivered_bar_count'], info['ticks_per_bar']
    packs[tid] = {
        'id': tid, 'title': cfg['title'], 'timeSig': info['time_signature'], 'bpm': info['tempo_bpm_quarter'], 'ppq': info['ppq'], 'ticksPerBar': tpb,
        'beatTicks': cfg['beatTicks'], 'bars': bars, 'endTick': bars * tpb, 'keyPc': cfg['keyPc'], 'keySuffix': cfg['keySuffix'],
        'loop': {'a': info['proposed_loop']['start_tick'], 'b': info['proposed_loop']['end_tick']}, 'loopName': cfg['loopName'], 'loopNote': cfg['loopNote'],
        'sections': cfg['sections'], 'channels': cfg['channels'], 'scales': cfg['scales'], 'followName': cfg['followName'],
        'chords': chords, 'licks': licks, 'style': style, 'sampleMap': cfg['sampleMap'], 'files': files,
    }
    print('%s data: %d bars, %d chords, %d licks, %d style events' % (tid, bars, len(chords), len(licks), len(style)))

src_py = open(os.path.join(HERE, '..', 'build_metadata_master.py'), encoding='utf-8').read()
tracks = [{'id': t[0], 'style': t[1], 'key': t[2], 'scale': t[3], 'bpm': t[4], 'prog': t[5], 'level': t[6], 'folder': t[7], 'pilot': t[8]}
          for t in ast.literal_eval(re.search(r'TRACKS = (\[.*?\n\])', src_py, re.S).group(1))]
with open(os.path.join(OUT, 'lj_data.js'), 'w', encoding='utf-8') as f:
    f.write('// generated by build_media.py from the ingest packs (Track_Info.json, Chord_Progression.csv, Licks.json, Style_Events.csv)\n')
    f.write('window.LJ_DATA = ' + json.dumps({'tracks': tracks, 'packs': packs}, ensure_ascii=False) + ';\n')
