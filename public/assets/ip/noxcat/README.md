# Official NOXCAT assets

The supplied hackathon pack is now present in the project reference folder. The start screen displays the unmodified official white wordmark as `noxcat-logo-official-white.png` (copied verbatim from `NOXCAT LOGO_10.png`). Do not distort, recolour, rotate, add effects to, or re-typeset this mark.

Combat loads `noxcat-logo-bun-v5.svg`, the flat game-character redraw used by the current visual direction. Its body, two green eyes and optional forehead goggles remain separate runtime layers, so squash/stretch, facing, aiming and impact deformation stay continuous instead of switching between baked poses. The fixed gameplay collision body remains separate from those visual layers.

Asset mapping remains centralized in `src/assets/AssetRegistry.ts`:

- `noxcat-logo-bun-v5.svg` -> `noxcat.body`
- procedural flat green oval eyes -> `noxcat.eyes`
- optional procedural forehead goggles -> `noxcat.goggles`
- procedural impact flash -> `noxcat.hit`

The five supplied transparent PNG poses remain in this directory as unused design references. `AssetRegistry` does not preload or map them into the game.

The organizer archive as received and `NOXCAT IP_Usage Guidelines.pdf` may be retained locally under `docs/official-assets-20260904/`. That directory is intentionally ignored by Git and is not part of the repository distribution. The runtime NOXCAT files in this directory remain outside the project's GPL grant; see `LICENSE-SCOPE.md`. Their event-only distribution and post-event publication restrictions still apply.

The received archive does **not** contain the separate `NOXCAT Asset Licence` that the Usage Guidelines say accompanies the asset pack. The Guidelines are therefore not evidence of the complete legal grant by themselves. Obtain and review that companion licence before submission/public distribution, and obtain NOXCAT's prior written consent before any continued publication, distribution or commercialisation after the event.
