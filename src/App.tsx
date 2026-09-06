import React, { useState, useMemo } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { SearchBar } from './components/SearchBar';
import { FilterPills } from './components/FilterPills';
import { FileGrid } from './components/FileGrid';
import { AutoUploader } from './components/AutoUploader';
import { FileViewerModal } from './components/FileViewerModal';
import { initialFiles } from './data/mockFiles';
import type { FileData, FileType } from './data/mockFiles';

function App() {
  const [files, setFiles] = useState<FileData[]>(initialFiles);
  
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<FileType | null>(null);

  const [viewingFile, setViewingFile] = useState<FileData | null>(null);

  const handleSelectFolder = (caseName: string | null, subfolder: string | null) => {
    setSelectedCase(caseName);
    setSelectedSubfolder(subfolder);
  };

  const handleAutoSortComplete = (newFile: FileData) => {
    setFiles(prev => [newFile, ...prev]);
  };

  const handleDeleteFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
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
            <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>({filteredFiles.length})</span>
          </h1>
        </header>

        <AutoUploader onAutoSortComplete={handleAutoSortComplete} />

        <SearchBar 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
        />

        <FilterPills 
          activeType={activeType} 
          onFilterType={setActiveType} 
        />

        <FileGrid 
          files={filteredFiles} 
          onView={handleViewFile}
          onDelete={handleDeleteFile}
        />
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
