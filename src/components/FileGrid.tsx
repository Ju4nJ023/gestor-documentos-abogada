import React from 'react';
import { FileCard } from './FileCard';
import type { FileData } from '../data/mockFiles';
import './FileGrid.css';

interface FileGridProps {
  files: FileData[];
}

export const FileGrid: React.FC<FileGridProps> = ({ files }) => {
  if (files.length === 0) {
    return (
      <div className="empty-state animate-fade-in">
        <p>No se encontraron archivos con los filtros actuales.</p>
      </div>
    );
  }

  return (
    <div className="file-grid">
      {files.map((file, index) => (
        <FileCard key={file.id} file={file} index={index} />
      ))}
    </div>
  );
};
