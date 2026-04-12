import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { useProjectContext } from '../project-context';
import { PG_LOGO_B64 } from '../utils/pg-logo-b64';

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
  const { selectedProjectId } = useProjectContext();
  const [currentProjectName, setCurrentProjectName] = React.useState<string | null>(null);
  
  React.useEffect(() => {
    if (selectedProjectId) {
      import('../api').then(api => {
        api.fetchProjects().then(projects => {
          const p = projects.find(proj => proj.id === selectedProjectId);
          if (p) setCurrentProjectName(p.name);
        }).catch(err => console.error("Failed to fetch project name for TopBar:", err));
      });
    } else {
      setCurrentProjectName(null);
    }
  }, [selectedProjectId]);

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
            src={PG_LOGO_B64}
            alt="PG Logo"
            style={{ height: '40px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </div>
        <div>
          <h1 className="brand">
            NEW BUILDING INSPECTION <span>SYSTEM</span>
          </h1>
          <p className="eyebrow" style={{ marginTop: '2px', color: 'rgba(204, 251, 241, 0.6)' }}>
            Technical Intelligence System
          </p>
        </div>
        {currentProjectName && !isGlobalHall && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '12px', paddingLeft: '24px', borderLeft: '1px solid rgba(255,255,255,0.15)', height: '36px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--nb-accent-soft)' }}></span>
            <div>
              <p style={{ margin: 0, fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 800, color: 'rgba(204, 251, 241, 0.6)' }}>Project Context</p>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{currentProjectName.toUpperCase()}</p>
            </div>
          </div>
        )}
      </div>
      
      {!isGlobalHall ? (
        <nav className="navPills" aria-label="Primary">
          <NavLink to="/" className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', transform: 'translateY(-1px)' }}>
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
