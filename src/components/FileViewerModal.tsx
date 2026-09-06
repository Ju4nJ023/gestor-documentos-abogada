import React from 'react';
import { X, Download, FileText, Video, FileImage, FileAudio, File } from 'lucide-react';
import './FileViewerModal.css';
import { FileData } from '../data/mockFiles';

interface FileViewerModalProps {
  file: FileData;
  onClose: () => void;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({ file, onClose }) => {
  // Simular renderizado según el tipo de archivo
  const renderContent = () => {
    switch (file.type) {
      case 'pdf':
      case 'word':
        return (
          <div className="simulated-document">
            <div className="doc-header">
              <h2>{file.name}</h2>
              <p className="doc-meta">Documento Legal - {file.date}</p>
            </div>
            <div className="doc-body">
              <p>Este es un visor simulado. En la aplicación final, aquí se visualizará directamente el documento real utilizando un visor de PDFs embebido.</p>
              <br/>
              <p><strong>Partes implicadas:</strong> Referencia a {file.caseName}</p>
              <p><strong>Clasificación:</strong> {file.subfolder}</p>
              <br/>
              <div className="skeleton-text"></div>
              <div className="skeleton-text"></div>
              <div className="skeleton-text short"></div>
            </div>
          </div>
        );
      case 'video':
      case 'audio':
        return (
          <div className="simulated-media">
            <div className="media-player">
              <div className="play-button">▶</div>
            </div>
            <p className="media-caption">Reproductor multimedia simulado para {file.name}</p>
          </div>
        );
      case 'image':
        return (
          <div className="simulated-image">
            <FileImage size={64} className="placeholder-icon" />
            <p>Previsualización de Imagen</p>
          </div>
        );
      default:
        return (
          <div className="simulated-generic">
            <File size={64} className="placeholder-icon" />
            <p>Vista previa no disponible para este tipo de archivo.</p>
          </div>
        );
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        
        <header className="modal-header">
          <div className="modal-title">
            <h3>{file.name}</h3>
            <span className="modal-subtitle">{file.caseName} / {file.subfolder}</span>
          </div>
          
          <div className="modal-actions">
            <button className="btn-secondary" title="Descargar">
              <Download size={18} />
              <span>Descargar</span>
            </button>
            <button className="btn-close" onClick={onClose} title="Cerrar">
              <X size={24} />
            </button>
          </div>
        </header>
        
        <div className="modal-body">
          {renderContent()}
        </div>
        
      </div>
    </div>
  );
};
