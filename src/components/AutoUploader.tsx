import React, { useState } from 'react';
import { UploadCloud, CheckCircle, FileText, Loader2 } from 'lucide-react';
import './AutoUploader.css';

interface AutoUploaderProps {
  onAutoSortComplete: (newFile: any) => void;
}

export const AutoUploader: React.FC<AutoUploaderProps> = ({ onAutoSortComplete }) => {
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'success'>('idle');
  const [log, setLog] = useState<string>('');

  const simulateUpload = () => {
    setStatus('analyzing');
    setLog('Subiendo y leyendo documento con IA...');
    
    // Simulate steps
    setTimeout(() => {
      setLog('Detectando nombres y contexto... Parece ser del Caso Ruiz');
      
      setTimeout(() => {
        setLog('Clasificando en "Caso Ruiz > Pruebas"');
        
        setTimeout(() => {
          setStatus('success');
          onAutoSortComplete({
            id: Math.random().toString(),
            name: 'Video_Interrogatorio_Ruiz.mp4',
            type: 'video',
            caseName: 'Caso Ruiz',
            subfolder: 'Pruebas',
            size: '25 MB',
            date: new Date().toISOString().split('T')[0],
          });

          // Reset after a bit
          setTimeout(() => {
            setStatus('idle');
            setLog('');
          }, 4000);

        }, 1500);
      }, 1500);
    }, 1500);
  };

  return (
    <div className={`auto-uploader ${status !== 'idle' ? 'active' : ''}`} onClick={status === 'idle' ? simulateUpload : undefined}>
      {status === 'idle' && (
        <div className="uploader-content">
          <UploadCloud size={48} className="upload-icon" />
          <h3>Arrastra un archivo aquí o haz clic</h3>
          <p>El sistema lo leerá y lo guardará en su caso correspondiente automáticamente.</p>
        </div>
      )}

      {status === 'analyzing' && (
        <div className="uploader-content analyzing">
          <Loader2 size={48} className="spinner" />
          <h3>Clasificación Inteligente en curso...</h3>
          <p className="log-text animate-pulse">{log}</p>
        </div>
      )}

      {status === 'success' && (
        <div className="uploader-content success">
          <CheckCircle size={48} className="success-icon" />
          <h3>¡Clasificado y Guardado!</h3>
          <p className="log-text">El archivo se ha organizado automáticamente.</p>
        </div>
      )}
    </div>
  );
};
