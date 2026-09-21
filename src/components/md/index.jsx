// React wrappers around @material/web.
//
// Material Web ships custom elements, not React components. React 18 sets
// unknown props on a custom element as string attributes and cannot bind to
// custom events declaratively, so `value` would arrive as the literal string
// and `onInput` would never fire. React 19 handles both natively; this app is
// on 18, and upgrading React is a bigger decision than adopting a component
// library.
//
// @lit/react's createComponent closes that gap: it sets real properties and
// maps custom events onto React-style handlers. One file, so the dependency
// has exactly one seam -- if Material Web ever has to be replaced, or React 19
// lands and these become unnecessary, this is the only place that changes.
//
// The element imports are side-effectful: importing the module registers the
// custom element. Only the elements this app uses are imported, because each
// one carries its own styles into the bundle.

import * as React from 'react';
import { createComponent } from '@lit/react';

import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/textfield/filled-text-field.js';
import '@material/web/select/filled-select.js';
import '@material/web/select/select-option.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';
import '@material/web/dialog/dialog.js';
import '@material/web/divider/divider.js';

import { MdFilledButton as MdFilledButtonEl } from '@material/web/button/filled-button.js';
import { MdFilledTonalButton as MdFilledTonalButtonEl } from '@material/web/button/filled-tonal-button.js';
import { MdOutlinedButton as MdOutlinedButtonEl } from '@material/web/button/outlined-button.js';
import { MdTextButton as MdTextButtonEl } from '@material/web/button/text-button.js';
import { MdIconButton as MdIconButtonEl } from '@material/web/iconbutton/icon-button.js';
import { MdFilledTextField as MdFilledTextFieldEl } from '@material/web/textfield/filled-text-field.js';
import { MdFilledSelect as MdFilledSelectEl } from '@material/web/select/filled-select.js';
import { MdSelectOption as MdSelectOptionEl } from '@material/web/select/select-option.js';
import { MdCircularProgress as MdCircularProgressEl } from '@material/web/progress/circular-progress.js';
import { MdList as MdListEl } from '@material/web/list/list.js';
import { MdListItem as MdListItemEl } from '@material/web/list/list-item.js';
import { MdMenu as MdMenuEl } from '@material/web/menu/menu.js';
import { MdMenuItem as MdMenuItemEl } from '@material/web/menu/menu-item.js';
import { MdDialog as MdDialogEl } from '@material/web/dialog/dialog.js';
import { MdDivider as MdDividerEl } from '@material/web/divider/divider.js';

// One hazard worth knowing before adding props to any of these.
//
// createComponent assigns every prop it does not recognise as an EVENT to the
// element as a PROPERTY -- `el[name] = value` -- rather than as an attribute.
// So a prop whose name collides with a read-only DOM property throws, and it
// throws inside a layout effect, which unmounts the React tree and leaves a
// blank page with the reason only in the console.
//
// `form` is the one this app hit: it is a getter-only property on every
// form-associated custom element, so <MdTextButton form="..."> is fatal.
// `labels`, `validity`, `validationMessage` and `elements` are the same shape
// of trap. Where an attribute is genuinely needed, set it with a ref rather
// than passing it as a prop.
const wrap = (tagName, elementClass, events) =>
  createComponent({ react: React, tagName, elementClass, events });

export const MdFilledButton = wrap('md-filled-button', MdFilledButtonEl);
export const MdFilledTonalButton = wrap('md-filled-tonal-button', MdFilledTonalButtonEl);
export const MdOutlinedButton = wrap('md-outlined-button', MdOutlinedButtonEl);
export const MdTextButton = wrap('md-text-button', MdTextButtonEl);
export const MdIconButton = wrap('md-icon-button', MdIconButtonEl);

// `input` and `change` are the two the fields actually emit. They are native
// event names, but they have to be declared here or the wrapper will not
// forward them as props.
export const MdFilledTextField = wrap('md-filled-text-field', MdFilledTextFieldEl, {
  onInput: 'input',
  onChange: 'change',
});

export const MdFilledSelect = wrap('md-filled-select', MdFilledSelectEl, {
  onChange: 'change',
});

export const MdSelectOption = wrap('md-select-option', MdSelectOptionEl);
export const MdCircularProgress = wrap('md-circular-progress', MdCircularProgressEl);

export const MdList = wrap('md-list', MdListEl);
export const MdListItem = wrap('md-list-item', MdListItemEl);
export const MdDivider = wrap('md-divider', MdDividerEl);

// A menu closes itself and then tells you; `closed` is the one to listen for
// if state has to follow. Items raise close-menu, which the menu handles.
export const MdMenu = wrap('md-menu', MdMenuEl, {
  onOpening: 'opening',
  onClosed: 'closed',
});

export const MdMenuItem = wrap('md-menu-item', MdMenuItemEl);

// `cancel` fires for Escape and the scrim, `closed` after it has finished
// animating away. Both matter: cancel is where "they did not choose" is
// distinguishable from "they chose", and closed is when state may be reset.
export const MdDialog = wrap('md-dialog', MdDialogEl, {
  onOpen: 'open',
  onClose: 'close',
  onClosed: 'closed',
  onCancel: 'cancel',
});
