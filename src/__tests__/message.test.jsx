import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import Message from '../components/chat/Message.jsx';

// md-icon-button cannot finish upgrading under jsdom -- ElementInternals has
// no setFormValue there, so @material/web's form-associated mixin throws and
// this file contributes to the suite's unhandled-error noise. React still
// emits the element and still attaches the click listener, so the wiring is
// testable even though the component is not.

afterEach(cleanup);

// jsdom has no clipboard at all; without this the copy silently swallows a
// TypeError and the test would pass whether or not it was wired up.
function stubClipboard() {
  const writes = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { writes.push(t); } },
  });
  return writes;
}

const PROMPT = 'Which cities have the most incidents? Give me the top fifteen.';

describe('a user prompt', () => {
  it('renders the prompt text', () => {
    render(<Message message={{ role: 'user', text: PROMPT }} />);
    expect(screen.getByText(PROMPT)).toBeTruthy();
  });

  // The ask: getting a previous prompt back without selecting it by hand out
  // of a scrolling transcript.
  it('offers a copy control', () => {
    render(<Message message={{ role: 'user', text: PROMPT }} />);
    expect(screen.getByLabelText('Copy prompt')).toBeTruthy();
  });

  it('copies the prompt, not a truncation of it', async () => {
    const writes = stubClipboard();
    render(<Message message={{ role: 'user', text: PROMPT }} />);

    fireEvent.click(screen.getByLabelText('Copy prompt'));
    await waitFor(() => expect(writes).toEqual([PROMPT]));
  });

  // Distinct from "Copy reply", so the accessible names do not collide in a
  // transcript where both are present.
  it('names itself apart from the assistant control', () => {
    const { container } = render(
      <>
        <Message message={{ role: 'user', text: 'ask' }} />
        <Message message={{ role: 'assistant', text: 'answer' }} />
      </>
    );
    const labels = [...container.querySelectorAll('[aria-label]')].map((n) => n.getAttribute('aria-label'));
    expect(labels).toContain('Copy prompt');
    expect(labels).toContain('Copy reply');
  });

  // An empty turn would otherwise render a control that copies nothing.
  it('omits the control when there is no text', () => {
    render(<Message message={{ role: 'user', text: '' }} />);
    expect(screen.queryByLabelText('Copy prompt')).toBeNull();
  });
});
