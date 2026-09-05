# NOXCAT music replacement

The production battle track is:

`noxcat-battle-loop-v1.ogg`

Runtime mapping lives in `src/audio/MusicRegistry.ts`. Battle scenes request the
stable key `battle.main`; they never hard-code this path. To update the score,
either replace this OGG while keeping its name, or add a new versioned file and
change only the registry entry.

Recommended delivery settings:

- OGG Vorbis, stereo, 44.1 or 48 kHz
- seamless loop with no encoder silence at either edge
- integrated loudness around -18 to -16 LUFS, leaving gameplay SFX headroom
- keep the repository track below roughly 2 MB for mobile startup

The current `NULL SIGNAL` loop is original to this project and is intentionally
backed by a procedural Web Audio fallback when loading or decoding fails.
