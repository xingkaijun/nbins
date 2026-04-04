import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';

export function Layout() {
  return (
    <div className="shell">
      <TopBar />
      <Outlet />
    </div>
  );
}
