import { useState, useMemo, useEffect } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { SearchBar } from './components/SearchBar';
import { FilterPills } from './components/FilterPills';
import { FileGrid } from './components/FileGrid';
import { FileViewerModal } from './components/FileViewerModal';
import { AutoUploader } from './components/AutoUploader';
import { CloudSettingsModal } from './components/CloudSettingsModal';
import { LoginGate } from './components/LoginGate';
import { fetchFilesUnified, deleteFileUnified } from './services/cloudClient';
import type { FileData, FileType } from './data/mockFiles';
import { RefreshCcw, AlertTriangle, ChevronUp, ChevronDown, Cloud } from 'lucide-react';

function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<'local+cloud' | 'local' | 'cloud' | 'offline'>('local');
  const [cloudConfigured, setCloudConfigured] = useState<boolean>(false);
  const [showCloudModal, setShowCloudModal] = useState<boolean>(false);
  
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  const [filterOnlyReview, setFilterOnlyReview] = useState<boolean>(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<FileType | null>(null);
  const [showUploader, setShowUploader] = useState(true);

  const [viewingFile, setViewingFile] = useState<FileData | null>(null);

  // Obtener archivos desde el Robot Local o desde Supabase en la Nube
  const fetchFiles = async () => {
    try {
      const result = await fetchFilesUnified();
      setFiles(result.files);
      setConnectionMode(result.mode);
      setCloudConfigured(result.cloudConfigured);
      setError(null);
    } catch (err: any) {
      setConnectionMode('offline');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll for changes every 2.5 seconds
  useEffect(() => {
    fetchFiles();
    const intervalId = setInterval(fetchFiles, 2500);
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
      const target = files.find(f => f.id === fileId);
      if (target) {
        await deleteFileUnified(target);
      }
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

  const getConnectionLabel = () => {
    if (error) return 'Sin conexión (Configura Nube o enciende Robot)';
    if (connectionMode === 'local+cloud') return 'Híbrido: PC + Nube Sincronizados';
    if (connectionMode === 'cloud') return 'Conectado a Nube (Acceso Remoto)';
    return 'Sincronizado con PC Local';
  };

  return (
    <LoginGate>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowCloudModal(true)}
                title="Configurar acceso en la Nube (Supabase + Contraseña)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: cloudConfigured ? 'rgba(34, 197, 94, 0.14)' : 'rgba(59, 130, 246, 0.16)',
                  border: cloudConfigured ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
                  color: cloudConfigured ? '#4ade80' : '#60a5fa',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Cloud size={15} />
                <span>{cloudConfigured ? 'Nube Activa' : 'Conectar Nube'}</span>
              </button>

              <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: error ? '#f87171' : '#4ade80' }}>
                <RefreshCcw size={16} className={!error ? "animate-spin-slow" : ""} />
                <span style={{ fontSize: '0.85rem' }}>{getConnectionLabel()}</span>
              </div>
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

        {/* Modal de Configuración de Nube Híbrida (Supabase + Contraseña) */}
        {showCloudModal && (
          <CloudSettingsModal
            onClose={() => setShowCloudModal(false)}
            onConfigSaved={fetchFiles}
          />
        )}
      </div>
    </LoginGate>
  );
}

export default App;

