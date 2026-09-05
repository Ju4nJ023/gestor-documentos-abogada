import React, { useState } from 'react';
import { Briefcase, Folder, ChevronDown, ChevronRight, FolderClosed } from 'lucide-react';
import './Sidebar.css';
import type { FileData } from '../data/mockFiles';

interface SidebarProps {
  files: FileData[];
  selectedCase: string | null;
  selectedSubfolder: string | null;
  onSelectFolder: (caseName: string | null, subfolder: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ files, selectedCase, selectedSubfolder, onSelectFolder }) => {
  const [expandedCases, setExpandedCases] = useState<Record<string, boolean>>({});

  // Obtener casos únicos
  const uniqueCases = Array.from(new Set(files.map(f => f.caseName)));

  const toggleCase = (caseName: string) => {
    setExpandedCases(prev => ({
      ...prev,
      [caseName]: !prev[caseName]
    }));
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Briefcase className="logo-icon" size={32} />
        <h2 className="logo-text">Lex<span>Vault</span></h2>
      </div>
      
      <nav className="sidebar-nav">
        <div 
          className={`nav-item ${selectedCase === null ? 'active' : ''}`}
          onClick={() => onSelectFolder(null, null)}
        >
          <FolderClosed size={20} />
          <span>Todos los Archivos</span>
        </div>
        
        <div className="nav-divider"></div>
        <div className="nav-subtitle">MIS CASOS</div>
        
        <div className="cases-list">
          {uniqueCases.map(caseName => {
            const isExpanded = expandedCases[caseName];
            // Obtener subcarpetas únicas para este caso
            const caseSubfolders = Array.from(new Set(files.filter(f => f.caseName === caseName).map(f => f.subfolder)));

            return (
              <div key={caseName} className="case-group">
                <div 
                  className={`nav-item case-header ${selectedCase === caseName && !selectedSubfolder ? 'active' : ''}`}
                  onClick={() => {
                    toggleCase(caseName);
                    onSelectFolder(caseName, null);
                  }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Folder size={18} className="case-icon" />
                  <span>{caseName}</span>
                </div>
                
                {isExpanded && (
                  <div className="subfolders-list">
                    {caseSubfolders.map(sub => (
                      <div 
                        key={sub}
                        className={`nav-item subfolder-item ${selectedCase === caseName && selectedSubfolder === sub ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectFolder(caseName, sub);
                        }}
                      >
                        <div className="tree-line"></div>
                        <FolderClosed size={16} />
                        <span>{sub}</span>
                      </div>
                    ))}
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
