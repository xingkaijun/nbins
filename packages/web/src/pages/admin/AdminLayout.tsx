import React from "react";
import { Link } from "react-router-dom";
import { ADMIN_GROUPS } from "./table-configs";

interface NavItem {
  key: string;
  label: string;
  group: string;
  count?: number;
  status?: "active" | "coming-soon";
}

const MAIN_APP_LINKS = [
  { path: "/", label: "Projects (Hall)" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/observations", label: "Observations" },
  { path: "/ncrs", label: "NCRs" },
  { path: "/reports", label: "Reports" },
  { path: "/import", label: "Import" }
];

export function AdminLayout(props: {
  metaLine: string;
  activeKey: string;
  items: NavItem[];
  statusMessage?: string | null;
  errorMessage?: string | null;
  onSelect: (key: string) => void;
  onRefresh: () => void;
  sidebarFooter?: React.ReactNode;
  children: React.ReactNode;
  editor?: React.ReactNode;
}) {
  return (
    <main className="workspace adminConsole">
      <section className="adminShell">
        <header className="adminHeader">
          <div>
            <p className="eyebrow">Database Browser</p>
            <h2>ADMIN CONSOLE</h2>
          </div>
          <div className="adminHeaderActions">
            <span className="badge muted">{props.metaLine}</span>
            <button className="submitButton" type="button" onClick={props.onRefresh}>
              Refresh All
            </button>
          </div>
        </header>

        {props.statusMessage ? <div className="alert success">{props.statusMessage}</div> : null}
        {props.errorMessage ? <div className="alert error">{props.errorMessage}</div> : null}

        <div className="adminBody">
          <aside className="adminSidebar">
            <section className="adminNavGroup">
              <p>Main App</p>
              <div className="adminNavList">
                {MAIN_APP_LINKS.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className="adminNavButton"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span>{link.label}</span>
                    <span className="badge muted">→</span>
                  </Link>
                ))}
              </div>
            </section>

            {ADMIN_GROUPS.map((group) => {
              const groupItems = props.items.filter((item) => item.group === group.key);
              if (groupItems.length === 0) return null;

              return (
                <section key={group.key} className="adminNavGroup">
                  <p>{group.label}</p>
                  <div className="adminNavList">
                    {groupItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={item.key === props.activeKey ? "adminNavButton isActive" : "adminNavButton"}
                        onClick={() => props.onSelect(item.key)}
                      >
                        <span>{item.label}</span>
                        <span className={item.status === "coming-soon" ? "badge muted" : "badge"}>
                          {item.status === "coming-soon" ? "Soon" : item.count ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}

            {props.sidebarFooter ? <div className="adminSidebarFooter">{props.sidebarFooter}</div> : null}
          </aside>

          <section className="adminWorkspace">{props.children}</section>

          {props.editor ? <aside className="adminEditorRail">{props.editor}</aside> : null}
        </div>
      </section>
    </main>
  );
}
