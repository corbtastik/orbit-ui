import React, { useEffect, useRef, useState } from 'react';
import Icon from '../brand/Icon.jsx';
import { MdIconButton } from '../md/index.jsx';

// Copy to clipboard, with the tick that tells you it worked.
//
// Without the confirmation a copy button is indistinguishable from a dead
// one -- nothing visible happens either way, and the only way to find out is
// to paste somewhere and look.

const CONFIRM_MS = 1400;

export default function CopyButton({ text, label = 'Copy', size = 18, className = '' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  // The timeout outlives the component if a reply finishes and the transcript
  // re-renders while the tick is showing.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text ?? '');
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
    } catch {
      // Clipboard access is refused outside a secure context, and there is no
      // useful fallback -- execCommand('copy') is gone. Staying silent is
      // better than an error the reader cannot act on.
    }
  };

  return (
    <MdIconButton
      className={`copy-btn ${className}`}
      onClick={copy}
      title={copied ? 'Copied' : label}
      aria-label={label}
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={size} />
    </MdIconButton>
  );
}
