import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearAuthSession, useAuthSession } from "../auth";

const navItems = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/observations", label: "Observations" },
  { path: "/reports", label: "Reports" },
  { path: "/import", label: "Import" }
];

export function TopBar() {
  const session = useAuthSession();
  const location = useLocation();
  const navigate = useNavigate();
  const isGlobalHall = location.pathname === "/" || location.pathname === "/admin";
  const currentUser = session?.user;

  function handleLogout(): void {
    clearAuthSession();
    navigate("/login", { replace: true });
  }

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ background: '#fff', padding: '4px', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.2)' }}>
          <img
            src="https://i.postimg.cc/7LVr6n5m/PG-Logo.jpg"
            alt="PG Logo"
            style={{ height: '24px', width: 'auto', objectFit: 'contain' }}
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
          <NavLink to="/" className="pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--nb-text-muted)' }}>
             <span style={{ fontSize: '10px' }}>◀</span> HALL
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
            <NavLink to="/admin" className={({ isActive }) => (isActive ? "pill active" : "pill")}>
              Admin
            </NavLink>
        </nav>
        <div className="contextChip">
          <span>{currentUser?.role ?? "session"}</span>
          <strong>{(currentUser?.displayName ?? currentUser?.username ?? "Unknown User").toUpperCase()}</strong>
        </div>
        <button type="button" className="pill" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
