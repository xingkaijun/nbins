import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjects, fetchShips } from '../api';

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchProjects(), fetchShips()])
      .then(([projectsData, shipsData]) => {
        if (projectsData) {
          // 统计每个项目的船只数量
          const shipCountByProject = shipsData.reduce((acc: Record<string, number>, ship: any) => {
            acc[ship.projectId] = (acc[ship.projectId] || 0) + 1;
            return acc;
          }, {});

          setProjects(projectsData.map((p: any) => ({
             id: p.id,
             name: p.name,
             code: p.code,
             hulls: shipCountByProject[p.id] || 0,
             active: p.status === 'active'
          })));
        }
      })
      .catch(err => console.error('Failed to fetch projects:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <main className="workspace"><section className="hero"><div><h2>LOADING PROJECTS...</h2></div></section></main>;
  }

  return (
    <main className="workspace">
      <section className="hero" style={{ paddingBottom: '24px' }}>
        <div>
          <p className="eyebrow">GLOBAL SCOPE</p>
          <h2>PROJECTS / ACTIVATION HALL</h2>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {projects.map(project => (
          <article 
            key={project.id}
            onClick={() => {
                if(project.active) {
                    navigate('/dashboard');
                }
            }}
            style={{
              padding: '24px',
              border: `1px solid ${project.active ? 'var(--nb-border)' : 'rgba(148, 163, 184, 0.2)'}`,
              borderRadius: '16px',
              backgroundColor: project.active ? '#fff' : '#f8fafc',
              cursor: project.active ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              boxShadow: project.active ? '0 4px 12px rgba(0,0,0,0.03)' : 'none',
              opacity: project.active ? 1 : 0.6
            }}
            onMouseOver={(e) => {
              if (project.active) {
                e.currentTarget.style.borderColor = 'var(--nb-primary)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseOut={(e) => {
              if (project.active) {
                e.currentTarget.style.borderColor = 'var(--nb-border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, padding: '4px 8px', borderRadius: '4px', background: project.active ? '#0f766e15' : '#e2e8f0', color: project.active ? 'var(--nb-primary)' : 'var(--nb-text-muted)' }}>
                {project.code}
              </span>
              {!project.active && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--nb-text-muted)' }}>ARCHIVED</span>}
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: 'var(--nb-text)', letterSpacing: '-0.02em' }}>{project.name}</h3>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--nb-text-muted)', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--nb-text-muted)' }}></span>
                {project.hulls} HULLS IN FLEET
              </span>
            </div>
            
            {project.active && (
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--nb-border)' }}>
                 <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: 'var(--nb-primary)', display: 'flex', justifyContent: 'space-between' }}>
                   <span>ENTER WORKSPACE</span>
                   <span>→</span>
                 </p>
              </div>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
