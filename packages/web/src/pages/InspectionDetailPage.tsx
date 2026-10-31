import React, { useCallback, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { INSPECTION_RESULT_LABELS, type InspectionItemDetailResponse } from "@nbins/shared";
import { publishInspectionUpdate } from "../inspection-sync";
import { InspectionWorkspace } from "./dashboard/InspectionWorkspace";
import { resultTone } from "./dashboard/dashboard-helpers";

/**
 * Standalone inspection item page: /inspections/:itemId
 *
 * - Real route: works on direct load, refresh and when the link is shared.
 *   Everything is loaded from the API by the id in the URL, nothing is passed
 *   through memory from the Dashboard tab.
 * - Auth: the route sits under <ProtectedRoute>; the session is read from
 *   localStorage (`nbins.auth.token` / `nbins.auth.user`) on start-up, so a new
 *   tab of the same origin is authenticated. Without a session the user is sent
 *   to /login?redirect=/inspections/:itemId and comes back after signing in.
 * - Every change is broadcast to other tabs (see inspection-sync.ts) so the
 *   Dashboard list updates its row.
 */
export function InspectionDetailPage() {
  const { itemId = "" } = useParams<{ itemId: string }>();

  const handleDetailChange = useCallback((detail: InspectionItemDetailResponse) => {
    publishInspectionUpdate(detail);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const handleDetailLoaded = useCallback((detail: InspectionItemDetailResponse) => {
    document.title = `${detail.hullNumber} · ${detail.itemName} | NBINS`;
  }, []);

  const renderHeader = useCallback((detail: InspectionItemDetailResponse) => {
    const currentResult = detail.resolvedResult ?? detail.lastRoundResult;
    const openComments = detail.comments.filter((comment) => comment.status === "open").length;

    const contextFields: Array<{ label: string; value: React.ReactNode }> = [
      { label: "Project", value: `${detail.projectName} (${detail.projectCode})` },
      { label: "Hull / Ship", value: `${detail.hullNumber} / ${detail.shipName}` },
      { label: "Discipline", value: detail.discipline },
      { label: "Planned Date", value: detail.plannedDate ?? "—" },
      { label: "Actual Date", value: detail.actualDate ?? "—" },
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
      <section className="inspectionPageContext" aria-label="Inspection context">
        <dl className="inspectionPageContextGrid">
          {contextFields.map((field) => (
            <div key={field.label} className="infoCard inspectionPageContextItem">
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }, []);

  if (!itemId) {
    return (
      <main className="workspace">
        <div className="alert warning" role="alert">Missing inspection item id.</div>
        <Link to="/dashboard" className="inspectionPageBack">← Back to inspection workspace</Link>
      </main>
    );
  }

  return (
    <main className="workspace inspectionPage">
      <nav className="inspectionPageNav" aria-label="Breadcrumb">
        <Link to="/dashboard" className="inspectionPageBack">← Inspection workspace</Link>
        <span className="inspectionPageId" title="Inspection item id">{itemId}</span>
      </nav>
      <div className="expansion-panel-inner inspectionPageBody">
        <InspectionWorkspace
          inspectionItemId={itemId}
          onDetailChange={handleDetailChange}
          onDetailLoaded={handleDetailLoaded}
          renderHeader={renderHeader}
        />
      </div>
    </main>
  );
}
