import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import './AutoUploader.css';
import { uploadFilesUnified } from '../services/cloudClient';

interface AutoUploaderProps {
  onUploadSuccess: () => void;
}

export const AutoUploader: React.FC<AutoUploaderProps> = ({ onUploadSuccess }) => {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'success' | 'error'>('idle');
  const [log, setLog] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setStatus('uploading');
    setLog(`Subiendo ${files.length} archivo(s)...`);

    try {
      setStatus('analyzing');
      setLog('Leyendo documentos, analizando pruebas y sincronizando con el despacho...');

      await uploadFilesUnified(files);

      setStatus('success');
      setLog('¡Archivos analizados, clasificados y sincronizados con éxito!');
      onUploadSuccess();

      setTimeout(() => {
        setStatus('idle');
        setLog('');
      }, 3500);
    } catch (err: any) {
      setStatus('error');
      setLog(err.message || 'Error al subir los archivos');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div 
      className={`auto-uploader ${isDragOver ? 'drag-over' : ''} ${status !== 'idle' ? 'active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => status === 'idle' && fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        multiple 
        onChange={e => handleFiles(e.target.files)} 
      />

      {status === 'idle' && (
        <div className="uploader-content">
          <UploadCloud size={40} className="upload-icon" />
          <div className="uploader-text">
            <h4>Arrastra aquí cualquier PDF, prueba en vídeo, audio o documento</h4>
            <p>La IA extraerá el texto, asignará el caso correspondiente y lo renombrará automáticamente.</p>
          </div>
        </div>
      )}

      {(status === 'uploading' || status === 'analyzing') && (
        <div className="uploader-content analyzing">
          <Loader2 size={36} className="spinner" />
          <div className="uploader-text">
            <h4>Analizando y Organizando con IA...</h4>
            <p className="log-text animate-pulse">{log}</p>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="uploader-content success">
          <CheckCircle size={36} className="success-icon" />
          <div className="uploader-text">
            <h4>¡Documentos Procesados!</h4>
            <p className="log-text">{log}</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="uploader-content error">
          <AlertCircle size={36} className="error-icon" />
          <div className="uploader-text">
            <h4>Hubo un inconveniente</h4>
            <p className="log-text">{log}</p>
          </div>
        </div>
      )}
    </div>
  );
};
