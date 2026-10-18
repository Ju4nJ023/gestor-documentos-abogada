import React, { useState, useEffect } from 'react';
import { Cloud, CheckCircle2, Copy, Check, RefreshCw, Lock, Database, X, ExternalLink } from 'lucide-react';
import {
  getFrontendSupabaseCredentials,
  saveFrontendSupabaseCredentials
} from '../services/cloudClient';

interface CloudSettingsModalProps {
  onClose: () => void;
  onConfigSaved: () => void;
}

const DEFAULT_SQL = `-- 1. Tabla de Expedientes / Casos
CREATE TABLE IF NOT EXISTS public.cases (
    name TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Documentos Jurídicos y Pruebas
CREATE TABLE IF NOT EXISTS public.documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    original_name TEXT,
    type TEXT NOT NULL DEFAULT 'pdf',
    case_name TEXT NOT NULL,
    subfolder TEXT NOT NULL DEFAULT 'Otros',
    size TEXT DEFAULT '0.00 MB',
    date TEXT,
    status TEXT DEFAULT 'reviewed',
    confidence TEXT DEFAULT 'media',
    review_reason TEXT,
    summary TEXT,
    content_text TEXT,
    storage_path TEXT,
    public_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.cases TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.documents TO anon, authenticated, service_role;

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo a cases" ON public.cases;
CREATE POLICY "Acceso completo a cases" ON public.cases FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso completo a documents" ON public.documents;
CREATE POLICY "Acceso completo a documents" ON public.documents FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('lexvault-files', 'lexvault-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Acceso publico lectura lexvault-files" ON storage.objects;
CREATE POLICY "Acceso publico lectura lexvault-files" ON storage.objects FOR SELECT USING (bucket_id = 'lexvault-files');
DROP POLICY IF EXISTS "Acceso subida lexvault-files" ON storage.objects;
CREATE POLICY "Acceso subida lexvault-files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'lexvault-files');
DROP POLICY IF EXISTS "Acceso actualizacion lexvault-files" ON storage.objects;
CREATE POLICY "Acceso actualizacion lexvault-files" ON storage.objects FOR UPDATE USING (bucket_id = 'lexvault-files');
DROP POLICY IF EXISTS "Acceso borrado lexvault-files" ON storage.objects;
CREATE POLICY "Acceso borrado lexvault-files" ON storage.objects FOR DELETE USING (bucket_id = 'lexvault-files');`;

export const CloudSettingsModal: React.FC<CloudSettingsModalProps> = ({
  onClose,
  onConfigSaved
}) => {
  const existing = getFrontendSupabaseCredentials();
  const [supabaseUrl, setSupabaseUrl] = useState(existing.url);
  const [supabaseKey, setSupabaseKey] = useState(existing.key);
  const [appPassword, setAppPassword] = useState('');
  const [sqlScript, setSqlScript] = useState(DEFAULT_SQL);
  const [copiedSql, setCopiedSql] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    fetch('http://localhost:3001/api/cloud/status')
      .then(res => res.json())
      .then(data => {
        if (data.supabaseUrl && !supabaseUrl) {
          setSupabaseUrl(data.supabaseUrl);
        }
        if (data.sqlScript) {
          setSqlScript(data.sqlScript);
        }
      })
      .catch(() => {});
  }, []);

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      saveFrontendSupabaseCredentials(supabaseUrl, supabaseKey);
      if (appPassword.trim()) {
        localStorage.setItem('lexvault_custom_password', appPassword.trim());
      }

      // Si el Robot local está encendido, guardar también en el archivo .env del ordenador y sincronizar
      try {
        const res = await fetch('http://localhost:3001/api/cloud/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabaseUrl: supabaseUrl.trim(),
            supabaseKey: supabaseKey.trim(),
            appPassword: appPassword.trim() || undefined
          })
        });
        if (res.ok) {
          const data = await res.json();
          const count = data.syncResult?.count ?? 0;
          setStatusMsg(
            `¡Guardado en .env local y conectado! (${count} documentos sincronizados con la nube)`
          );
        } else {
          setStatusMsg('Credenciales guardadas en el navegador.');
        }
      } catch (_) {
        setStatusMsg('Credenciales de nube guardadas en este dispositivo.');
      }

      onConfigSaved();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('http://localhost:3001/api/cloud/sync', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.syncResult?.synced) {
        setStatusMsg(`Sincronización completada: ${data.syncResult.count} documentos subidos a Supabase.`);
        onConfigSaved();
      } else {
        setErrorMsg(data.syncResult?.error || data.syncResult?.reason || 'No se pudo sincronizar');
      }
    } catch (err: any) {
      setErrorMsg('El Robot del PC debe estar encendido para subir los archivos locales a la nube.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '680px',
          width: '94%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0f172a',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          borderRadius: '16px',
          padding: '24px',
          color: '#f8fafc'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cloud size={26} style={{ color: '#60a5fa' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Sincronización Híbrida PC + Nube (Supabase)</h3>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                Accede a los expedientes desde el móvil, tablet o juzgado aunque el PC esté apagado
              </span>
            </div>
          </div>
          <button onClick={onClose} className="btn-close" style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        {/* Paso 1: Script SQL */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '18px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} style={{ color: '#38bdf8' }} />
              <strong style={{ fontSize: '0.92rem' }}>Paso 1: Preparar tablas y almacenamiento en Supabase (1 vez)</strong>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleCopySql}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: copiedSql ? '#16a34a' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                {copiedSql ? '¡SQL Copiado!' : 'Copiar Script SQL'}
              </button>
              <button
                type="button"
                onClick={() => setShowSql(!showSql)}
                style={{
                  background: 'rgba(148, 163, 184, 0.15)',
                  color: '#cbd5e1',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                {showSql ? 'Ocultar SQL' : 'Ver SQL'}
              </button>
            </div>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>
            Crea un proyecto gratis en{' '}
            <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              supabase.com <ExternalLink size={12} />
            </a>
            , entra en <strong>SQL Editor</strong>, pega este script y pulsa <strong>Run</strong>.
          </p>
          {showSql && (
            <pre
              style={{
                marginTop: '10px',
                background: '#020617',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                color: '#93c5fd',
                maxHeight: '180px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap'
              }}
            >
              {sqlScript}
            </pre>
          )}
        </div>

        {/* Paso 2: Formulario de Credenciales */}
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#e2e8f0' }}>
              Project URL de Supabase (Settings → API → Project URL)
            </label>
            <input
              type="url"
              value={supabaseUrl}
              onChange={e => setSupabaseUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: '0.9rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#e2e8f0' }}>
              API Key de Supabase (Settings → API → anon public o service_role)
            </label>
            <input
              type="password"
              value={supabaseKey}
              onChange={e => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: '0.9rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#e2e8f0' }}>
              <Lock size={14} style={{ color: '#fbbf24' }} />
              Contraseña de Acceso a la Web (Opcional, protege la entrada con clave)
            </label>
            <input
              type="text"
              value={appPassword}
              onChange={e => setAppPassword(e.target.value)}
              placeholder="Dejar en blanco si no quieres pedir contraseña al entrar..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: '0.9rem'
              }}
            />
          </div>

          {statusMsg && (
            <div style={{ background: 'rgba(22, 163, 74, 0.2)', border: '1px solid #22c55e', color: '#4ade80', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div style={{ background: 'rgba(220, 38, 38, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.86rem' }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleForceSync}
              disabled={isSyncing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#60a5fa',
                padding: '10px 16px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={16} className={isSyncing ? 'animate-spin-slow' : ''} />
              <span>{isSyncing ? 'Sincronizando con Supabase...' : 'Sincronizar Archivos Locales Ahora'}</span>
            </button>

            <button
              type="submit"
              disabled={isSaving}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff',
                border: 'none',
                padding: '10px 22px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {isSaving ? 'Guardando...' : 'Guardar y Conectar Nube'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
