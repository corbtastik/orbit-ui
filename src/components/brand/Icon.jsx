import React from 'react';

// A Material Symbols icon.
//
// The glyph is the icon's name as text content -- that is how the font works:
// `<span class="material-symbols-outlined">close</span>` renders an X, because
// a ligature maps the word to the glyph. Names come from
// https://fonts.google.com/icons.
//
// Replaced the Unicode glyphs this app used before (▸ ✕ ☰ ⟨ ✓ → ↓). Those
// rendered in whatever the system font had, which meant a different shape and
// weight on every platform and no relationship to the type beside them.
//
// `size` sets the optical size axis as well as the rendered size, so the
// stroke stays correct rather than being scaled up from a 24px drawing.

export default function Icon({ name, size = 20, weight = 400, fill = false, className = '', ...rest }) {
  return (
    <span
      className={`material-symbols-outlined icon ${className}`}
      style={{
        fontSize: `${size}px`,
        // opsz must track the rendered size or the stroke is wrong; GRAD is
        // lifted slightly because this app is dark-only and light-on-dark
        // strokes read thinner than they measure.
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
      }}
      aria-hidden="true"
      {...rest}
    >
      {name}
    </span>
  );
}
