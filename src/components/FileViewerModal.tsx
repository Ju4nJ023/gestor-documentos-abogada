import React, { useState, useEffect } from 'react';
import { 
  X, FileText, FileAudio, 
  CheckCircle2, AlertTriangle, Trash2, Edit3, Sparkles, Search, FolderOpen, ExternalLink
} from 'lucide-react';
import './FileViewerModal.css';
import type { FileData } from '../data/mockFiles';
import {
  fetchCasesUnified,
  reviewFileUnified,
  deleteFileUnified
} from '../services/cloudClient';

interface FileViewerModalProps {
  file: FileData;
  onClose: () => void;
  onUpdateFile: (fileId: string, updatedData: Partial<FileData>) => void;
  onDeleteFile: (fileId: string) => void;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({ 
  file, 
  onClose, 
  onUpdateFile, 
  onDeleteFile 
}) => {
  const [editedName, setEditedName] = useState(file.name);
  const [editedCase, setEditedCase] = useState(file.caseName);
  const [editedSubfolder, setEditedSubfolder] = useState(file.subfolder);
  const [availableCases, setAvailableCases] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState('');

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // URL real del backend local o URL pública de Supabase Storage cuando se accede desde la Nube
  const viewUrl =
    !isLocalhost && file.publicUrl
      ? file.publicUrl
      : file.publicUrl && !file.id
      ? file.publicUrl
      : `http://localhost:3001/api/files/${file.id}/view`;

  const handleOpenInWindows = async () => {
    if (!isLocalhost && file.publicUrl) {
      window.open(file.publicUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const res = await fetch(`http://localhost:3001/api/files/${file.id}/open`, { method: 'POST' });
      if (!res.ok && file.publicUrl) {
        window.open(file.publicUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      if (file.publicUrl) {
        window.open(file.publicUrl, '_blank', 'noopener,noreferrer');
      } else {
        setErrorMsg('No se pudo abrir el archivo en Windows');
      }
    }
  };

  const handleRevealInFolder = async () => {
    try {
      await fetch(`http://localhost:3001/api/files/${file.id}/reveal`, { method: 'POST' });
    } catch (err: any) {
      setErrorMsg('Solo disponible cuando estás en el ordenador del despacho');
    }
  };

  // Cargar lista de casos existentes para el desplegable (Local o Nube)
  useEffect(() => {
    fetchCasesUnified()
      .then(data => {
        if (Array.isArray(data)) {
          setAvailableCases(data);
        }
      })
      .catch(() => {});
  }, []);

  // Guardar y validar cambios
  const handleSaveAndApprove = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const resData = await reviewFileUnified(file.id, {
        newName: editedName,
        caseName: editedCase,
        subfolder: editedSubfolder,
        status: 'reviewed'
      });

      onUpdateFile(file.id, {
        id: resData.file?.id || file.id,
        name: resData.file?.name || editedName,
        caseName: resData.file?.caseName || editedCase,
        subfolder: resData.file?.subfolder || editedSubfolder,
        status: 'reviewed',
        reviewReason: 'Revisado y validado por la letrada'
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFileUnified(file);
      onDeleteFile(file.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al eliminar');
    }
  };

  const renderViewer = () => {
    switch (file.type) {
      case 'pdf':
        return (
          <div className="pdf-viewer-wrapper">
            <iframe 
              src={`${viewUrl}#toolbar=1&navpanes=0`} 
              title={file.name} 
              className="embedded-pdf-frame" 
            />
          </div>
        );
      case 'video':
        return (
          <div className="media-viewer-container">
            <video 
              controls 
              className="embedded-video-player"
              src={viewUrl}
              preload="metadata"
            >
              Tu navegador no soporta reproducción de vídeo HTML5.
            </video>
          </div>
        );
      case 'audio':
        return (
          <div className="audio-viewer-container">
            <div className="audio-icon-box">
              <FileAudio size={64} className="audio-hero-icon" />
            </div>
            <p className="audio-filename">{file.name}</p>
            <audio controls className="embedded-audio-player" src={viewUrl}>
              Tu navegador no soporta reproducción de audio HTML5.
            </audio>
          </div>
        );
      case 'image':
        return (
          <div className="image-viewer-container">
            <img src={viewUrl} alt={file.name} className="embedded-image-preview" />
          </div>
        );
      case 'word':
      default: {
        const readableText = file.contentText || file.summary || '';
        return (
          <div className="word-viewer-fallback" style={{ alignItems: 'stretch', textAlign: 'left', padding: '24px', justifyContent: 'flex-start', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={28} className="doc-icon-fallback" style={{ margin: 0 }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Vista de Texto Extraído ({file.type.toUpperCase()})</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lectura directa del contenido del documento</span>
                </div>
              </div>
              <button type="button" onClick={handleOpenInWindows} className="btn-primary-action" style={{ padding: '8px 14px', fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}>
                <ExternalLink size={16} />
                Abrir en Word (Directo)
              </button>
            </div>

            {/* Buscador dentro del documento */}
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#60a5fa' }} />
              <input
                type="text"
                value={docSearch}
                onChange={e => setDocSearch(e.target.value)}
                placeholder="Buscar palabra o dato dentro de este documento..."
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '8px',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#f8fafc',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '10px',
                padding: '18px',
                color: '#e2e8f0',
                fontSize: '0.95rem',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                flex: 1,
                overflowY: 'auto'
              }}
            >
              {readableText ? (
                docSearch.trim() ? (
                  readableText.split(new RegExp(`(${docSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                    part.toLowerCase() === docSearch.trim().toLowerCase() ? (
                      <mark key={i} style={{ background: '#facc15', color: '#0f172a', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>
                        {part}
                      </mark>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )
                ) : (
                  readableText
                )
              ) : (
                'No hay texto extraído disponible para este archivo.'
              )}
            </div>
          </div>
        );
      }
    }
  };

  const isNeedsReview = file.status === 'needs_review';

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal-content review-modal-layout" onClick={e => e.stopPropagation()}>
        
        {/* Cabecera del Visor */}
        <header className="modal-header">
          <div className="modal-title-group">
            <div className="title-with-badge">
              <h3>{file.name}</h3>
              {isNeedsReview ? (
                <span className="badge badge-warning animate-pulse">
                  <AlertTriangle size={13} /> Requiere Revisión
                </span>
              ) : (
                <span className="badge badge-success">
                  <CheckCircle2 size={13} /> Revisado
                </span>
              )}
            </div>
            <span className="modal-subtitle">
              {file.caseName} • {file.subfolder} • {file.size} • {file.date}
            </span>
          </div>
          
          <div className="modal-actions">
            <button 
              type="button"
              onClick={handleRevealInFolder} 
              className="btn-secondary" 
              title="Ver archivo en el Explorador de Windows"
              style={{ cursor: 'pointer' }}
            >
              <FolderOpen size={18} />
              <span>Ver en Carpeta</span>
            </button>

            <button 
              type="button"
              onClick={handleOpenInWindows} 
              className="btn-secondary" 
              title="Abrir directamente en el programa de Windows (Word / Acrobat)"
              style={{ cursor: 'pointer' }}
            >
              <ExternalLink size={18} />
              <span>Abrir en Windows</span>
            </button>

            {!showDeleteConfirm ? (
              <button 
                className="btn-danger-icon" 
                onClick={() => setShowDeleteConfirm(true)} 
                title="Enviar a la Papelera de Seguridad"
              >
                <Trash2 size={18} />
              </button>
            ) : (
              <div className="delete-confirm-box">
                <span>¿Enviar a la Papelera de Seguridad?</span>
                <button className="btn-confirm-yes" onClick={handleDelete}>Sí</button>
                <button className="btn-confirm-no" onClick={() => setShowDeleteConfirm(false)}>No</button>
              </div>
            )}

            <button className="btn-close" onClick={onClose} title="Cerrar visor">
              <X size={24} />
            </button>
          </div>
        </header>

        {/* Notificación de IA y Revisión */}
        {isNeedsReview && (
          <div className="review-alert-banner">
            <div className="review-banner-icon">
              <Sparkles size={20} />
            </div>
            <div className="review-banner-content">
              <h4>Propuesta de Clasificación y Renombrado</h4>
              <p>
                <strong>Motivo:</strong> {file.reviewReason || 'Nueva prueba detectada.'}
              </p>
              {file.originalName && file.originalName !== file.name && (
                <p className="original-name-tag">
                  <strong>Nombre de descarga original:</strong> <code>{file.originalName}</code>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cuerpo dividido: Visor Real a la izquierda, Panel de Edición/Validación a la derecha */}
        <div className="modal-body-split">
          
          {/* Área de Visualización */}
          <div className="viewer-pane">
            {renderViewer()}
          </div>

          {/* Panel Lateral de Revisión */}
          <div className="review-control-pane">
            <h4 className="control-pane-title">
              <Edit3 size={18} /> Datos del Expediente
            </h4>

            {errorMsg && (
              <div className="error-badge">{errorMsg}</div>
            )}

            <div className="form-group">
              <label>Nombre del Documento / Prueba</label>
              <input 
                type="text" 
                className="input-field"
                value={editedName}
                onChange={e => setEditedName(e.target.value)}
                placeholder="Nombre descriptivo..."
              />
              <span className="input-hint">El nombre se actualizará automáticamente en el disco.</span>
            </div>

            <div className="form-group">
              <label>Asignar a Caso</label>
              <div className="case-input-wrapper">
                <input 
                  type="text" 
                  className="input-field"
                  list="cases-datalist"
                  value={editedCase}
                  onChange={e => setEditedCase(e.target.value)}
                  placeholder="Escribe o selecciona caso..."
                />
                <datalist id="cases-datalist">
                  {availableCases.map(c => (
                    <option key={c} value={c} />
                  ))}
                  <option value="Caso García" />
                  <option value="Caso López" />
                  <option value="Caso Martínez" />
                  <option value="Caso Paquito" />
                </datalist>
              </div>
            </div>

            <div className="form-group">
              <label>Categoría / Subcarpeta</label>
              <select 
                className="select-field"
                value={editedSubfolder}
                onChange={e => setEditedSubfolder(e.target.value)}
              >
                <option value="Demandas y Sentencias">Demandas y Sentencias</option>
                <option value="Notificaciones y Escritos">Notificaciones y Escritos (LexNET)</option>
                <option value="Contratos">Contratos y Convenios</option>
                <option value="Pruebas">Pruebas (Documentales, Vídeos, Audios)</option>
                <option value="Facturas y Costas">Facturas, Minutas y Costas</option>
                <option value="Otros">Otros</option>
              </select>
            </div>

            {/* Resumen extraído por IA */}
            {file.summary && (
              <div className="ai-summary-card">
                <div className="summary-header">
                  <Sparkles size={14} />
                  <span>Extracto analizado por IA</span>
                </div>
                <p className="summary-text">{file.summary}</p>
              </div>
            )}

            {/* Botón de Aprobación */}
            <div className="review-actions-footer">
              <button 
                className="btn-approve-primary" 
                onClick={handleSaveAndApprove}
                disabled={isSaving}
              >
                <CheckCircle2 size={18} />
                <span>{isSaving ? 'Guardando en disco...' : 'Aprobar y Guardar'}</span>
              </button>
            </div>

          </div>

        </div>
        
      </div>
    </div>
  );
};
