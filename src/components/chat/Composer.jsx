import React, { useRef, useEffect } from 'react';

// A real <textarea> rather than a contenteditable div, deliberately:
// ViewNavigator's keyboard shortcuts bail out on INPUT and TEXTAREA targets,
// so typing "3" or pressing an arrow key here edits text instead of jumping
// to another view.
export default function Composer({ value, onChange, onSubmit, disabled, streaming, onStop }) {
  const ref = useRef(null);

  // Grow with the content, up to a ceiling, then scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter breaks the line -- the convention everywhere.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat__composer">
      <textarea
        ref={ref}
        className="chat__input"
        rows={1}
        placeholder="Ask about your Atlas deployment…"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {streaming ? (
        <button type="button" className="chat__send chat__send--stop" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button
          type="button"
          className="chat__send"
          onClick={submit}
          disabled={disabled || !value.trim()}
        >
          Send
        </button>
      )}
    </div>
  );
}
