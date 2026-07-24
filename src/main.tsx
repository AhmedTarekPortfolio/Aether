import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { isDesktop } from './desktop/isDesktop';
import App from './App';
import './index.css';

const Router = isDesktop() ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Router>
        <App />
      </Router>
    </ErrorBoundary>
  </React.StrictMode>
);
