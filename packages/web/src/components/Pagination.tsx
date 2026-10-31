import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPageChange(page: number): void;
  onPageSizeChange(size: number): void;
  label?: string;
}

export function Pagination({
  page,
  pageCount,
  from,
  to,
  total,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  label = "Pagination"
}: PaginationProps) {
  return (
    <nav className="pagination" aria-label={label}>
      <span className="paginationSummary" aria-live="polite">
        {total === 0 ? "0 items" : `${from}–${to} of ${total}`}
      </span>
      <label className="paginationSize">
        <span>Rows</span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
      <div className="paginationButtons">
        <button
          type="button"
          className="nbIconButton"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="paginationPage">Page {page} / {pageCount}</span>
        <button
          type="button"
          className="nbIconButton"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
