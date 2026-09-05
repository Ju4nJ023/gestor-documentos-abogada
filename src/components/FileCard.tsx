import React from 'react';
import { FileText, Video, FileImage, FileAudio, File, Download, MoreVertical } from 'lucide-react';
import './FileCard.css';
import type { FileData } from '../data/mockFiles';

interface FileCardProps {
  file: FileData;
  index: number;
}

export const FileCard: React.FC<FileCardProps> = ({ file, index }) => {
  const getFileIcon = () => {
    switch (file.type) {
      case 'pdf': return <FileText className="file-icon pdf-icon" size={32} />;
      case 'video': return <Video className="file-icon video-icon" size={32} />;
      case 'word': return <FileText className="file-icon word-icon" size={32} />;
      case 'image': return <FileImage className="file-icon image-icon" size={32} />;
      case 'audio': return <FileAudio className="file-icon audio-icon" size={32} />;
      default: return <File className="file-icon default-icon" size={32} />;
    }
  };

  return (
    <div 
      className="file-card animate-fade-in" 
      style={{ animationDelay: `${0.1 + index * 0.05}s` }}
    >
      <div className="file-card-header">
        <div className="icon-container">
          {getFileIcon()}
        </div>
        <button className="action-button">
          <MoreVertical size={16} />
        </button>
      </div>
      
      <div className="file-info">
        <h3 className="file-name" title={file.name}>{file.name}</h3>
        <p className="file-category">{file.caseName} / {file.subfolder}</p>
      </div>
      
      <div className="file-meta">
        <span className="file-date">{file.date}</span>
        <span className="file-size">{file.size}</span>
      </div>
      
      <div className="file-card-overlay">
        <button className="download-btn">
          <Download size={16} /> Abrir Documento
        </button>
      </div>
    </div>
  );
};
