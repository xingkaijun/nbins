import React, { useState, useEffect, useRef } from 'react';
import { executeSql, exportDatabase, importDatabase, exportProject, importProject, deleteProject, fetchProjects } from '../api.ts';
import jsPDF from 'jspdf';

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

  const downloadManual = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    let y = margin;
    let pageNum = 1;

    // Helper function to add page footer
    const addFooter = () => {
      const footerY = pageHeight - 15;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text('Confidential - NBINS Database Management System', margin, footerY);
      doc.text(`Page ${pageNum}`, pageWidth - margin, footerY, { align: 'right' });
      pageNum++;
    };

    // Helper function to add new page
    const addNewPage = () => {
      addFooter();
      doc.addPage();
      y = margin;
    };

    // Helper function to check if new page is needed
    const checkPageBreak = (requiredSpace: number) => {
      if (y + requiredSpace > pageHeight - 25) {
        addNewPage();
        return true;
      }
      return false;
    };

    // Helper function to add section title
    const addSectionTitle = (title: string) => {
      checkPageBreak(15);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 78, 120);
      doc.text(title, margin, y);
      y += 8;
    };

    // Helper function to add subsection title
    const addSubsectionTitle = (title: string) => {
      checkPageBreak(12);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text(title, margin, y);
      y += 6;
    };

    // Helper function to add paragraph
    const addParagraph = (text: string, indent: number = 0) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const lines = doc.splitTextToSize(text, maxWidth - indent);
      lines.forEach((line: string) => {
        checkPageBreak(5);
        doc.text(line, margin + indent, y);
        y += 5;
      });
    };

    // Helper function to add bullet point
    const addBullet = (text: string) => {
      checkPageBreak(5);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text('•', margin + 2, y);
      const lines = doc.splitTextToSize(text, maxWidth - 8);
      lines.forEach((line: string, index: number) => {
        if (index > 0) checkPageBreak(5);
        doc.text(line, margin + 8, y);
        y += 5;
      });
    };

    // Helper function to add code block
    const addCodeBlock = (code: string) => {
      checkPageBreak(10);
      doc.setFillColor(248, 250, 252);
      const codeLines = code.split('\n');
      const blockHeight = codeLines.length * 4.5 + 4;
      
      if (y + blockHeight > pageHeight - 25) {
        addNewPage();
      }
      
      doc.rect(margin, y - 2, maxWidth, blockHeight, 'F');
      doc.setFontSize(8);
      doc.setFont('courier', 'normal');
      doc.setTextColor(71, 85, 105);
      
      codeLines.forEach((line: string) => {
        doc.text(line, margin + 3, y + 2);
        y += 4.5;
      });
      y += 4;
    };

    // Helper function to add warning box
    const addWarningBox = (text: string) => {
      checkPageBreak(15);
      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(252, 211, 77);
      const lines = doc.splitTextToSize(text, maxWidth - 12);
      const boxHeight = lines.length * 5 + 6;
      
      if (y + boxHeight > pageHeight - 25) {
        addNewPage();
      }
      
      doc.rect(margin, y - 2, maxWidth, boxHeight, 'FD');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(146, 64, 14);
      doc.text('⚠️ WARNING:', margin + 4, y + 2);
      doc.setFont('helvetica', 'normal');
      y += 7;
      lines.forEach((line: string) => {
        doc.text(line, margin + 4, y);
        y += 5;
      });
      y += 3;
    };

    // ===== COVER PAGE =====
    doc.setFillColor(31, 78, 120);
    doc.rect(0, 0, pageWidth, 80, 'F');
    
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('SQL CONSOLE', pageWidth / 2, 35, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text('User Manual', pageWidth / 2, 50, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text('NBINS Database Management System', pageWidth / 2, 65, { align: 'center' });
    
    y = 100;
    
    // Version info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Version: 1.0.0', margin, y);
    y += 7;
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
    y += 7;
    doc.text('Maintained by: NBINS Development Team', margin, y);
    
    y = 140;
    doc.setDrawColor(31, 78, 120);
    doc.setLineWidth(2);
    doc.line(margin, y, pageWidth - margin, y);
    
    y += 20;
    addSectionTitle('TABLE OF CONTENTS');
    y += 3;
    
    const toc = [
      '1. Overview',
      '2. Access Methods',
      '3. Authentication',
      '4. Features',
      '5. SQL Query Operations',
      '6. Database Management',
      '7. Project Data Management',
      '8. Common Query Examples',
      '9. Important Notes'
    ];
    
    toc.forEach(item => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(item, margin + 5, y);
      y += 7;
    });

    // ===== START CONTENT =====
    addNewPage();

    // 1. OVERVIEW
    addSectionTitle('1. OVERVIEW');
    addParagraph('SQL Console is a database management tool for the NBINS system, providing direct SQL query execution, database import/export, and project data management capabilities.');
    y += 3;
    
    addSubsectionTitle('Key Features:');
    addBullet('Execute arbitrary SQL queries (SELECT, INSERT, UPDATE, DELETE, etc.)');
    addBullet('Export/Import complete database');
    addBullet('Export/Import individual project data');
    addBullet('Delete projects and associated data');
    addBullet('Quick access to common data tables');
    y += 5;

    // 2. ACCESS METHODS
    addSectionTitle('2. ACCESS METHODS');
    
    addSubsectionTitle('Method 1: From Admin Page');
    addParagraph('1. Log in to the system and navigate to the Admin page (/admin)', 3);
    addParagraph('2. Click the "SQL Console" button', 3);
    y += 3;
    
    addSubsectionTitle('Method 2: Direct Access');
    addParagraph('Direct URL: /admin/sql');
    y += 5;

    // 3. AUTHENTICATION
    addSectionTitle('3. AUTHENTICATION');
    
    addSubsectionTitle('First Access');
    addParagraph('1. The system displays a login interface requiring console password', 3);
    addParagraph('2. Enter the value of environment variable SQL_CONSOLE_SECRET', 3);
    addParagraph('3. Click "Verify and Enter" or press Enter', 3);
    y += 3;
    
    addSubsectionTitle('Password Verification');
    addBullet('Password is saved in browser\'s sessionStorage');
    addBullet('Re-entry required after closing browser tab');
    addBullet('Error message displayed if password is incorrect');
    y += 3;
    
    addSubsectionTitle('Logout');
    addParagraph('Click the "Log out" button in the top right corner to clear saved password');
    y += 5;

    // 4. FEATURES
    addSectionTitle('4. FEATURES');
    addParagraph('SQL Console interface is divided into two main areas:');
    y += 3;
    
    addSubsectionTitle('Left Area: SQL Query Editor');
    addBullet('SQL statement input box (multi-line support)');
    addBullet('Execute button');
    addBullet('Query results display area');
    y += 3;
    
    addSubsectionTitle('Right Area: Data Management Panel');
    addBullet('Database import/export');
    addBullet('Project data management');
    addBullet('Quick access to common tables');
    y += 5;

    // 5. SQL QUERY OPERATIONS
    addSectionTitle('5. SQL QUERY OPERATIONS');
    
    addSubsectionTitle('Execute Query');
    addParagraph('1. Enter SQL Statement', 3);
    addParagraph('Type SQL statement in the text box. Multi-line input is supported.', 6);
    addCodeBlock('SELECT * FROM users LIMIT 10;');
    
    addParagraph('2. Execution Methods', 3);
    addBullet('Click "Execute ▶" button');
    addBullet('Or use keyboard shortcut: Ctrl+Enter (Mac: Cmd+Enter)');
    y += 3;
    
    addParagraph('3. View Results', 3);
    addBullet('SELECT queries: Display results in table format with row count');
    addBullet('INSERT/UPDATE/DELETE: Show affected rows, execution time, last inserted row ID');
    y += 5;

    // 6. DATABASE MANAGEMENT
    addSectionTitle('6. DATABASE MANAGEMENT');
    
    addSubsectionTitle('Export Complete Database');
    addParagraph('1. Find "DATABASE" section in right panel', 3);
    addParagraph('2. Click "Export" button', 3);
    addParagraph('3. System automatically downloads JSON file: nbins-db-YYYY-MM-DD.json', 3);
    addParagraph('4. File size notification displayed after download', 3);
    y += 3;
    
    addParagraph('Export Contents:', 0);
    addBullet('Complete data from all tables');
    addBullet('Includes: users, projects, ships, inspections, observations, ncrs, etc.');
    y += 5;
    
    addSubsectionTitle('Import Complete Database');
    addWarningBox('This operation will clear and overwrite the entire database!');
    
    addParagraph('1. Click "Import" button', 3);
    addParagraph('2. Select previously exported JSON file', 3);
    addParagraph('3. System displays confirmation dialog', 3);
    addParagraph('4. Click "OK" to start import', 3);
    addParagraph('5. Success message displayed after completion', 3);
    y += 3;
    
    addParagraph('Use Cases:', 0);
    addBullet('Database migration');
    addBullet('Disaster recovery');
    addBullet('Test environment data reset');
    y += 5;

    // 7. PROJECT DATA MANAGEMENT
    addSectionTitle('7. PROJECT DATA MANAGEMENT');
    
    addSubsectionTitle('Select Project');
    addParagraph('Choose the target project from the dropdown menu in "PROJECT DATA" section.');
    addParagraph('Display format: Project Code — Project Name');
    y += 3;
    
    addSubsectionTitle('Export Project Data');
    addParagraph('1. Select target project from dropdown menu', 3);
    addParagraph('2. Click "Export" button', 3);
    addParagraph('3. System downloads JSON file: nbins-project-{code}-YYYY-MM-DD.json', 3);
    y += 3;
    
    addParagraph('Export Contents:', 0);
    addBullet('Project basic information');
    addBullet('All associated ships');
    addBullet('All inspection records');
    addBullet('All observations');
    addBullet('All NCR records');
    addBullet('Project member information');
    y += 5;
    
    addSubsectionTitle('Import Project Data');
    addWarningBox('This operation will overwrite all data for the project with the same name!');
    
    addParagraph('1. Click "Import" button', 3);
    addParagraph('2. Select previously exported project JSON file', 3);
    addParagraph('3. System identifies project code and displays confirmation', 3);
    addParagraph('4. Click "OK" to start import', 3);
    addParagraph('5. Success message displayed after completion', 3);
    y += 5;
    
    addSubsectionTitle('Delete Project');
    addWarningBox('Dangerous Operation: This action cannot be undone!');
    
    addParagraph('1. Select project to delete from dropdown menu', 3);
    addParagraph('2. Click red "Delete Project" button', 3);
    addParagraph('3. System displays input prompt requiring project code confirmation', 3);
    addParagraph('4. Enter project code (must match exactly)', 3);
    addParagraph('5. Click "OK" to execute deletion', 3);
    y += 3;
    
    addParagraph('Deletion Scope:', 0);
    addBullet('Project basic information');
    addBullet('All associated ships');
    addBullet('All inspection records and items');
    addBullet('All observations');
    addBullet('All NCR records');
    addBullet('All comments');
    addBullet('Project member relationships');
    y += 5;

    // 8. COMMON QUERY EXAMPLES
    addSectionTitle('8. COMMON QUERY EXAMPLES');
    
    addSubsectionTitle('User Management Queries');
    addParagraph('View all users:');
    addCodeBlock('SELECT * FROM users;');
    
    addParagraph('View admin users:');
    addCodeBlock("SELECT * FROM users WHERE role = 'admin';");
    
    addParagraph('Count users by role:');
    addCodeBlock('SELECT role, COUNT(*) as count\nFROM users\nGROUP BY role;');
    y += 3;
    
    addSubsectionTitle('Project Related Queries');
    addParagraph('View all projects:');
    addCodeBlock('SELECT * FROM projects;');
    
    addParagraph('View projects with ship count:');
    addCodeBlock('SELECT p.code, p.name, COUNT(s.id) as ship_count\nFROM projects p\nLEFT JOIN ships s ON p.id = s.projectId\nGROUP BY p.id;');
    y += 3;
    
    addSubsectionTitle('Observations Queries');
    addParagraph('View recent observations:');
    addCodeBlock('SELECT * FROM observations\nORDER BY createdAt DESC\nLIMIT 50;');
    
    addParagraph('View open observations only:');
    addCodeBlock("SELECT * FROM observations\nWHERE status = 'Open';");
    
    addParagraph('Count observations by status:');
    addCodeBlock('SELECT status, COUNT(*) as count\nFROM observations\nGROUP BY status;');
    y += 3;
    
    addSubsectionTitle('Statistics Queries');
    addParagraph('System overview:');
    addCodeBlock('SELECT\n  (SELECT COUNT(*) FROM users) as total_users,\n  (SELECT COUNT(*) FROM projects) as total_projects,\n  (SELECT COUNT(*) FROM ships) as total_ships,\n  (SELECT COUNT(*) FROM observations) as total_obs,\n  (SELECT COUNT(*) FROM ncrs) as total_ncrs;');
    y += 5;

    // 9. IMPORTANT NOTES
    addSectionTitle('9. IMPORTANT NOTES');
    
    addSubsectionTitle('Security');
    addBullet('Protect Password: SQL_CONSOLE_SECRET is the highest privilege credential');
    addBullet('Careful Operations: SQL Console can execute any SQL statement');
    addBullet('Regular Backups: Export database backup before important operations');
    y += 3;
    
    addSubsectionTitle('Data Operations');
    addBullet('Use Transactions: For batch modifications to ensure data consistency');
    addBullet('Test Queries: Verify conditions with SELECT before executing modifications');
    addBullet('Limit Results: Use LIMIT when querying large tables to avoid browser lag');
    y += 3;
    
    addSubsectionTitle('Performance Optimization');
    addBullet('Use Indexes: Query using indexed fields (id, projectId, shipId)');
    addBullet('Avoid Full Table Scans: Add WHERE conditions for large tables');
    addBullet('Paginated Queries: Use LIMIT and OFFSET for pagination');
    y += 3;
    
    addSubsectionTitle('Available Tables');
    addParagraph('users, projects, ships, inspection_items, inspection_rounds, comments, ncrs, observations, observation_types, project_members');
    y += 5;
    
    addSubsectionTitle('Keyboard Shortcuts');
    addBullet('Ctrl+Enter (Cmd+Enter on Mac): Execute SQL query');

    // Add footer to last page
    addFooter();

    // Save PDF
    doc.save('NBINS-SQL-Console-Manual.pdf');
    setStatusMsg('Manual downloaded successfully');
    setTimeout(() => setStatusMsg(''), 3000);
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

      {/* Common SQL Commands Reference */}
      <div style={{ border: '1px solid var(--nb-border)', borderRadius: '8px', padding: '16px', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ fontSize: 11, margin: 0, fontWeight: 800, color: 'var(--nb-text-muted)', letterSpacing: '0.1em' }}>COMMON QUERIES</h3>
          <button 
            className="admin-btn"
            onClick={downloadManual}
            style={{ fontSize: 10, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Manual Download
          </button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          
          {/* Users */}
          <div>
            <h4 style={{ fontSize: 10, margin: '0 0 6px 0', fontWeight: 700, color: '#334155' }}>Users</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT * FROM users;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                All users
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql("SELECT * FROM users WHERE role = 'admin';")}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Admin users only
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT role, COUNT(*) as count FROM users GROUP BY role;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Count by role
              </button>
            </div>
          </div>

          {/* Projects */}
          <div>
            <h4 style={{ fontSize: 10, margin: '0 0 6px 0', fontWeight: 700, color: '#334155' }}>Projects</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT * FROM projects;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                All projects
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT code, name, disciplines FROM projects;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Projects with disciplines
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT p.code, p.name, COUNT(s.id) as ship_count\nFROM projects p\nLEFT JOIN ships s ON p.id = s.projectId\nGROUP BY p.id;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Projects with ship count
              </button>
            </div>
          </div>

          {/* Ships */}
          <div>
            <h4 style={{ fontSize: 10, margin: '0 0 6px 0', fontWeight: 700, color: '#334155' }}>Ships</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT * FROM ships;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                All ships
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT s.hullNumber, s.name, COUNT(o.id) as obs_count\nFROM ships s\nLEFT JOIN observations o ON s.id = o.shipId\nGROUP BY s.id;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Ships with observation count
              </button>
            </div>
          </div>

          {/* Observations */}
          <div>
            <h4 style={{ fontSize: 10, margin: '0 0 6px 0', fontWeight: 700, color: '#334155' }}>Observations</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT * FROM observations ORDER BY createdAt DESC LIMIT 50;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Recent observations
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql("SELECT * FROM observations WHERE status = 'Open';")}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Open observations only
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT status, COUNT(*) as count FROM observations GROUP BY status;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Count by status
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT o.serialNo, o.discipline, o.location, o.content, o.status,\n  s.hullNumber, p.code as projectCode\nFROM observations o\nJOIN ships s ON o.shipId = s.id\nJOIN projects p ON s.projectId = p.id\nORDER BY o.createdAt DESC LIMIT 30;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                With ship & project info
              </button>
            </div>
          </div>

          {/* NCRs */}
          <div>
            <h4 style={{ fontSize: 10, margin: '0 0 6px 0', fontWeight: 700, color: '#334155' }}>NCRs</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT * FROM ncrs ORDER BY createdAt DESC LIMIT 50;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Recent NCRs
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT status, COUNT(*) as count FROM ncrs GROUP BY status;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Count by status
              </button>
            </div>
          </div>

          {/* Inspections */}
          <div>
            <h4 style={{ fontSize: 10, margin: '0 0 6px 0', fontWeight: 700, color: '#334155' }}>Inspections</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT * FROM inspection_rounds;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                All inspection rounds
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT * FROM inspection_items LIMIT 50;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Recent inspection items
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT status, COUNT(*) as count FROM inspection_items GROUP BY status;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Items count by status
              </button>
            </div>
          </div>

          {/* Statistics */}
          <div>
            <h4 style={{ fontSize: 10, margin: '0 0 6px 0', fontWeight: 700, color: '#334155' }}>Statistics</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT\n  (SELECT COUNT(*) FROM users) as total_users,\n  (SELECT COUNT(*) FROM projects) as total_projects,\n  (SELECT COUNT(*) FROM ships) as total_ships,\n  (SELECT COUNT(*) FROM observations) as total_observations,\n  (SELECT COUNT(*) FROM ncrs) as total_ncrs;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                System overview
              </button>
              <button 
                className="sql-example-btn"
                onClick={() => setSql('SELECT p.code, p.name,\n  COUNT(DISTINCT s.id) as ships,\n  COUNT(DISTINCT o.id) as observations,\n  COUNT(DISTINCT n.id) as ncrs\nFROM projects p\nLEFT JOIN ships s ON p.id = s.projectId\nLEFT JOIN observations o ON s.id = o.shipId\nLEFT JOIN ncrs n ON s.id = n.shipId\nGROUP BY p.id;')}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Project activity summary
              </button>
            </div>
          </div>

          {/* Disciplines */}
          <div>
            <h4 style={{ fontSize: 10, margin: '0 0 6px 0', fontWeight: 700, color: '#334155' }}>Disciplines</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button 
                className="sql-example-btn"
                onClick={() => setSql("SELECT code, name, disciplines\nFROM projects\nWHERE disciplines IS NOT NULL AND disciplines != '[]';")}
                style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, background: '#f8fafc', border: '1px solid var(--nb-border)', borderRadius: 4, cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                Project selected disciplines
              </button>
            </div>
          </div>

        </div>

        <div style={{ marginTop: 12, padding: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, fontSize: 10, color: '#92400e' }}>
          <strong>💡 Tip:</strong> Click any example to auto-fill the editor. Modify parameters and press Ctrl+Enter to execute.
        </div>
      </div>
    </div>
  );
}
