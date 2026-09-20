# Material 3, on the Star Lord palette

`brand.css` and everything under `tokens/` are Google's
[Material 3](https://m3.material.io) design system, with the Star Lord colours
carried over from the theme this replaced.

## The colours are generated, not written

`tokens/colors.css` is produced by `npm run build:theme`
(`scripts/build-theme.mjs`), which runs Google's own
`@material/material-color-utilities`. **Do not edit it by hand.**

M3 colour is algorithmic: `primary-container` is not a colour someone picked,
it is a specific tone of a specific tonal palette. The previous version of this
file was derived by eye, which got close-but-wrong values and a scheme that
could not be regenerated.

Star Lord is kept by seeding each tonal palette separately rather than letting
one seed derive everything — that would have thrown away the cyan and the navy.
The five sources are at the top of the generator.

**One consequence worth knowing.** M3's dark scheme puts `primary` at tone 80,
so the signature `#FF5DA2` is now `primary-container`, and `primary` is the
paler `#FFB0CA`. That is M3's rule for dark themes, not a Star Lord problem —
every scheme variant does it, and Material's own dark themes are pastel this
way. The exact source pink is still in the scheme, in the container role.

What changed is the structure around them. M3 does not have "an accent and a
border colour"; it has role quartets — `primary` / `on-primary` /
`primary-container` / `on-primary-container` — and a six-step surface ladder
that carries elevation. Components are specified against those role names, so
the roles had to exist before any component could be built to spec.

Only the container tones are new, and each is the existing hue re-lit to the
tone M3 asks for. Nothing introduces a hue the palette did not already have.

The app's three surfaces turned out to already sit on M3's ladder:

    --md-surface                  #0A0D24   was the page
    --md-surface-container        #15183A   was the panel
    --md-surface-container-high   #1F2347   was the nested panel
    --md-surface-container-highest #2A2E5A  was the border

## The parts that make it M3

- **Shape.** Seven-step corner scale. Controls are fully rounded, cards are
  12dp, the drawer's items are pills. This is the most visible change.
- **State layers.** Hovering does not swap a background; it lays a translucent
  film of the component's own content colour over it, at M3's 8/10/10%. Every
  interactive surface in the app works this way now.
- **Elevation by tone.** A raised surface is a lighter container tone, with the
  shadow subordinate. On a page this dark a shadow reads as a hole, not a lift.
- **The type scale.** Fifteen roles, each with a size, line height, weight and
  tracking. Tracking is the part usually dropped, and it is what makes an M3
  label read as one — a label is a small body *with positive letter-spacing*.
- **Component specs.** 40dp buttons with 24dp side padding, 56dp drawer items in
  a 12dp gutter, 48dp tabs with an inset 3dp indicator, 32dp chips, filled text
  fields rounded at the top only.

## The typefaces are not M3's

M3 defaults to Roboto. These are Montserrat, Space Mono and Source Code Pro,
kept from the previous theme. M3 is explicit that a brand font can be
substituted into the scale, only the colours were called out to keep, and
swapping the faces would have discarded a deliberate choice M3 does not require
changing.

## Layering

`brand.css` is the only entry point; it is import order and nothing else.
`src/styles.css` maps the M3 roles onto the short names its component rules use
— `--bg`, `--panel`, `--accent` — in one block at the top.

Where a short name and an M3 role disagree, the role wins. `--panel` is
`surface-container` because that is the tone M3 draws a level-2 surface on, not
because the app used to call it a panel.

Nothing outside `src/styles.css` should name an `--md-*` or `--sl-*` token, and
no component should carry a literal colour.

## The app is dark, permanently

There is no light scheme and no toggle. M3 defines both; only the dark one is
ported.

## The mark

The OrbitAI logo, from [orbit-web](https://corbtastik.github.io/orbit-web/),
exists twice:

    src/components/brand/OrbitLogo.jsx   animated gradient — the sidebar
    public/brand/orbit-logo.svg          static — the favicon

Both draw the same geometry; keep them in step. `Orbitron` is loaded for the
wordmark and used nowhere else.
