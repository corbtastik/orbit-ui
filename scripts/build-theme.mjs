/**
 * Generates src/brand/tokens/colors.css.
 *
 *   npm run build:theme
 *
 * The M3 colour system is algorithmic. A role like `primary-container` is not
 * a colour someone picked; it is a specific tone of a specific tonal palette,
 * and getting it by eye -- which is how the previous version of this file was
 * written -- produces values that are close but not correct, and a scheme that
 * cannot be regenerated when a source colour changes.
 *
 * This runs Google's own implementation instead, so every role is the tone M3
 * says it is, and the whole scheme is reproducible from the five source
 * colours below.
 *
 * Those five are Star Lord, from yolo-11ty's themes.json. Keeping them is the
 * point: M3 normally derives a whole scheme from one seed, which would have
 * thrown away the cyan and the navy. Seeding each palette separately keeps the
 * identity and still gets algorithmically correct tones.
 *
 * Run through esbuild rather than node directly -- the upstream package is
 * ESM with extensionless internal imports, which only a bundler resolves.
 */
import {
  DynamicScheme,
  Hct,
  MaterialDynamicColors,
  TonalPalette,
  Variant,
  argbFromHex,
  hexFromArgb,
} from '@material/material-color-utilities';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- The source palette ------------------------------------------------------
// Star Lord, verbatim. Every value below is generated from these.
const SOURCE = {
  primary:        '#FF5DA2',  // the pink accent -- link and primary in themes.json
  secondary:      '#7FD7FF',  // the cyan used for headings
  tertiary:       '#8A7FAF',  // the muted purple, themes.json's shComment
  neutral:        '#0A0D24',  // the page navy -- this drives the surface ladder
  neutralVariant: '#2A2E5A',  // the border navy -- outlines and variant surfaces
  error:          '#FF5252',  // yolo's own dark-mode syntax-error value
};

// Chroma is taken from each source rather than normalised. M3's neutral
// palettes are near-grey by default; Star Lord's are saturated navy, and
// flattening them would turn the app grey while still technically being M3.
const palette = (hex) => TonalPalette.fromInt(argbFromHex(hex));

const scheme = new DynamicScheme({
  sourceColorHct: Hct.fromInt(argbFromHex(SOURCE.primary)),
  variant: Variant.FIDELITY,   // keeps the seeds close to what was asked for
  contrastLevel: 0,
  isDark: true,                // the app is dark only; the light half is not ported
  primaryPalette: palette(SOURCE.primary),
  secondaryPalette: palette(SOURCE.secondary),
  tertiaryPalette: palette(SOURCE.tertiary),
  neutralPalette: palette(SOURCE.neutral),
  neutralVariantPalette: palette(SOURCE.neutralVariant),
  errorPalette: palette(SOURCE.error),
});

// --- Roles -------------------------------------------------------------------
// Emitted in M3's documented order, grouped as the spec groups them, so the
// generated file reads like the reference rather than like a dump.
const GROUPS = [
  ['Primary', ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer']],
  ['Secondary', ['secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer']],
  ['Tertiary', ['tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer']],
  ['Error', ['error', 'onError', 'errorContainer', 'onErrorContainer']],
  ['Surface', [
    'background', 'onBackground',
    'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
    'surfaceDim', 'surfaceBright',
    'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
    'surfaceContainerHigh', 'surfaceContainerHighest',
  ]],
  ['Outline and inverse', [
    'outline', 'outlineVariant',
    'inverseSurface', 'inverseOnSurface', 'inversePrimary',
    'surfaceTint', 'shadow', 'scrim',
  ]],
  ['Fixed accents', [
    'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
    'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
    'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
  ]],
];

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const role = (name) => hexFromArgb(MaterialDynamicColors[name].getArgb(scheme)).toUpperCase();

// --- Contrast, checked rather than assumed -----------------------------------
// M3 guarantees its on-* pairs, but the surface ladder against on-surface-variant
// is where a saturated neutral palette can drift. Reported at generation time so
// a source-colour change cannot quietly break legibility.
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const CHECKS = [
  ['on-surface / surface', 'onSurface', 'surface'],
  ['on-surface-variant / surface', 'onSurfaceVariant', 'surface'],
  ['on-surface-variant / surface-container-highest', 'onSurfaceVariant', 'surfaceContainerHighest'],
  ['on-primary / primary', 'onPrimary', 'primary'],
  ['on-primary-container / primary-container', 'onPrimaryContainer', 'primaryContainer'],
  ['on-secondary-container / secondary-container', 'onSecondaryContainer', 'secondaryContainer'],
  ['on-error-container / error-container', 'onErrorContainer', 'errorContainer'],
  ['primary / surface', 'primary', 'surface'],
  ['outline / surface  (3:1 bar -- borders)', 'outline', 'surface'],
];

let worst = Infinity;
const report = CHECKS.map(([label, a, b]) => {
  const r = ratio(role(a), role(b));
  if (!label.includes('3:1')) worst = Math.min(worst, r);
  return `  ${label.padEnd(48)} ${r.toFixed(2)}`;
});

// --- Emit --------------------------------------------------------------------
const lines = [
  '/* ============================================================',
  '   Material 3 — colour roles',
  '',
  '   GENERATED FILE. Do not edit by hand.',
  '     npm run build:theme        (scripts/build-theme.mjs)',
  '',
  '   Produced by Google\'s own @material/material-color-utilities,',
  '   so every role is the tone M3 specifies rather than one picked',
  '   to look right.',
  '',
  '   Seeded from the Star Lord palette, one source colour per',
  '   tonal palette:',
  '',
  ...Object.entries(SOURCE).map(([k, v]) => `     ${k.padEnd(15)} ${v}`),
  '',
  '   Dark scheme only. The app has no light theme.',
  '   ============================================================ */',
  '',
  ':root {',
];

for (const [title, names] of GROUPS) {
  lines.push(`  /* ---- ${title} ---- */`);
  for (const n of names) lines.push(`  --md-sys-color-${kebab(n)}: ${role(n)};`);
  lines.push('');
}

lines.push(
  '  /* ---- State layer opacities ----',
  '     M3 renders interaction as a translucent layer of the content',
  '     colour over the component, rather than by swapping the',
  '     component\'s background. These are the spec values. */',
  '  --md-sys-state-hover-state-layer-opacity: 0.08;',
  '  --md-sys-state-focus-state-layer-opacity: 0.10;',
  '  --md-sys-state-pressed-state-layer-opacity: 0.10;',
  '  --md-sys-state-dragged-state-layer-opacity: 0.16;',
  '',
  '  /* Disabled is an opacity on the content and the container, not a',
  '     separate colour. */',
  '  --md-sys-state-disabled-content-opacity: 0.38;',
  '  --md-sys-state-disabled-container-opacity: 0.12;',
  '}',
  '',
  '/* Contrast at generation time:',
  ...report,
  '',
  `   Worst text pairing: ${worst.toFixed(2)}:1 ` +
    `(${worst >= 4.5 ? 'clears' : 'BELOW'} the 4.5:1 bar for body text).`,
  ' */',
  '',
);

// Resolved from the working directory, not import.meta.url: esbuild bundles
// this into node_modules/.cache before node runs it, so the module's own
// location is not where the source lives.
const OUT = resolve(process.cwd(), 'src/brand/tokens/colors.css');
writeFileSync(OUT, lines.join('\n'));

console.log('wrote src/brand/tokens/colors.css');
console.log(`  ${GROUPS.reduce((n, [, g]) => n + g.length, 0)} colour roles`);
console.log('\ncontrast:');
report.forEach((l) => console.log(l));
console.log(`\n  worst text pairing: ${worst.toFixed(2)}:1`);
