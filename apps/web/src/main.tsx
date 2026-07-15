import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './i18n/config';
import './styles/global.css';
import './components/ui/ui.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
