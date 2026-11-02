import React, { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChartColumn,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Shield,
  TriangleAlert,
  Upload,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from '../auth-context';
import { useProjectContext } from '../project-context';
import { PG_LOGO_B64 } from '../utils/pg-logo-b64';
import { decideCapsuleCompact } from '../capsule-collapse';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/observations", label: "Punch List", icon: ClipboardList },
  { path: "/ncrs", label: "NCRs", icon: TriangleAlert },
  { path: "/fats", label: "FAT", icon: ClipboardCheck },
  { path: "/reports", label: "Reports", icon: ChartColumn },
  { path: "/import", label: "Import", icon: Upload }
];

const ICON_SIZE = 14;

/** Icon + label. The label is hidden by CSS in compact mode; the accessible name then comes from aria-label. */
function PillContent({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon size={ICON_SIZE} strokeWidth={2.4} aria-hidden="true" focusable="false" className="pillIcon" />
      <span className="pillLabel">{label}</span>
    </>
  );
}

/**
 * Measures the slot the capsule buttons live in against a hidden copy of the
 * full (icon + label) buttons and reports whether they must collapse to icons.
 * useLayoutEffect runs before paint, so the first frame is already right (no
 * flicker), and ResizeObserver follows window resizes, font loading and label
 * changes (e.g. the Admin pill appearing).
 */
function useCapsuleCompact(
  slotRef: React.RefObject<HTMLElement | null>,
  measureRef: React.RefObject<HTMLElement | null>
): boolean {
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const measure = measureRef.current;
    if (!slot || !measure) {
      return;
    }

    const update = () => {
      const available = slot.clientWidth;
      const full = Math.ceil(measure.getBoundingClientRect().width);
      setCompact((previous) => decideCapsuleCompact(previous, available, full));
    };

    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(slot);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [slotRef, measureRef]);

  return compact;
}

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const { selectedProjectId } = useProjectContext();
  const [currentProjectName, setCurrentProjectName] = React.useState<string | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const compact = useCapsuleCompact(slotRef, measureRef);

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
  const isAdmin = session?.user.role === 'admin';

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  /** Props that make an icon-only pill accessible and give it a tooltip. */
  function compactProps(label: string) {
    return compact ? { "aria-label": label, "data-tooltip": label } : {};
  }

  const hallItem = { label: "Hall", icon: ChevronLeft };
  const adminItem = { label: "Admin", icon: Shield };
  const logoutItem = { label: "Logout", icon: LogOut };

  return (
    <header className="topbar">
      <div className="topbarBrand">
        <div className="topbarLogo">
          <img src={PG_LOGO_B64} alt="PG Logo" />
        </div>
        <div className="topbarBrandText">
          <h1 className="brand">
            NEWBUILDING<br /><span>INSPECTION</span>
          </h1>
          <p className="eyebrow topbarTagline">Technical Intelligence System</p>
        </div>
        {currentProjectName && !isGlobalHall && (
          <div className="topbarProject" title={currentProjectName}>
            <span className="topbarProjectDot" aria-hidden="true"></span>
            <div className="topbarProjectText">
              <p className="topbarProjectLabel">Project Context</p>
              <p className="topbarProjectName">{currentProjectName.toUpperCase()}</p>
            </div>
          </div>
        )}
      </div>

      <div ref={slotRef} className={`topbarNavSlot${compact ? " isCompact" : ""}`} data-compact={compact ? "true" : "false"}>
        {!isGlobalHall ? (
          <nav className="navPills topbarPrimaryNav" aria-label="Primary">
            <NavLink to="/" end className="pill" {...compactProps("Back to project hall")}>
              <PillContent {...hallItem} />
            </NavLink>
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.path}
                className={({ isActive }) => (isActive ? "pill active" : "pill")}
                {...compactProps(item.label)}
              >
                <PillContent icon={item.icon} label={item.label} />
              </NavLink>
            ))}
          </nav>
        ) : null}

        <nav className="navPills topbarGlobalNav" aria-label="Global Options">
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? "pill active" : "pill")} {...compactProps(adminItem.label)}>
              <PillContent {...adminItem} />
            </NavLink>
          )}
          <button type="button" className="pill topbarAction" onClick={handleLogout} {...compactProps(logoutItem.label)}>
            <PillContent {...logoutItem} />
          </button>
        </nav>

        {/* Hidden copy of the full buttons, used only to measure the width they need. */}
        <div className="topbarMeasureClip" aria-hidden="true">
        <div ref={measureRef} className="topbarMeasure">
          {!isGlobalHall ? (
            <div className="navPills">
              <span className="pill"><PillContent {...hallItem} /></span>
              {navItems.map((item) => (
                <span key={item.label} className="pill"><PillContent icon={item.icon} label={item.label} /></span>
              ))}
            </div>
          ) : null}
          <div className="navPills">
            {isAdmin ? <span className="pill"><PillContent {...adminItem} /></span> : null}
            <span className="pill topbarAction"><PillContent {...logoutItem} /></span>
          </div>
        </div>
        </div>
      </div>

      <div className="contextChip">
        <span>Signed In User</span>
        <strong>{(session?.user.displayName ?? session?.user.username ?? "Unknown").toUpperCase()}</strong>
      </div>
    </header>
  );
}
