import React, { useState, useEffect, useRef } from 'react';
import { executeSql, exportDatabase, importDatabase, exportProject, importProject, deleteProject, fetchProjects } from '../api.ts';

export function SqlConsole() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem('sqlSecret') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginDraft, setLoginDraft] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [sql, setSql] = useState('SELECT * FROM users LIMIT 10;');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [importMode, setImportMode] = useState<'none' | 'db' | 'project'>('none');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 验证口令 — 用一个轻量 SQL 试探
  const verifySecret = async (s: string): Promise<boolean> => {
    try {
      await executeSql('SELECT 1', s);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!secret) return;

    let active = true;
    (async () => {
      const ok = await verifySecret(secret);
      if (!active) return;
      if (!ok) {
        setIsAuthenticated(false);
        sessionStorage.removeItem('sqlSecret');
        setLoginError('口令验证失败，请检查后重试');
        setSecret('');
        return;
      }
      setIsAuthenticated(true);
      try {
        const data = await fetchProjects();
        if (!active) return;
        setProjects(data);
        if (data.length > 0) setSelectedProjectId(data[0].id);
      } catch { /* ignore */ }
    })();

    return () => { active = false; };
  }, [secret]);

  const handleLogin = async () => {
    if (!loginDraft) return;
    setLoginError('');
    const ok = await verifySecret(loginDraft);
    if (ok) {
      sessionStorage.setItem('sqlSecret', loginDraft);
      setSecret(loginDraft);
    } else {
      setLoginError('口令错误，请确认你输入的是 SQL_CONSOLE_SECRET 的值');
    }
  };

  const handleExecute = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await executeSql(sql, secret);
      setResult(res);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleExecute();
    }
  };

  const downloadCompressed = (data: any, filename: string) => {
    const jsonStr = JSON.stringify(data);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // 显示大小提示
    const sizeKb = Math.round(jsonStr.length / 1024);
    const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
    setStatusMsg(`已下载 ${filename} (${sizeStr})`);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const handleExportDb = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await exportDatabase(secret);
      const date = new Date().toISOString().split('T')[0];
      downloadCompressed(data, `nbins-db-${date}.json`);
    } catch (e: any) {
      setError("Export DB failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportProject = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError('');
    try {
      const data = await exportProject(selectedProjectId, secret);
      const code = projects.find(p => p.id === selectedProjectId)?.code || 'proj';
      const date = new Date().toISOString().split('T')[0];
      downloadCompressed(data, `nbins-project-${code}-${date}.json`);
    } catch (e: any) {
      setError("Export project failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (importMode === 'db') {
        if (!confirm("⚠️ 警告：这将清空并覆盖整个数据库。确认继续？")) return;
        setLoading(true);
        await importDatabase(data, secret);
        setStatusMsg('数据库导入成功！');
        setTimeout(() => setStatusMsg(''), 4000);
      } else if (importMode === 'project') {
        if (!data.projects?.[0]) {
          setError("文件格式不正确：缺少 projects 表数据");
          return;
        }
        const code = data.projects[0].code;
        if (!confirm(`⚠️ 警告：这将覆盖项目 [${code}] 的所有数据。确认继续？`)) return;
        setLoading(true);
        await importProject(data, secret);
        setStatusMsg(`项目 [${code}] 导入成功！`);
        setTimeout(() => setStatusMsg(''), 4000);
        // Refresh projects
        const updated = await fetchProjects();
        setProjects(updated);
      }
    } catch (e: any) {
      setError("Import failed: " + e.message);
    } finally {
      setLoading(false);
      setImportMode('none');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerImport = (mode: 'db' | 'project') => {
    setImportMode(mode);
    fileInputRef.current?.click();
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) return;
    const code = projects.find(p => p.id === selectedProjectId)?.code || 'unknown';
    
    const confirmName = prompt(`删除项目 ${code} 及其全部关联数据（船舶、检验、意见等）。\n请输入项目代号以确认：`);
    if (confirmName !== code) {
      if (confirmName !== null) alert("代号不匹配，已取消删除。");
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      await deleteProject(selectedProjectId, secret);
      setStatusMsg(`项目 ${code} 已删除`);
      setTimeout(() => setStatusMsg(''), 4000);
      const updated = await fetchProjects();
      setProjects(updated);
      setSelectedProjectId(updated.length > 0 ? updated[0].id : '');
    } catch (e: any) {
      setError("Delete project failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', boxShadow: '0 12px 32px rgba(15,23,42,0.1)', width: 340 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--nb-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
            <h2 style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 800 }}>SQL Console</h2>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--nb-text-muted)' }}>需要输入控制台口令以继续</p>
          </div>
          {loginError && <div className="alert error" style={{ marginBottom: 12 }}>{loginError}</div>}
          <input 
            type="password" 
            placeholder="SQL_CONSOLE_SECRET 的值" 
            value={loginDraft} 
            onChange={e => setLoginDraft(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--nb-border)', borderRadius: '8px', marginBottom: '12px', fontSize: 12 }}
          />
          <button className="submitButton" onClick={handleLogin} style={{ width: '100%' }}>验证并进入</button>
        </div>
      </div>
    );
  }

  const renderTable = (results: any[]) => {
    if (!results || results.length === 0) return <div className="emptyState">No rows returned</div>;
    const columns = Object.keys(results[0]);
    return (
      <div className="tableWrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <table>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {columns.map(c => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {results.map((row, i) => (
              <tr key={i} className="record-row">
                {columns.map(c => <td key={c} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[c] === null ? <span style={{color:'#94a3b8'}}>NULL</span> : String(row[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', background: 'var(--nb-panel)', borderRadius: 12 }}>
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelect} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
            SQL Console
         </h2>
         <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
           {statusMsg && <span className="alert success" style={{ padding: '4px 10px', fontSize: 10 }}>{statusMsg}</span>}
           <button className="admin-btn" onClick={() => { window.location.href = '/admin'; }}>← Back to Admin</button>
           <button className="admin-btn" onClick={() => { sessionStorage.removeItem('sqlSecret'); setIsAuthenticated(false); setSecret(''); }}>Log out</button>
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px' }}>
        
        {/* Left Column: SQL Editor & Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: 9, fontWeight: 800, color: 'var(--nb-text-muted)', marginBottom: 4, display: 'block', letterSpacing: '0.1em' }}>EXECUTE QUERY</label>
            <textarea 
              value={sql} 
              onChange={e => setSql(e.target.value)} 
              onKeyDown={handleKeyDown}
              spellCheck={false}
              style={{ width: '100%', height: '140px', fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", "Consolas", monospace', padding: '12px', border: '1px solid var(--nb-border)', borderRadius: '8px', background: '#1e293b', color: '#e2e8f0', fontSize: 12, lineHeight: 1.6, resize: 'vertical' }}
              placeholder="SELECT * FROM users;"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--nb-text-muted)' }}>Ctrl+Enter 执行</span>
              <button className="submitButton" onClick={handleExecute} disabled={loading}>{loading ? "Executing..." : "Execute ▶"}</button>
            </div>
          </div>

          {error && <div className="alert error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}>✕</button></div>}

          {result && (
            <div style={{ border: '1px solid var(--nb-border)', borderRadius: '8px', padding: '12px', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 11, margin: 0, fontWeight: 800, color: 'var(--nb-text-muted)', letterSpacing: '0.1em' }}>RESULT</h3>
                {result.type === 'select' && <span style={{ fontSize: 10, color: 'var(--nb-text-muted)' }}>{result.results?.length ?? 0} rows</span>}
              </div>
              {result.type === 'select' ? (
                renderTable(result.results)
              ) : (
                <div style={{ fontSize: 11, fontFamily: 'monospace', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, color: '#166534' }}>
                  ✓ Changes: {result.changes}, Duration: {result.duration}ms
                  {result.last_row_id != null && `, Last Row ID: ${result.last_row_id}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Data Management */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Export Database */}
          <div style={{ border: '1px solid var(--nb-border)', borderRadius: '8px', padding: '14px', background: '#f8fafc' }}>
             <h3 style={{ fontSize: 9, margin: '0 0 10px 0', fontWeight: 800, color: 'var(--nb-text-muted)', letterSpacing: '0.1em' }}>DATABASE</h3>
             <div style={{ display: 'flex', gap: 6 }}>
               <button className="admin-btn" style={{ flex: 1, fontSize: 10 }} onClick={handleExportDb} disabled={loading}>
                 <svg style={{marginRight:4,verticalAlign:'middle'}} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                 Export
               </button>
               <button className="admin-btn" style={{ flex: 1, fontSize: 10, borderColor: '#fca5a5', color: '#991b1b' }} onClick={() => triggerImport('db')} disabled={loading}>
                 <svg style={{marginRight:4,verticalAlign:'middle'}} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                 Import
               </button>
             </div>
          </div>

          {/* Project Operations */}
          <div style={{ border: '1px solid var(--nb-border)', borderRadius: '8px', padding: '14px', background: '#f8fafc' }}>
             <h3 style={{ fontSize: 9, margin: '0 0 10px 0', fontWeight: 800, color: 'var(--nb-text-muted)', letterSpacing: '0.1em' }}>PROJECT DATA</h3>
             <select 
               className="filterSelect" 
               style={{ width: '100%', marginBottom: 10 }}
               value={selectedProjectId}
               onChange={e => setSelectedProjectId(e.target.value)}
             >
               {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
             </select>
             
             <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <button className="admin-btn" style={{ flex: 1, fontSize: 10 }} onClick={handleExportProject} disabled={loading}>
                  <svg style={{marginRight:4,verticalAlign:'middle'}} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export
                </button>
                <button className="admin-btn" style={{ flex: 1, fontSize: 10, borderColor: '#fca5a5', color: '#991b1b' }} onClick={() => triggerImport('project')} disabled={loading}>
                  <svg style={{marginRight:4,verticalAlign:'middle'}} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import
                </button>
             </div>
             <button className="admin-btn danger" style={{ width: '100%', fontSize: 10 }} onClick={handleDeleteProject} disabled={loading}>
               <svg style={{marginRight:4,verticalAlign:'middle'}} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
               Delete Project
             </button>
          </div>

          {/* Quick Reference */}
          <div style={{ border: '1px solid var(--nb-border)', borderRadius: '8px', padding: '14px', background: '#fff' }}>
             <h3 style={{ fontSize: 9, margin: '0 0 8px 0', fontWeight: 800, color: 'var(--nb-text-muted)', letterSpacing: '0.1em' }}>TABLES</h3>
             <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
               {["users","projects","ships","inspection_items","inspection_rounds","comments","ncrs","observations","observation_types","project_members"].map(t => (
                 <button key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--nb-border)', background: '#f8fafc', cursor: 'pointer', fontFamily: 'monospace' }}
                   onClick={() => setSql(`SELECT * FROM "${t}" LIMIT 20;`)}
                 >{t}</button>
               ))}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
