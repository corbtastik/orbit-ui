import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import { installClientErrorReporting } from './lib/clientLog.js';
import './styles.css';

// A stack trace trapped in a browser console is invisible to anyone not
// sitting at that machine, and this app's failures are mostly asynchronous.
installClientErrorReporting();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
