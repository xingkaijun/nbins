import React from 'react';

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
