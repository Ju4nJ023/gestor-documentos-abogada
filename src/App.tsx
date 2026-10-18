import { useState, useMemo, useEffect } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { SearchBar } from './components/SearchBar';
import { FilterPills } from './components/FilterPills';
import { FileGrid } from './components/FileGrid';
import { FileViewerModal } from './components/FileViewerModal';
import { AutoUploader } from './components/AutoUploader';
import type { FileData, FileType } from './data/mockFiles';
import { RefreshCcw, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';

function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  const [filterOnlyReview, setFilterOnlyReview] = useState<boolean>(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<FileType | null>(null);
  const [showUploader, setShowUploader] = useState(true);

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
    fetchFiles();
    const intervalId = setInterval(fetchFiles, 2000);
    return () => clearInterval(intervalId);
  }, []);

  const handleSelectFolder = (caseName: string | null, subfolder: string | null) => {
    setSelectedCase(caseName);
    setSelectedSubfolder(subfolder);
    if (caseName !== null) {
      setFilterOnlyReview(false);
    }
  };

  const handleToggleReviewFilter = (onlyReview: boolean) => {
    setFilterOnlyReview(onlyReview);
    if (onlyReview) {
      setSelectedCase(null);
      setSelectedSubfolder(null);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await fetch(`http://localhost:3001/api/files/${fileId}`, {
        method: 'DELETE'
      });
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err) {
      console.error('Error al eliminar archivo:', err);
    }
  };

  const handleUpdateFile = (fileId: string, updatedData: Partial<FileData>) => {
    setFiles(prev => prev.map(f => (f.id === fileId ? { ...f, ...updatedData } : f)));
    fetchFiles();
  };

  const handleViewFile = (file: FileData) => {
    setViewingFile(file);
  };

  const pendingReviewCount = files.filter(f => f.status === 'needs_review').length;

  const normalizeSearchText = (text?: string) =>
    (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const filteredFiles = useMemo(() => {
    const queryClean = normalizeSearchText(searchQuery).trim();
    const queryTerms = queryClean ? queryClean.split(/\s+/).filter(Boolean) : [];

    return files.filter(file => {
      if (filterOnlyReview && file.status !== 'needs_review') return false;
      const matchesCase = selectedCase ? file.caseName === selectedCase : true;
      const matchesSubfolder = selectedSubfolder ? file.subfolder === selectedSubfolder : true;
      const matchesType = activeType ? file.type === activeType : true;

      if (queryTerms.length === 0) {
        return matchesCase && matchesSubfolder && matchesType;
      }

      const searchableContent = normalizeSearchText(
        [
          file.name,
          file.originalName,
          file.caseName,
          file.subfolder,
          file.summary,
          file.contentText,
          file.reviewReason,
          file.date
        ].join(' ')
      );

      // Todos los términos buscados deben aparecer en algún lugar del documento o su contenido
      const matchesSearch = queryTerms.every(term => searchableContent.includes(term));

      // Al escribir en el buscador, buscamos en todos los expedientes (respetando solo filtro de tipo si está activo)
      return matchesType && matchesSearch;
    });
  }, [files, selectedCase, selectedSubfolder, searchQuery, activeType, filterOnlyReview]);

  const getPageTitle = () => {
    if (searchQuery.trim() !== '') return `Resultados de búsqueda: "${searchQuery}"`;
    if (filterOnlyReview) return 'Documentos y Pruebas Pendientes de Revisar';
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
        filterOnlyReview={filterOnlyReview}
        onSelectFolder={handleSelectFolder} 
        onToggleReviewFilter={handleToggleReviewFilter}
      />
      
      <main className="main-content">
        <header className="header animate-fade-in">
          <div className="header-left">
            <h1 className="page-title">
              {getPageTitle()}
              <span className="file-count-badge">
                ({filteredFiles.length})
              </span>
            </h1>
            {pendingReviewCount > 0 && !filterOnlyReview && (
              <button 
                className="review-quick-alert-pill animate-pulse" 
                onClick={() => handleToggleReviewFilter(true)}
              >
                <AlertTriangle size={14} />
                <span>{pendingReviewCount} requieren tu revisión</span>
              </button>
            )}
          </div>

          <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: error ? '#f87171' : '#4ade80' }}>
            <RefreshCcw size={16} className={!error ? "animate-spin-slow" : ""} />
            <span style={{ fontSize: '0.85rem' }}>{error ? 'Robot Desconectado' : 'Sincronizado con disco local'}</span>
          </div>
        </header>

        {/* Buscador Principal Visible Arriba */}
        <SearchBar 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          totalMatches={filteredFiles.length}
        />

        {/* Zona de Subida y Análisis Directo */}
        <div className="uploader-section">
          <div className="uploader-toggle-header" onClick={() => setShowUploader(!showUploader)}>
            <span>Subida Directa y Clasificación Inmediata</span>
            {showUploader ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
          {showUploader && (
            <AutoUploader onUploadSuccess={fetchFiles} />
          )}
        </div>

        <div className="filter-controls-row">
          <FilterPills 
            activeType={activeType} 
            onFilterType={setActiveType} 
          />
        </div>

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

      {/* Visor de Documentos con panel de revisión */}
      {viewingFile && (
        <FileViewerModal 
          file={viewingFile} 
          onClose={() => setViewingFile(null)} 
          onUpdateFile={handleUpdateFile}
          onDeleteFile={handleDeleteFile}
        />
      )}
    </div>
  );
}

export default App;
