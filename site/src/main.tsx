import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/anton';
import '@agentic-fbd/theme/tokens.css';
import './styles.css';
import './i18n/index.ts';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
