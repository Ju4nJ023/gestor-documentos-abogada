import React, { useState, useEffect } from 'react';
import { Briefcase, Folder, ChevronDown, ChevronRight, FolderClosed, AlertTriangle, Plus, Check, X } from 'lucide-react';
import './Sidebar.css';
import type { FileData } from '../data/mockFiles';

interface SidebarProps {
  files: FileData[];
  selectedCase: string | null;
  selectedSubfolder: string | null;
  filterOnlyReview: boolean;
  onSelectFolder: (caseName: string | null, subfolder: string | null) => void;
  onToggleReviewFilter: (onlyReview: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  files, 
  selectedCase, 
  selectedSubfolder, 
  filterOnlyReview,
  onSelectFolder,
  onToggleReviewFilter
}) => {
  const [expandedCases, setExpandedCases] = useState<Record<string, boolean>>({});
  const [diskCases, setDiskCases] = useState<string[]>([]);
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');

  // Cargar carpetas de casos desde el disco (incluso si están vacías)
  const fetchDiskCases = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/cases');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setDiskCases(data);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchDiskCases();
  }, [files.length]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseName.trim()) return;
    try {
      const res = await fetch('http://localhost:3001/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseName: newCaseName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchDiskCases();
        setNewCaseName('');
        setIsCreatingCase(false);
        if (data.caseName) {
          onToggleReviewFilter(false);
          onSelectFolder(data.caseName, null);
        }
      }
    } catch (_) {}
  };

  // Contar cuántos archivos requieren revisión
  const pendingReviewCount = files.filter(f => f.status === 'needs_review').length;

  // Obtener casos únicos (uniendo carpetas en disco + archivos)
  const uniqueCases = Array.from(new Set([...diskCases, ...files.map(f => f.caseName)])).sort();

  const toggleCase = (caseName: string) => {
    setExpandedCases(prev => ({
      ...prev,
      [caseName]: !prev[caseName]
    }));
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Briefcase className="logo-icon" size={30} />
        <h2 className="logo-text">Lex<span>Vault</span></h2>
      </div>
      
      <nav className="sidebar-nav">
        {/* Todos los archivos */}
        <div 
          className={`nav-item ${selectedCase === null && !filterOnlyReview ? 'active' : ''}`}
          onClick={() => {
            onToggleReviewFilter(false);
            onSelectFolder(null, null);
          }}
        >
          <FolderClosed size={18} />
          <span>Todos los Archivos</span>
          <span className="sidebar-count-badge neutral">{files.length}</span>
        </div>

        {/* Acceso directo: Pendientes de Revisar */}
        <div 
          className={`nav-item nav-review-item ${filterOnlyReview ? 'active' : ''}`}
          onClick={() => onToggleReviewFilter(true)}
        >
          <AlertTriangle size={18} className="review-icon-sidebar" />
          <span>Pendientes de Revisar</span>
          {pendingReviewCount > 0 ? (
            <span className="sidebar-count-badge warning">{pendingReviewCount}</span>
          ) : (
            <span className="sidebar-count-badge success">0</span>
          )}
        </div>
        
        <div className="nav-divider"></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '12px', marginBottom: '6px' }}>
          <div className="nav-subtitle" style={{ marginBottom: 0 }}>EXPEDIENTES Y CASOS</div>
          <button
            type="button"
            onClick={() => setIsCreatingCase(!isCreatingCase)}
            title="Crear carpeta para un nuevo cliente/caso"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(59, 130, 246, 0.18)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60a5fa',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Plus size={12} /> Nuevo Caso
          </button>
        </div>

        {isCreatingCase && (
          <form onSubmit={handleCreateCase} style={{ padding: '4px 12px 10px 12px', display: 'flex', gap: '6px' }}>
            <input
              type="text"
              value={newCaseName}
              onChange={e => setNewCaseName(e.target.value)}
              placeholder="Ej: Caso Ramírez..."
              autoFocus
              style={{
                flex: 1,
                minWidth: 0,
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#f8fafc',
                fontSize: '0.8rem'
              }}
            />
            <button
              type="submit"
              title="Guardar caso"
              style={{
                background: '#2563eb',
                border: 'none',
                color: '#fff',
                borderRadius: '6px',
                padding: '6px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => { setIsCreatingCase(false); setNewCaseName(''); }}
              title="Cancelar"
              style={{
                background: 'rgba(148, 163, 184, 0.15)',
                border: 'none',
                color: '#94a3b8',
                borderRadius: '6px',
                padding: '6px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={14} />
            </button>
          </form>
        )}
        
        <div className="cases-list">
          {uniqueCases.map(caseName => {
            const isExpanded = expandedCases[caseName] ?? true; // Abierto por defecto
            const caseFiles = files.filter(f => f.caseName === caseName);
            const caseReviewCount = caseFiles.filter(f => f.status === 'needs_review').length;
            const caseSubfolders = Array.from(new Set(caseFiles.map(f => f.subfolder)));

            return (
              <div key={caseName} className="case-group">
                <div 
                  className={`nav-item case-header ${selectedCase === caseName && !selectedSubfolder && !filterOnlyReview ? 'active' : ''}`}
                  onClick={() => {
                    toggleCase(caseName);
                    onToggleReviewFilter(false);
                    onSelectFolder(caseName, null);
                  }}
                >
                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <Folder size={17} className="case-icon" />
                  <span className="case-title-text">{caseName}</span>
                  {caseReviewCount > 0 ? (
                    <span className="sidebar-count-badge warning-mini" title={`${caseReviewCount} pendientes de revisión`}>
                      {caseReviewCount}
                    </span>
                  ) : (
                    <span className="sidebar-count-badge neutral-mini">{caseFiles.length}</span>
                  )}
                </div>
                
                {isExpanded && (
                  <div className="subfolders-list">
                    {caseSubfolders.map(sub => {
                      const subFiles = caseFiles.filter(f => f.subfolder === sub);
                      const subReviewCount = subFiles.filter(f => f.status === 'needs_review').length;

                      return (
                        <div 
                          key={sub}
                          className={`nav-item subfolder-item ${selectedCase === caseName && selectedSubfolder === sub && !filterOnlyReview ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleReviewFilter(false);
                            onSelectFolder(caseName, sub);
                          }}
                        >
                          <div className="tree-line"></div>
                          <FolderClosed size={15} />
                          <span className="subfolder-text">{sub}</span>
                          {subReviewCount > 0 && (
                            <span className="sidebar-count-badge warning-mini">{subReviewCount}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
};
