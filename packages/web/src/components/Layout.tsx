import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';

export function Layout() {
  return (
    <div className="shell">
      <TopBar />
      <Outlet />
      <footer className="bottomStatusBar" aria-label="Application status bar">
        <span className="bottomStatusTag">PG NEWBUILDING</span>
      </footer>
    </div>
  );
}
