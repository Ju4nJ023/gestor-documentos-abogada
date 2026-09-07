import React, { useState, useMemo, useEffect } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { SearchBar } from './components/SearchBar';
import { FilterPills } from './components/FilterPills';
import { FileGrid } from './components/FileGrid';
import { FileViewerModal } from './components/FileViewerModal';
import type { FileData, FileType } from './data/mockFiles';
import { RefreshCcw } from 'lucide-react';

function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<FileType | null>(null);

  const [viewingFile, setViewingFile] = useState<FileData | null>(null);

  // Fetch real files from our Backend Robot
  const fetchFiles = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/files');
      if (!response.ok) throw new Error('Error al conectar con el Robot Backend');
      const data = await response.json();
      setFiles(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll for changes every 2 seconds
  useEffect(() => {
    fetchFiles(); // Initial fetch
    const intervalId = setInterval(fetchFiles, 2000);
    return () => clearInterval(intervalId);
  }, []);

  const handleSelectFolder = (caseName: string | null, subfolder: string | null) => {
    setSelectedCase(caseName);
    setSelectedSubfolder(subfolder);
  };

  const handleDeleteFile = (fileId: string) => {
    // Optimistic delete UI
    setFiles(prev => prev.filter(f => f.id !== fileId));
    // En la vida real, aquí haríamos un fetch DELETE a /api/files/:id
  };

  const handleViewFile = (file: FileData) => {
    setViewingFile(file);
  };

  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const matchesCase = selectedCase ? file.caseName === selectedCase : true;
      const matchesSubfolder = selectedSubfolder ? file.subfolder === selectedSubfolder : true;
      const matchesType = activeType ? file.type === activeType : true;
      
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = file.name.toLowerCase().includes(searchLower) || 
                            file.caseName.toLowerCase().includes(searchLower) ||
                            file.subfolder.toLowerCase().includes(searchLower);
      
      return matchesCase && matchesSubfolder && matchesType && matchesSearch;
    });
  }, [files, selectedCase, selectedSubfolder, searchQuery, activeType]);

  const getPageTitle = () => {
    if (!selectedCase) return 'Todos los Archivos';
    if (selectedCase && !selectedSubfolder) return selectedCase;
    return `${selectedCase} / ${selectedSubfolder}`;
  };

  return (
    <div className="app-container">
      <Sidebar 
        files={files}
        selectedCase={selectedCase}
        selectedSubfolder={selectedSubfolder}
        onSelectFolder={handleSelectFolder} 
      />
      
      <main className="main-content">
        <header className="header animate-fade-in">
          <h1 className="page-title">
            {getPageTitle()}
            <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px' }}>
              ({filteredFiles.length})
            </span>
          </h1>
          <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: error ? '#f87171' : '#4ade80' }}>
            <RefreshCcw size={16} className={!error ? "animate-spin-slow" : ""} />
            <span style={{ fontSize: '0.85rem' }}>{error ? 'Robot Desconectado' : 'Sincronizado con disco local'}</span>
          </div>
        </header>

        <SearchBar 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
        />

        <FilterPills 
          activeType={activeType} 
          onFilterType={setActiveType} 
        />

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando documentos reales...</div>
        ) : (
          <FileGrid 
            files={filteredFiles} 
            onView={handleViewFile}
            onDelete={handleDeleteFile}
          />
        )}
      </main>

      {/* Visor de Documentos */}
      {viewingFile && (
        <FileViewerModal 
          file={viewingFile} 
          onClose={() => setViewingFile(null)} 
        />
      )}
    </div>
  );
}

export default App;
