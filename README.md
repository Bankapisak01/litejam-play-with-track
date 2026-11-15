# Litejam · Scale Mode — Play with Track (prototype)

Interactive design prototype for the **Play with Track** tab of Litejam Scale Mode.
Live page: https://bankapisak01.github.io/litejam-play-with-track/

What is inside

- Track library built for thousands of tracks: search, browse by style / scale / level / key / tempo, generated cover art
- Player driven by the real LJ001 and LJ002 producer assets: stem mixer, chord timeline, scale on the fretboard, loops
- Style mode (MIDI + samples): change tempo and key
- Guide licks with LED + tab, call & response, half-bar count-in, "All licks", Jam & Record
- Scored runs, per-track leaderboard, profile and avatars (demo data)
- Playlists, favourites, own-upload flow (simulated analysis)
- BLE: connect a real Litejam guitar from Chrome / Edge and the fretboard LEDs follow the screen

Run locally: open `index.html`, or serve the folder (`python3 -m http.server`) and open `http://localhost:8000`.
Bluetooth needs https or localhost and a Chromium browser (not iPhone / iPad).

Files: `index.html` (shell + styles), `app.js` (all logic), `media/` (audio as base64 AAC + track data), `assets/` (icons, fonts, Litejam Universe sprites), `build_media.py` (rebuilds `media/` from the ingest packs, which are not in this repo).

All audio, artwork and characters © Litejam. Prototype for internal review — not for redistribution.
