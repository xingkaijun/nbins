import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { useProjectContext } from '../project-context';

const navItems = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/observations", label: "Observations" },
  { path: "/ncrs", label: "NCRs" },
  { path: "/reports", label: "Reports" },
  { path: "/import", label: "Import" }
];

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const isGlobalHall = location.pathname === "/";

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ background: '#fff', padding: '6px 8px', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.2)' }}>
          <img
            src="https://i.postimg.cc/7LVr6n5m/PG-Logo.jpg"
            alt="PG Logo"
            style={{ height: '40px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </div>
        <div>
          <h1 className="brand">
            NEW BUILDING INSPECTION <span style={{ color: '#0f766e' }}>SYSTEM</span>
          </h1>
          <p className="eyebrow" style={{ marginTop: '2px', opacity: 0.8 }}>
            Technical Intelligence System
          </p>
        </div>
      </div>
      
      {!isGlobalHall ? (
        <nav className="navPills" aria-label="Primary">
          <NavLink to="/" className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--nb-text-muted)' }}>
             <span style={{ fontSize: '10px', marginTop: '-1px' }}>◀</span> HALL
          </NavLink>
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) => (isActive ? "pill active" : "pill")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : (
        <div style={{ flex: 1 }}></div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <nav className="navPills" aria-label="Global Options">
            {session?.user.role === 'admin' && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "pill active" : "pill")}>
                Admin
              </NavLink>
            )}
            <button type="button" className="pill topbarAction" onClick={handleLogout}>
              Logout
            </button>
        </nav>
        <div className="contextChip">
          <span>Signed In User</span>
          <strong>{(session?.user.displayName ?? session?.user.username ?? "Unknown").toUpperCase()}</strong>
        </div>
      </div>
    </header>
  );
}
