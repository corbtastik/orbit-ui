import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import SectionHead from '../components/chat/SectionHead.jsx';

afterEach(cleanup);

describe('collapsible section heads', () => {
  // The accessible name is the visible label, not the title -- a title does
  // not override text content, and overriding it with aria-label would break
  // the rule that a visible label must appear in the accessible name. State
  // is carried by aria-expanded, which is what a screen reader announces.
  it('toggles and reports its state to assistive tech', () => {
    const onToggle = vi.fn();
    render(<SectionHead label="Chats" open onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: 'Chats' });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('flips aria-expanded and the hover title when collapsed', () => {
    render(<SectionHead label="Clusters" open={false} onToggle={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Clusters' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('title')).toBe('Expand Clusters');
  });

  // The count stands in for the list while it is hidden, so it appears only
  // when collapsed -- expanded, the list itself says it better.
  it('shows the count only while collapsed', () => {
    const { container, rerender } = render(
      <SectionHead label="Chats" count={7} open onToggle={() => {}} />
    );
    expect(container.querySelector('.chat-side__section-count')).toBeNull();
    rerender(<SectionHead label="Chats" count={7} open={false} onToggle={() => {}} />);
    expect(container.querySelector('.chat-side__section-count').textContent).toBe('7');
  });

  // Actions live beside the toggle, never inside it: a button nested in a
  // button is invalid, and collapsing on "new project" would be wrong.
  it('keeps trailing actions outside the toggle button', () => {
    const onToggle = vi.fn();
    const onAction = vi.fn();
    const { container } = render(
      <SectionHead
        label="Chats"
        open
        onToggle={onToggle}
        actions={<button type="button" onClick={onAction}>New</button>}
      />
    );
    const toggle = container.querySelector('.chat-side__section-toggle');
    expect(toggle.querySelector('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
