import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { INSPECTION_RESULT_LABELS, type InspectionItemDetailResponse } from "@nbins/shared";
import { publishInspectionUpdate, closeCurrentTab } from "../inspection-sync";
import { InspectionWorkspace } from "./dashboard/InspectionWorkspace";
import { resultTone } from "./dashboard/dashboard-helpers";
import "./InspectionDetailPage.css";

/**
 * Standalone inspection item page: /inspections/:itemId
 *
 * This page is opened in a *new browser tab* from the Dashboard, so it is a
 * lightweight shell for exactly one item — not a second copy of the workspace:
 *
 * - No <Layout>: App.tsx registers the route as a sibling of the "/" layout
 *   route (still under <ProtectedRoute>), so this page renders its own compact
 *   header and none of the TopBar, global menu, project picker, list pagination
 *   or Hall/Admin/Import/Reports entry points. The Dashboard tab keeps its
 *   filters and page number untouched because nothing navigates inside it.
 * - Everything is loaded from the API by the id in the URL, so a direct load,
 *   a refresh and a shared link all work. The route stays under
 *   <ProtectedRoute>, so the auth guard is the same as every other page:
 *   without a session the user goes to /login?redirect=/inspections/:itemId
 *   and comes back after signing in.
 * - Changes are broadcast to the Dashboard tab (see inspection-sync.ts), which
 *   updates the matching row in place.
 * - "Close tab" calls window.close(). Browsers only allow that for tabs opened
 *   by script (the normal Dashboard flow); for a directly typed URL it is
 *   silently ignored. That is why the hint below never promises a close.
 */
export function InspectionDetailPage() {
  const { itemId = "" } = useParams<{ itemId: string }>();

  const [title, setTitle] = useState("Inspection");
  const [subtitle, setSubtitle] = useState("");
  const [showCloseHint, setShowCloseHint] = useState(false);

  const handleDetailChange = useCallback((detail: InspectionItemDetailResponse) => {
    publishInspectionUpdate(detail);
  }, []);

  const handleDetailLoaded = useCallback((detail: InspectionItemDetailResponse) => {
    const heading = `${detail.hullNumber} · ${detail.itemName}`;
    setTitle(heading);
    setSubtitle(`${detail.projectCode} · ${detail.shipName} · ${detail.discipline}`);
    document.title = `${heading} | NBINS`;
  }, []);

  // Restore the generic title when this page unmounts (back to / re-render).
  useEffect(() => {
    return () => {
      document.title = "NBINS";
    };
  }, []);

  /**
   * window.close() only works for script-opened tabs and gives no feedback, so
   * try it once and always show the manual-close hint. Never claim success.
   */
  const handleCloseTab = useCallback(() => {
    setShowCloseHint(true);
    closeCurrentTab();
  }, []);

  const renderHeader = useCallback((detail: InspectionItemDetailResponse) => {
    const currentResult = detail.resolvedResult ?? detail.lastRoundResult;
    const openComments = detail.comments.filter((comment) => comment.status === "open").length;

    const contextFields: Array<{ label: string; value: React.ReactNode }> = [
      { label: "Project", value: `${detail.projectName} (${detail.projectCode})` },
      { label: "Hull / Ship", value: `${detail.hullNumber} / ${detail.shipName}` },
      { label: "Discipline", value: detail.discipline },
      { label: "Planned", value: detail.plannedDate ?? "—" },
      { label: "Actual", value: detail.actualDate ?? "—" },
      { label: "Workflow", value: detail.workflowStatus.toUpperCase() },
      {
        label: "Result",
        value: (
          <span className={`resultBadge ${resultTone(currentResult)}`}>
            {currentResult ? INSPECTION_RESULT_LABELS[currentResult] || currentResult : "PENDING"}
          </span>
        )
      },
      { label: "Open Comments", value: openComments }
    ];

    return (
      <section aria-label="Inspection context">
        <dl className="inspectionTabContext">
          {contextFields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd title={typeof field.value === "string" ? field.value : undefined}>{field.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }, []);

  const header = (
    <header className="inspectionTabHeader">
      <div className="inspectionTabBrand">
        <span className="inspectionTabBrandMark">NBINS</span>
        <span className="inspectionTabBrandSub">Inspection</span>
      </div>
      <div className="inspectionTabTitleBlock">
        <h1 className="inspectionTabTitle" title={title}>{title}</h1>
        {subtitle ? <p className="inspectionTabSubtitle" title={subtitle}>{subtitle}</p> : null}
      </div>
      <button type="button" className="inspectionTabClose" onClick={handleCloseTab}>
        Close tab
      </button>
    </header>
  );

  if (!itemId) {
    return (
      <div className="inspectionTab">
        {header}
        <main className="inspectionTabBody">
          <div className="alert warning" role="alert">Missing inspection item id.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="inspectionTab">
      {header}

      {showCloseHint ? (
        <p className="inspectionTabCloseHint" role="status">
          Browsers only close tabs they opened themselves. If this tab is still open,
          close it with Ctrl+W (⌘+W on macOS).
        </p>
      ) : null}

      <main className="inspectionTabBody">
        <InspectionWorkspace
          inspectionItemId={itemId}
          onDetailChange={handleDetailChange}
          onDetailLoaded={handleDetailLoaded}
          renderHeader={renderHeader}
        />
      </main>
    </div>
  );
}
