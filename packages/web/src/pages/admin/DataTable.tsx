import React from "react";
import type { AdminColumn } from "./table-configs";

function valueOf(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

export function DataTable<TRecord extends Record<string, unknown>>(props: {
  columns: Array<AdminColumn<TRecord>>;
  data: TRecord[];
  selectedId?: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
  emptyMessage: string;
  onSelect: (record: TRecord) => void;
  onSort: (key: string) => void;
}) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 20;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [props.data, props.sortKey, props.sortDirection]);

  const totalPages = Math.ceil(props.data.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = props.data.slice(startIndex, startIndex + pageSize);

  return (
    <section className="panel adminPanel" style={{ display: "flex", flexDirection: "column" }}>
      <div className="tableWrap adminTableWrap" style={{ flex: 1, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              {props.columns.map((column) => (
                <th key={String(column.key)}>
                  {column.sortable ? (
                    <button type="button" className="adminSortButton" onClick={() => props.onSort(String(column.key))}>
                      {column.label}
                      {props.sortKey === String(column.key) ? (props.sortDirection === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((record) => {
                const rowId = String(record.id ?? "");
                return (
                  <tr
                    key={rowId}
                    className={rowId === props.selectedId ? "record-row isSelected" : "record-row"}
                    onClick={() => props.onSelect(record)}
                  >
                    {props.columns.map((column) => (
                      <td key={String(column.key)}>
                        {column.render ? column.render(record) : valueOf(record, String(column.key)) || "-"}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={props.columns.length}>
                  <div className="emptyState">{props.emptyMessage}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {props.data.length > pageSize && (
        <div className="paginationControls" style={{ padding: "16px", display: "flex", gap: "12px", justifyContent: "flex-end", alignItems: "center", borderTop: "1px solid var(--borderLighter)" }}>
          <span style={{ fontSize: "14px", color: "var(--textLight)" }}>
            Showing {startIndex + 1} to {Math.min(startIndex + pageSize, props.data.length)} of {props.data.length} records
          </span>
          <button type="button" className="pill" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
            Prev
          </button>
          <span style={{ fontSize: "14px", fontWeight: "bold" }}>
            Page {currentPage} of {totalPages}
          </span>
          <button type="button" className="pill" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
