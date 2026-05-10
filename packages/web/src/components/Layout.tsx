import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { useLocation } from 'react-router-dom';
import { PageSkeleton } from './Skeleton';

export function Layout() {
  const location = useLocation();

  return (
    <div className="shell">
      <TopBar />
      <main key={location.pathname} className="page-transition-wrapper">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="bottomStatusBar" aria-label="Application status bar">
        <span className="bottomStatusTag">PG NEWBUILDING</span>
      </footer>
    </div>
  );
}
