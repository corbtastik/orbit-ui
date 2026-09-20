import React, { useId, useState } from 'react';
import { relativeTime, DEFAULT_PROJECT } from './conversations.js';
import { providerLabel } from './providers.js';
import Icon from '../brand/Icon.jsx';
import {
  MdListItem,
  MdIconButton,
  MdMenu,
  MdMenuItem,
  MdDialog,
  MdTextButton,
  MdDivider,
  MdFilledTextField,
} from '../md/index.jsx';

// One conversation in the drawer, as an M3 list item.
//
// The item carries the select action; the move and delete controls sit in its
// `end` slot. They cannot be nested inside the item's own button, so the row
// is a list item with interactive children rather than a single control.
export default function ChatListItem({ conversation, active, onSelect, onDelete, onMove, onTogglePin, onRename, projects = [] }) {
  const { id, title, updatedAt, provider, projectId, pinnedAt } = conversation;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);

  // md-menu anchors by element id, so each row needs one of its own -- two
  // rows sharing an anchor id would open every menu against the first.
  const anchorId = `move-${useId().replace(/:/g, '')}`;

  return (
    <>
      <MdListItem
        type="button"
        className={`chat-side__row ${active ? 'chat-side__row--active' : ''}`}
        onClick={() => onSelect(id)}
        title={`${title} · ${providerLabel(provider)}`}
      >
        <span
          slot="start"
          className={`chat-side__dot chat-msg__provider-dot--${provider}`}
        />
        <span slot="headline" className="chat-side__item-title">{title}</span>
        <span slot="trailing-supporting-text">{relativeTime(updatedAt)}</span>

        <span slot="end" className="chat-side__row-actions">
          {onMove && (
            <>
              <MdIconButton
                id={anchorId}
                className="chat-side__move"
                // The item is a button, so a click inside it would also
                // select the conversation without this.
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                title="Move to project"
                aria-label={`Move ${title} to a project`}
              >
                <Icon name="drive_file_move" size={18} />
              </MdIconButton>

              {/* positioning="popover" puts the menu in the top layer, so it
                  is not clipped by the drawer's overflow the way an
                  absolutely positioned one would be. */}
              <MdMenu
                anchor={anchorId}
                positioning="popover"
                open={menuOpen}
                onClosed={() => setMenuOpen(false)}
              >
                {onRename && (
                  <MdMenuItem onClick={() => { setDraft(title); setRenaming(true); }}>
                    <Icon slot="start" name="edit" size={20} />
                    <span slot="headline">Rename</span>
                  </MdMenuItem>
                )}
                {onTogglePin && (
                  <>
                    <MdMenuItem onClick={() => onTogglePin(id, !pinnedAt)}>
                      <Icon slot="start" name={pinnedAt ? 'keep_off' : 'keep'} size={20} />
                      <span slot="headline">{pinnedAt ? 'Unpin' : 'Pin'}</span>
                    </MdMenuItem>
                    <MdDivider />
                  </>
                )}
                <MdMenuItem
                  selected={(projectId ?? DEFAULT_PROJECT) === DEFAULT_PROJECT}
                  onClick={() => onMove(id, DEFAULT_PROJECT)}
                >
                  <span slot="headline">default</span>
                </MdMenuItem>
                {projects.map((p) => (
                  <MdMenuItem
                    key={p.id}
                    selected={projectId === p.id}
                    onClick={() => onMove(id, p.id)}
                  >
                    <span slot="headline">{p.name}</span>
                  </MdMenuItem>
                ))}
              </MdMenu>
            </>
          )}

          <MdIconButton
            className="chat-side__delete"
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
            title="Delete chat"
            aria-label={`Delete ${title}`}
          >
            <Icon name="delete" size={18} />
          </MdIconButton>
        </span>
      </MdListItem>

      {/* PATCH has accepted a title since the first commit; there was simply
          no way to reach it, so a chat named after its opening "hey" stayed
          that way forever. */}
      <MdDialog open={renaming} onClosed={() => setRenaming(false)}>
        <div slot="headline">Rename chat</div>
        <form slot="content" id="rename-form" method="dialog" onSubmit={(e) => {
          e.preventDefault();
          const next = draft.trim();
          setRenaming(false);
          if (next && next !== title) onRename(id, next);
        }}>
          <MdFilledTextField
            className="chat-side__rename-input"
            label="Title"
            value={draft}
            onInput={(e) => setDraft(e.target.value)}
          />
        </form>
        <div slot="actions">
          <MdTextButton onClick={() => setRenaming(false)}>Cancel</MdTextButton>
          <MdTextButton type="submit" form="rename-form">Save</MdTextButton>
        </div>
      </MdDialog>

      {/* Deleting a conversation is not recoverable, so it asks. This used to
          be the row swapping its own text to "Delete this chat?" -- compact,
          but it was dismissed by moving the mouse away, which is not a
          decision. A dialog makes the choice deliberate and gives Escape and
          the scrim a defined meaning. */}
      <MdDialog open={confirming} onClosed={() => setConfirming(false)}>
        <div slot="headline">Delete this chat?</div>
        <div slot="content">
          “{title}” and its messages will be removed. This cannot be undone.
        </div>
        <div slot="actions">
          <MdTextButton onClick={() => setConfirming(false)}>Cancel</MdTextButton>
          <MdTextButton
            className="chat-side__delete-confirm"
            onClick={() => { setConfirming(false); onDelete(id); }}
          >
            Delete
          </MdTextButton>
        </div>
      </MdDialog>
    </>
  );
}
