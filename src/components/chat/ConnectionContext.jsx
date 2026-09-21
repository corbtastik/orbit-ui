import React from 'react';
import Icon from '../brand/Icon.jsx';

// Where this conversation is currently pointed.
//
// It used to be the fixed string "Atlas admin · cluster data", which said what
// the app could reach rather than what it had reached -- so mid-conversation
// there was no way to tell which cluster the next tool call would hit. You
// steer this in prose ("use the corbs-demo cluster"), and prose is exactly the
// kind of instruction that quietly does not take.
//
// The values come from the server, which reads them off the tool calls as they
// go past. Nothing here is declared; it is all observed.

// Ordered widest to narrowest, the way the connection itself narrows.
//
// groupId was collected by the server and then rendered by nothing, so a
// conversation answered entirely by Atlas admin tools -- manage_projects,
// manage_clusters -- ran its tools successfully and still read "not connected
// yet". Those tools carry the project and nothing else.
const PARTS = [
  { key: 'groupId', icon: 'workspaces', title: 'Atlas project' },
  { key: 'connection', icon: 'dns', title: 'Connection' },
  { key: 'database', icon: 'database', title: 'Database' },
  { key: 'collection', icon: 'folder', title: 'Collection' },
];

export default function ConnectionContext({ context }) {
  const parts = PARTS.filter((p) => context?.[p.key]);

  // Before the first tool call there is genuinely nothing to report, and
  // saying so beats an empty chip that looks broken.
  if (parts.length === 0) {
    return (
      <div className="chat__context chat__context--idle" title="Set by asking — no tool has run yet">
        <Icon name="link_off" size={16} />
        Not connected yet
      </div>
    );
  }

  return (
    <div className="chat__context" title="Read from this conversation's tool calls">
      {parts.map((p, i) => (
        <React.Fragment key={p.key}>
          {i > 0 && <span className="chat__context-sep">/</span>}
          <span className="chat__context-part" title={p.title}>
            <Icon name={p.icon} size={16} />
            {context[p.key]}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
