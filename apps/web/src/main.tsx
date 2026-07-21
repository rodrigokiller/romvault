import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initSentry } from './lib/sentry';
import './i18n/config';
import './styles/global.css';
import './components/ui/ui.css';

// antes do render: assim erro de inicialização também é capturado
initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
