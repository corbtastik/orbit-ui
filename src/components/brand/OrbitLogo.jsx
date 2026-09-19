import React, { useId } from 'react';

// The OrbitAI mark, from https://corbtastik.github.io/orbit-web/
//
// Upstream renders it in Three.js and spins it. This is the same mark held at
// a single angle -- the one public/brand/orbit-logo.svg draws for the favicon,
// so the tab icon and the sidebar show the same view of the same object.
//
// The geometry below and the favicon's are the same three orbital planes at
// the same projection; keep them in step. The difference is only that this one
// animates its gradient and the favicon cannot.
//
// Not Three.js, for reasons that outlived the rotation: ~600KB for a mark
// drawn at 34px, a WebGL context per instance, and a favicon that could never
// have used it anyway.

// Upstream's seven-stop palette. Each stop walks the whole palette on a 12s
// loop, offset from its neighbour, so the colour flows along the gradient
// rather than every stop changing together -- the flat equivalent of the
// position-phased colour wave in the original.
const PALETTE_STOPS = 7;

export default function OrbitLogo({ size = 34, title = 'OrbitAI', animated = true }) {
  // Gradient ids are document-global, so two marks on one page would otherwise
  // fight over the same one.
  const gradientId = `orbit-mark-${useId().replace(/:/g, '')}`;

  return (
    <svg
      className={`orbit-logo ${animated ? 'orbit-logo--animated' : ''}`}
      style={{ '--orbit-size': `${size}px` }}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          {Array.from({ length: PALETTE_STOPS }, (_, i) => (
            <stop
              key={i}
              offset={i / (PALETTE_STOPS - 1)}
              className="orbit-logo__stop"
              style={{ animationDelay: `${(-12 / PALETTE_STOPS) * i}s` }}
            />
          ))}
        </linearGradient>
      </defs>

      {/* Three orbital planes, as the mark projects at rotateX(12) rotateY(28). */}
      <g fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.6">
        <ellipse cx="32" cy="32" rx="25" ry="24" />
        <ellipse cx="32" cy="32" rx="25" ry="9" />
        <ellipse cx="32" cy="32" rx="11" ry="24.5" />
      </g>

      <g fill={`url(#${gradientId})`}>
        <circle cx="32" cy="32" r="6" />
        <circle cx="32" cy="8" r="4" />
        <circle cx="32" cy="56" r="3.2" />
        <circle cx="56" cy="27" r="4.2" />
        <circle cx="8" cy="37" r="3" />
      </g>
    </svg>
  );
}
