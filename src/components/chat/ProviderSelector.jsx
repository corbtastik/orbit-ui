import React from 'react';
import { PROVIDERS } from './providers.js';
import { MdFilledSelect, MdSelectOption } from '../md/index.jsx';

// Material Web's filled select. It keeps the keyboard handling, focus and
// screen-reader behaviour the native <select> gave for free, and adds the
// menu surface M3 specifies -- which a native select cannot be styled into.
//
// Note ViewNavigator's shortcut handler has to ignore this as well as INPUT
// and TEXTAREA, or arrow keys would change the option *and* jump to another
// view at the same time.
export default function ProviderSelector({ value, onChange, disabled }) {
  return (
    <MdFilledSelect
      className="chat__provider-select"
      label="Model"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {PROVIDERS.map((p) => (
        <MdSelectOption key={p.id} value={p.id}>
          {p.label}
        </MdSelectOption>
      ))}
    </MdFilledSelect>
  );
}
