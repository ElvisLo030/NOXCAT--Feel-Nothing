# Official NOXCAT assets

The supplied hackathon pack is now present in the project reference folder. The start screen displays the unmodified official white wordmark as `noxcat-logo-official-white.png` (copied verbatim from `NOXCAT LOGO_10.png`). Do not distort, recolour, rotate, add effects to, or re-typeset this mark.

Combat uses the five supplied transparent PNG character poses. Each PNG is a complete character illustration with its eyes and forehead goggles already rendered. The goggles are therefore always present and are not a separate runtime accessory. Movement switches between the left/right front and side poses. Pulling back to aim immediately uses the dedicated upward-boost pose, which remains active after release while NOXCAT launches toward the Boss. The fixed gameplay collision body remains separate from the visible squash/stretch animation.

Asset mapping remains centralized in `src/assets/AssetRegistry.ts`:

- `noxcat-L-front.png` -> `noxcat.front-left`
- `noxcat-R-front.png` -> `noxcat.front-right`
- `noxcat-L-side.png` -> `noxcat.side-left`
- `noxcat-R-side.png` -> `noxcat.side-right`
- `noxcat-up.png` -> `noxcat.up`
- procedural impact flash -> `noxcat.hit`

`AssetRegistry` retains a simple procedural silhouette only as a load-failure fallback. The older SVG body, eyes and goggles files remain as design-history references and are not loaded by the game.

The organizer archive as received and `NOXCAT IP_Usage Guidelines.pdf` may be retained locally under `docs/official-assets-20260904/`. That directory is intentionally ignored by Git and is not part of the repository distribution. The runtime NOXCAT files in this directory remain outside the project's GPL grant; see `LICENSE-SCOPE.md`. Their event-only distribution and post-event publication restrictions still apply.

The received archive does **not** contain the separate `NOXCAT Asset Licence` that the Usage Guidelines say accompanies the asset pack. The Guidelines are therefore not evidence of the complete legal grant by themselves. Obtain and review that companion licence before submission/public distribution, and obtain NOXCAT's prior written consent before any continued publication, distribution or commercialisation after the event.
