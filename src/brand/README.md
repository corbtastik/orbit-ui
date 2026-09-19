# Star Lord (theme pack)

`brand.css` and everything under `tokens/` are the Star Lord theme, ported from
[yolo-11ty](https://github.com/corbtastik/yolo-11ty). This replaced a vendored
MongoDB LeafyGreen pack.

## Where the values come from

The twelve source colors in `tokens/colors.css` are copied verbatim from the
`star-lord` entry in yolo-11ty's `src/_data/themes.json`, dark half only. The
three faces in `tokens/fonts.css` are the ones every yolo theme shares — they
are not per-theme there and are not per-theme here.

A blog theme needs fewer surfaces than a console does, so `colors.css` adds a
short derived ramp under the verbatim block: one intermediate surface, two
hover tiers, and the error red that yolo keeps in `theme-vars.js` rather than
in the theme itself. Everything derived is stated in terms of the twelve.

To pull a different yolo theme, replace the verbatim block and rederive those
few — nothing else in the app reads a color.

## What did not change

`tokens/spacing.css` and the type scale in `tokens/typography.css` are
unchanged from the pack this replaced, as are motion and z-index in
`tokens/effects.css`. Spacing, radius and type size decide how much room every
panel needs; moving them would move the layout, and only color and type were
being restyled.

## Fonts

    Montserrat       UI, body copy and headings
    Space Mono       technical labels
    Source Code Pro  code

All three are free Google Fonts, loaded in `tokens/fonts.css`. There is nothing
to substitute and no licensed file to drop in later — unlike the pack this
replaced, whose brand faces were proprietary.

The roles are not quite yolo's. There, Space Mono is `font-family-primary` and
body copy is monospace; here body is Montserrat and Space Mono is the accent
face, marking the strings the app did not write — tool name, model id, MCP
endpoint, citation ref, the running-tool label. Code is Source Code Pro, not
Space Mono, so a tool *name* and a code *block* stay visually distinct.

`--font-accent` is applied per element, never inherited. Adding a technical
label means naming it.

## How it is consumed

`brand.css` is the only entry point; it is import order and nothing else.
`src/styles.css` maps these tokens onto the app's semantic names — `--bg`,
`--panel`, `--fg`, `--accent` and the rest — in one block at the top, and the
thousand lines below it are written against those. That layer is the seam: the
palette swap was that block and nothing under it.

Do not reach past it. Nothing outside `src/styles.css` should name a `--sl-*`
token, and no component should carry a literal color.

## The app is dark, permanently

There is no light theme and no toggle, and none should be added. The tokens in
`src/styles.css` are defined once on `:root`; there is no `[data-theme]`
selector and nothing reads such an attribute. Star Lord has a light half in
`themes.json` and it is deliberately not ported.

## The mark

The OrbitAI logo, from
[orbit-web](https://corbtastik.github.io/orbit-web/), exists twice:

    src/components/brand/OrbitLogo.jsx   animated, CSS 3D — the sidebar
    public/brand/orbit-logo.svg          static — the favicon

Upstream draws it in Three.js. Both copies here avoid that dependency for the
reasons in the component's header comment, and they share upstream's seven-stop
palette and its 24s rotation / 12s colour cycle. Change the palette in both or
in neither.

`Orbitron` is loaded for the wordmark and used nowhere else.

The MongoDB logomarks and `favicon.ico` are still in `public/brand/` and are
now referenced by nothing. They can be deleted whenever.
