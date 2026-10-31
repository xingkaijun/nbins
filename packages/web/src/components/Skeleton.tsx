import React from 'react';

/**
 * Placeholder table rows shown while a list loads. The rows are hidden from
 * assistive technology; announce the loading state separately (role="status").
 */
export function SkeletonRows({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="skeletonRow" aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              <span className="skeleton-box skeletonCell" style={{ width: `${55 + ((row * 7 + column * 13) % 40)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function PageSkeleton() {
  return (
    <div className="workspace">
      <div className="hero" style={{ marginBottom: 20 }}>
        <div className="skeleton-box" style={{ width: 200, height: 28 }}></div>
        <div className="skeleton-box" style={{ width: 300, height: 20 }}></div>
      </div>
      
      <div className="summaryGrid" style={{ marginBottom: 20 }}>
        <div className="skeleton-box" style={{ height: 80 }}></div>
        <div className="skeleton-box" style={{ height: 80 }}></div>
        <div className="skeleton-box" style={{ height: 80 }}></div>
        <div className="skeleton-box" style={{ height: 80 }}></div>
      </div>

      <div className="tableWrap" style={{ padding: 16 }}>
        <div className="skeleton-box" style={{ width: '100%', height: 40, marginBottom: 12 }}></div>
        <div className="skeleton-box" style={{ width: '100%', height: 40, marginBottom: 12 }}></div>
        <div className="skeleton-box" style={{ width: '100%', height: 40, marginBottom: 12 }}></div>
        <div className="skeleton-box" style={{ width: '100%', height: 40, marginBottom: 12 }}></div>
        <div className="skeleton-box" style={{ width: '100%', height: 40 }}></div>
      </div>
    </div>
  );
}
