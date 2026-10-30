import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './artwork-theme.css';
import './liquid-glass.css';
import './experience.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
