# Official NOXCAT assets

The supplied hackathon pack is now present in the project reference folder. The start screen displays the unmodified official white wordmark as `noxcat-logo-official-white.png` (copied verbatim from `NOXCAT LOGO_10.png`). Do not distort, recolour, rotate, add effects to, or re-typeset this mark.

The homepage and combat now share `noxcat-logo-traced.svg`, traced directly from the supplied official wordmark PNG. The trace retains the source silhouette, asymmetric ears, tilted eye shapes, eye spacing and vertical offset. The game character uses the requested green eye colour (`#91d500`); its eye geometry comes from the logo. The SVG records its source crop and fitting tolerance. The original wordmark file remains unchanged.

`src/assets/noxcatDesign.ts` derives each layer and the sampled collision outline from this single SVG. Body and face share the same viewBox and uniform base scale; movement, facing and jelly deformation transform them together. Forehead goggles are an optional game accessory on a separate layer, not part of the official logo.

Asset mapping remains centralized in `src/assets/AssetRegistry.ts`:

- traced SVG body layer -> `noxcat.body`
- traced SVG green eye layer (`#91d500`) -> `noxcat.eyes`
- optional SVG forehead goggles -> `noxcat.goggles`
- procedural impact flash -> `noxcat.hit`

The earlier `noxcat-logo-bun-v5.svg`, eye/goggle SVGs and five transparent PNG poses remain as unused historical design references. `AssetRegistry` does not preload or map them into the game.

The organizer archive as received and `NOXCAT IP_Usage Guidelines.pdf` may be retained locally under `docs/official-assets-20260904/`. That directory is intentionally ignored by Git and is not part of the repository distribution. The runtime NOXCAT files in this directory remain outside the project's GPL grant; see `LICENSE-SCOPE.md`. Their event-only distribution and post-event publication restrictions still apply.

The received archive does **not** contain the separate `NOXCAT Asset Licence` that the Usage Guidelines say accompanies the asset pack. The Guidelines are therefore not evidence of the complete legal grant by themselves. Obtain and review that companion licence before submission/public distribution, and obtain NOXCAT's prior written consent before any continued publication, distribution or commercialisation after the event.
