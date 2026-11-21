# Litejam · Jam with Track (basic version)

Branch `jam-with-track`: the basic practice version of Play with Track, renamed **Jam with Track**.
Only what helps a guitarist practise with a backing track. Licks, scoring, characters, recording and playlists are left out
(they live on `game-version`; the original prototype is on `main`).

## What is in it

- **Official backing tracks** — Litejam Tracks with producer stems, cover art per style, filters by style / level / ready to play.
  Two tracks are playable (Slow Blues in A, Classic Rock in Em); eight are marked Coming soon.
- **Your own tracks** — upload one audio file (plays as a full mix) or several stem files together (each gets its own fader).
  Files stay on the device (IndexedDB). Nothing is sent to a server.
- **Analysis on the device** — tempo, bar lines, one chord per bar and the key are read from the audio (`dsp.js`).
  Fix them with *Edit chords* and *Fix beat / key*.
- **Player** — NOW / NEXT chord, chord timeline, scale or chord on the fretboard, target notes, loop (producer loop, 4 bars, A–B),
  speed 50–100 % without changing pitch, transpose ±6 without changing speed, metronome, count-in, stems mixer.
- **Litejam guitar LEDs** over Web Bluetooth (Chrome / Edge on desktop and Android).

## Not in this prototype

- Splitting one finished song into stems (needs a server-side model).
- Tempo changes inside a song and odd meters: the analysis assumes a steady tempo; 4/4, 3/4 and compound time are handled, with manual fixes.

## Files

`index.html` · `app.js` (built) · `app.src.js` + `make_jam.py` (source and build script; the script also needs the V2 prototype folder, which is not in this branch) ·
`dsp.js` (analysis + WSOLA time-stretch) · `media/` (track data + LJ001 / LJ002 stems as AAC) · `assets/`.

Open `index.html` from any static server. Audio is for prototype use only.
