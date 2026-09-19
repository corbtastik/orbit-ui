# MongoDB brand tokens (vendored)

`brand.css` and everything under `tokens/` are copied verbatim from the MongoDB
LeafyGreen design-system pack. **Do not edit them.** Refreshing the pack should
be a straight overwrite of this directory.

Anything this app needs on top of the pack -- the dark-mode semantic layer, the
mapping from these tokens onto the app's own variables -- lives in
`src/styles.css`, not here.

Logos and the favicon are in `public/brand/`, copied from the same pack.

## Fonts

The brand faces (Euclid Circular A, MongoDB Value Serif) are proprietary and are
not in the pack. `tokens/fonts.css` names them first and resolves them through
Google Fonts substitutes (Hanken Grotesk, Source Serif 4); Source Code Pro is an
exact match. To go pixel-perfect, drop the licensed `woff2` files into
`src/brand/fonts/` and point the `@font-face` `src` at them -- nothing else
changes, because the app only ever references `--font-sans` / `--font-mono`.

## The app is dark, permanently

There is no light theme and no theme toggle, and none should be added. The
tokens in `src/styles.css` are defined once on `:root`; there is no
`[data-theme]` selector and nothing reads such an attribute.

This is a deliberate product decision, not an unfinished one. The visualizer is
a map-first operations console sitting on a dark basemap, and a light theme
would mean a second basemap, a second data palette tuned against a light
ground, and a second set of contrast decisions for every marker.

One thing that looks theme-related but is not: `TooltipIncident.contrastFor()`
picks dark or light text based on the category colour behind it. That is
contrast against a data colour, and it stays.

## The basemap

`public/brand/map/incident-slate.json` is Carto's Dark Matter with its palette
remapped onto the LeafyGreen slate ramp. Regenerate it with
`python3 scripts/build-map-style.py`; that script explains the transform and is
the only thing that should ever edit the file.

Tiles, glyphs and sprites are still fetched from Carto at runtime, so the
OpenStreetMap and Carto attribution flows through their TileJSON and must stay
visible. Vendoring the style does not vendor the basemap.
