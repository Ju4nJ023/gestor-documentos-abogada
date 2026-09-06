import React, { useState } from 'react';
import { FileText, Video, FileImage, FileAudio, File, Eye, MoreVertical, Trash2 } from 'lucide-react';
import './FileCard.css';
import type { FileData } from '../data/mockFiles';

interface FileCardProps {
  file: FileData;
  index: number;
  onView: (file: FileData) => void;
  onDelete: (fileId: string) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ file, index, onView, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);

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

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(file.id);
    setShowMenu(false);
  };

  return (
    <div 
      className="file-card animate-fade-in" 
      style={{ animationDelay: `${0.1 + index * 0.05}s` }}
      onClick={() => onView(file)}
    >
      <div className="file-card-header">
        <div className="icon-container">
          {getFileIcon()}
        </div>
        
        <div className="action-menu-container">
          <button className="action-button" onClick={toggleMenu}>
            <MoreVertical size={16} />
          </button>
          
          {showMenu && (
            <div className="dropdown-menu">
              <button className="dropdown-item text-danger" onClick={handleDelete}>
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
          )}
        </div>
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
        <button className="download-btn" onClick={(e) => { e.stopPropagation(); onView(file); }}>
          <Eye size={16} /> Abrir Documento
        </button>
      </div>
    </div>
  );
};
