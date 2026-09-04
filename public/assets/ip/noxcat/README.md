# Official NOXCAT assets

The supplied hackathon pack is now present in the project reference folder. The start screen displays the unmodified official white wordmark as `noxcat-logo-official-white.png` (copied verbatim from `NOXCAT LOGO_10.png`). Do not distort, recolour, rotate, add effects to, or re-typeset this mark.

Combat loads `noxcat-logo-bun-v5.svg`, a flat game-character redraw made under the guide's permitted adaptation and game-asset-production clauses. It follows the official logo's approximately 1.1:1 body ratio, forward-clustered ears and long horizontal base, while remaining separate from the protected logo lockup. Two large luminous `#91D500` eyes and a flat pair of forehead goggles with green lenses restore the supplied character guide's identifying face details without changing the bun silhouette. The face, shadow, fixed circular collision body, three silhouette-matched lime glow layers, launch-only ghosts and droplets, squash/stretch and release rebound are separate runtime layers. Ordinary dragging deliberately has no ribbon or long tail.

Asset mapping remains centralized in `src/assets/AssetRegistry.ts`:

- `noxcat-logo-bun-v5.svg` -> `noxcat.body`
- procedural flat green eyes + forehead goggles -> `noxcat.eyes`
- procedural impact flash -> `noxcat.hit`

The complete supplied pack and `NOXCAT IP_Usage Guidelines.pdf` may be retained locally under `docs/official-assets-20260904/`. That directory is intentionally ignored by Git and is not part of the repository distribution. The runtime NOXCAT files in this directory remain outside the project's GPL grant; see `LICENSE-SCOPE.md`. Their event-only distribution and post-event publication restrictions still apply.
