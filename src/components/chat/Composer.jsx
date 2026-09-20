import React, { useRef, useEffect } from 'react';
import { MdFilledTextField, MdFilledButton, MdOutlinedButton } from '../md/index.jsx';

// The composer, on Material Web's filled text field and buttons.
//
// Still a textarea underneath -- `type="textarea"` on the field -- for the
// reason it always was: keyboard shortcuts elsewhere bail out on INPUT and
// TEXTAREA targets, so typing here must not also trigger them.

const MAX_HEIGHT = 160;

export default function Composer({ value, onChange, onSubmit, disabled, streaming, onStop }) {
  const ref = useRef(null);

  // Grow with the content, up to a ceiling, then scroll.
  //
  // The textarea this measures lives inside the field's shadow root, and
  // Material Web keeps its reference private, so this reaches through
  // shadowRoot directly. That is a real coupling to an internal, and it is
  // deliberate: the field ships no auto-grow and no resize hook, and driving
  // `rows` from a guess at the wrapped line count makes the box jump around.
  // The shadow root is open, so this is reachable rather than a hack against
  // encapsulation -- but it is the one place in the app that depends on a
  // Material Web internal, and it is why it is written down here.
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let cancelled = false;

    // Lit renders asynchronously: on the first pass the shadow root is not
    // populated yet, so measuring immediately finds nothing.
    Promise.resolve(host.updateComplete).then(() => {
      if (cancelled) return;
      const textarea = host.shadowRoot?.querySelector('textarea');
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
    });

    return () => { cancelled = true; };
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter breaks the line -- the convention everywhere.
    // Keyboard events are composed, so this still fires on the host even
    // though the textarea that raised it is inside the shadow root.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat__composer">
      <MdFilledTextField
        ref={ref}
        className="chat__input"
        type="textarea"
        rows={1}
        placeholder="Ask about your Atlas deployment…"
        value={value}
        disabled={disabled}
        onInput={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {streaming ? (
        <MdOutlinedButton className="chat__send chat__send--stop" onClick={onStop}>
          Stop
        </MdOutlinedButton>
      ) : (
        <MdFilledButton
          className="chat__send"
          onClick={submit}
          disabled={disabled || !value.trim()}
        >
          Send
        </MdFilledButton>
      )}
    </div>
  );
}
