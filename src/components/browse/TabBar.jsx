import React, { useState } from 'react';
import Icon from '../brand/Icon.jsx';
import { MdIconButton } from '../md/index.jsx';
import ContextMenu, { ContextMenuItem } from '../ContextMenu.jsx';

// The main view's tabs. Chat is always first and cannot be closed -- it is
// the application, and the browse tabs are things opened alongside it.
//
// Hand-built rather than md-tabs, and staying that way. Every tab here
// carries a close control, which md-tabs does not expect: it owns activation
// and treats its tabs as single targets, so an interactive child fights it.
// A close-per-tab is worth more than the component would give back, and this
// is already built to the M3 primary-tab spec -- 48dp, label-large, an inset
// 3dp indicator -- on the same tokens everything else uses.

// One entry per tab kind. The ternary chain this replaces fell through to
// tab.db for any kind it did not know about, so a bucket tab rendered a blank
// label and an aria-label reading "Close undefined".
const DESCRIBE = {
  collection: (t) => ({ icon: 'folder', label: t.coll, title: `${t.db}.${t.coll}` }),
  database: (t) => ({ icon: 'database', label: t.db, title: t.db }),
  bucket: (t) => ({ icon: 'folder_open', label: t.bucket, title: `${t.storeName}/${t.bucket}` }),
  // The key, not the whole path: a key can be long, and the prefix is already
  // in the tab beside it.
  object: (t) => ({
    icon: 'draft',
    label: t.key.split('/').pop(),
    title: `${t.storeName}/${t.bucket}/${t.key}`,
  }),
};

const describe = (tab) =>
  DESCRIBE[tab.kind]?.(tab) ?? { icon: 'help', label: tab.kind, title: tab.kind };

export default function TabBar({ tabs, activeId, onSelect, onClose, onCloseRight }) {
  // { id, x, y } while open. Position and dismissal belong to ContextMenu;
  // this only decides what the entries are for the tab under the pointer.
  const [menu, setMenu] = useState(null);

  const openMenu = (e, id) => {
    e.preventDefault();
    // Deliberately does not select the tab. Right-clicking to close something
    // should not first navigate to it -- you may be closing it precisely
    // because you do not want to look at it.
    setMenu({ id, x: e.clientX, y: e.clientY });
  };

  const close = () => setMenu(null);

  // Chat is index -1: it is always first and never closable, so "to the right"
  // of it means every browse tab.
  const indexOf = (id) => (id === 'chat' ? -1 : tabs.findIndex((t) => t.id === id));
  const hasRight = menu ? indexOf(menu.id) < tabs.length - 1 : false;
  const closable = menu ? menu.id !== 'chat' : false;

  const run = (fn) => { close(); fn(); };

  return (
    <div className="tabbar" role="tablist">
      <button
        type="button"
        role="tab"
        className={`tabbar__tab ${activeId === 'chat' ? 'tabbar__tab--active' : ''}`}
        aria-selected={activeId === 'chat'}
        onClick={() => onSelect('chat')}
        onContextMenu={(e) => openMenu(e, 'chat')}
      >
        Chat
      </button>

      {tabs.map((tab) => {
        const { icon, label, title } = describe(tab);
        return (
        <span
          key={tab.id}
          className={`tabbar__tab ${activeId === tab.id ? 'tabbar__tab--active' : ''}`}
          onContextMenu={(e) => openMenu(e, tab.id)}
        >
          <button
            type="button"
            role="tab"
            className="tabbar__label"
            aria-selected={activeId === tab.id}
            onClick={() => onSelect(tab.id)}
            title={title}
          >
            <Icon name={icon} size={18} />
            {label}
          </button>
          <MdIconButton
            className="tabbar__close"
            onClick={() => onClose(tab.id)}
            title="Close tab"
            aria-label={`Close ${label}`}
          >
            <Icon name="close" size={18} />
          </MdIconButton>
        </span>
        );
      })}

      {menu && (
        <ContextMenu at={menu} onClose={close} items={2}>
          <ContextMenuItem
            disabled={!closable}
            // Chat is the application, not something opened alongside it.
            title={closable ? undefined : 'The Chat tab cannot be closed'}
            onClick={() => run(() => onClose(menu.id))}
          >
            <Icon name="close" size={18} />
            Close
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasRight}
            onClick={() => run(() => onCloseRight?.(menu.id))}
          >
            <Icon name="last_page" size={18} />
            Close tabs to the right
          </ContextMenuItem>
        </ContextMenu>
      )}

    </div>
  );
}
