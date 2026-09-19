import React from 'react';
import { PROVIDERS } from './providers.js';

// A native <select> rather than a custom menu: it gets keyboard handling,
// focus and screen-reader behaviour for free, and this is a control people
// will use once per conversation rather than a centrepiece.
//
// Note ViewNavigator's shortcut handler has to ignore SELECT as well as INPUT
// and TEXTAREA, or arrow keys would change the option *and* jump to another
// view at the same time.
export default function ProviderSelector({ value, onChange, disabled }) {
  return (
    <label className="chat__provider">
      <span className="chat__provider-label">Model</span>
      <select
        className="chat__provider-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
    </label>
  );
}
