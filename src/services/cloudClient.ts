import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { FileData, FileType } from '../data/mockFiles';

const LOCAL_API = 'http://localhost:3001';
const BUCKET_NAME = 'lexvault-files';

const LS_SUPABASE_URL = 'lexvault_supabase_url';
const LS_SUPABASE_KEY = 'lexvault_supabase_key';

let cachedSupabase: SupabaseClient | null = null;
let cachedKeySignature = '';

export function normalizeSupabaseUrl(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

export function getFrontendSupabaseCredentials() {
  const envUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || '');
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const lsUrl = normalizeSupabaseUrl(localStorage.getItem(LS_SUPABASE_URL) || '');
  const lsKey = (localStorage.getItem(LS_SUPABASE_KEY) || '').trim();

  const url =
    envUrl && envUrl !== 'https://tu-proyecto.supabase.co'
      ? envUrl
      : lsUrl;
  const key =
    envKey && envKey !== 'tu_supabase_key_aqui'
      ? envKey
      : lsKey;

  return {
    url,
    key,
    isConfigured: url.startsWith('http') && key.length > 15
  };
}

export function saveFrontendSupabaseCredentials(url: string, key: string) {
  if (url.trim()) localStorage.setItem(LS_SUPABASE_URL, url.trim());
  if (key.trim()) localStorage.setItem(LS_SUPABASE_KEY, key.trim());
  cachedSupabase = null;
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const { url, key, isConfigured } = getFrontendSupabaseCredentials();
  if (!isConfigured) return null;

  const sig = `${url}|${key}`;
  if (!cachedSupabase || cachedKeySignature !== sig) {
    cachedSupabase = createClient(url, key);
    cachedKeySignature = sig;
  }
  return cachedSupabase;
}

export interface UnifiedFilesResult {
  files: FileData[];
  mode: 'local+cloud' | 'local' | 'cloud' | 'offline';
  cloudConfigured: boolean;
  localOnline: boolean;
  lastSyncTime?: string | null;
}

function mapSupabaseRowToFileData(row: any): FileData {
  return {
    id: row.id,
    name: row.name,
    originalName: row.original_name || row.name,
    type: (row.type as FileType) || 'pdf',
    caseName: row.case_name || 'Por Clasificar',
    subfolder: row.subfolder || 'Otros',
    size: row.size || '0.00 MB',
    date: row.date || new Date().toISOString().split('T')[0],
    status: row.status || 'reviewed',
    confidence: row.confidence || 'media',
    reviewReason: row.review_reason || '',
    summary: row.summary || '',
    contentText: row.content_text || row.summary || '',
    publicUrl: row.public_url || '',
    storagePath: row.storage_path || ''
  };
}

const isLocalhostHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/**
 * Obtiene la lista de documentos probando primero el Robot Local (si estamos en el PC)
 * y haciendo fallback automático a Supabase en la Nube (si estamos en Vercel, móvil o con el PC apagado).
 */
export async function fetchFilesUnified(): Promise<UnifiedFilesResult> {
  // 1. Si estamos en localhost, intentar hablar con el Robot local
  if (isLocalhostHost) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2200);
      const [filesRes, statusRes] = await Promise.all([
        fetch(`${LOCAL_API}/api/files`, { signal: controller.signal }),
        fetch(`${LOCAL_API}/api/status`, { signal: controller.signal }).catch(() => null)
      ]);
      clearTimeout(timeout);

      if (filesRes.ok) {
        const files = await filesRes.json();
        let cloudConfigured = getFrontendSupabaseCredentials().isConfigured;
        let lastSyncTime = null;
        if (statusRes && statusRes.ok) {
          const st = await statusRes.json();
          if (st.cloud) {
            cloudConfigured = Boolean(st.cloud.configured);
            lastSyncTime = st.cloud.lastSyncTime;
            if (st.cloud.supabaseUrl && !localStorage.getItem(LS_SUPABASE_URL)) {
              localStorage.setItem(LS_SUPABASE_URL, st.cloud.supabaseUrl);
            }
          }
        }
        return {
          files,
          mode: cloudConfigured ? 'local+cloud' : 'local',
          cloudConfigured,
          localOnline: true,
          lastSyncTime
        };
      }
    } catch (_) {
      // Si el robot local está apagado, pasamos automáticamente a leer de Supabase Nube
    }
  }

  // 2. Modo Nube (Supabase directo desde Vercel, móvil o cuando el Robot PC está apagado)
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      throw new Error(`Error al consultar Supabase Nube: ${error.message}`);
    }

    return {
      files: (data || []).map(mapSupabaseRowToFileData),
      mode: 'cloud',
      cloudConfigured: true,
      localOnline: false
    };
  }

  throw new Error('Robot local apagado y Nube Supabase aún no configurada');
}

/**
 * Obtiene la lista de carpetas de casos (Local o Nube)
 */
export async function fetchCasesUnified(): Promise<string[]> {
  if (isLocalhostHost) {
    try {
      const res = await fetch(`${LOCAL_API}/api/cases`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (_) {}
  }

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase.from('cases').select('name').order('name');
    if (data) return data.map((r: any) => r.name);
  }
  return [];
}

/**
 * Crea un nuevo Caso en disco local y/o en Supabase Nube
 */
export async function createCaseUnified(rawCaseName: string): Promise<string> {
  const clean = rawCaseName.replace(/[<>:"/\\|?*]/g, '').trim();
  const finalCaseName = /^caso\s+/i.test(clean) ? clean : `Caso ${clean}`;

  if (isLocalhostHost) {
    try {
      const res = await fetch(`${LOCAL_API}/api/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseName: finalCaseName })
      });
      if (res.ok) {
        const data = await res.json();
        return data.caseName || finalCaseName;
      }
    } catch (_) {}
  }

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from('cases').upsert({ name: finalCaseName }, { onConflict: 'name' });
  }
  return finalCaseName;
}

/**
 * Actualiza/aprueba un documento en el Robot Local o directamente en Supabase Nube
 */
export async function reviewFileUnified(
  fileId: string,
  payload: { newName: string; caseName: string; subfolder: string; status: 'reviewed' | 'needs_review' }
) {
  if (isLocalhostHost) {
    try {
      const response = await fetch(`${LOCAL_API}/api/files/${fileId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (_) {}
  }

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from('cases').upsert({ name: payload.caseName }, { onConflict: 'name' });
    const { error } = await supabase
      .from('documents')
      .update({
        name: payload.newName,
        case_name: payload.caseName,
        subfolder: payload.subfolder,
        status: payload.status,
        review_reason: 'Revisado y validado desde la Nube',
        updated_at: new Date().toISOString()
      })
      .eq('id', fileId);

    if (error) throw new Error(error.message);
    return {
      success: true,
      file: {
        id: fileId,
        name: payload.newName,
        caseName: payload.caseName,
        subfolder: payload.subfolder,
        status: payload.status
      }
    };
  }

  throw new Error('No se pudo guardar: sin conexión con Robot ni Supabase');
}

/**
 * Elimina un archivo (Papelera local si está en PC, o borrado en Supabase si está en Nube)
 */
export async function deleteFileUnified(file: FileData) {
  if (isLocalhostHost) {
    try {
      const response = await fetch(`${LOCAL_API}/api/files/${file.id}`, {
        method: 'DELETE'
      });
      if (response.ok) return true;
    } catch (_) {}
  }

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    if (file.storagePath) {
      await supabase.storage.from(BUCKET_NAME).remove([file.storagePath]);
    }
    const { error } = await supabase.from('documents').delete().eq('id', file.id);
    if (error) throw new Error(error.message);
    return true;
  }

  throw new Error('No se pudo eliminar el archivo');
}

/**
 * Sube archivos manualmente: usa el Robot Híbrido IA si el PC está encendido,
 * o los sube directamente a Supabase Storage si se está usando desde fuera (Vercel/Móvil).
 */
export async function uploadFilesUnified(fileList: FileList) {
  if (isLocalhostHost) {
    try {
      const formData = new FormData();
      Array.from(fileList).forEach(file => formData.append('files', file));
      const response = await fetch(`${LOCAL_API}/api/upload`, {
        method: 'POST',
        body: formData
      });
      if (response.ok) return await response.json();
    } catch (_) {}
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error('Para subir archivos desde fuera de la oficina, configura primero la conexión a Supabase.');
  }

  for (const file of Array.from(fileList)) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const type: FileType =
      ext === 'pdf'
        ? 'pdf'
        : ['doc', 'docx'].includes(ext)
        ? 'word'
        : ['mp4', 'mov', 'avi'].includes(ext)
        ? 'video'
        : ['mp3', 'wav', 'm4a'].includes(ext)
        ? 'audio'
        : ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
        ? 'image'
        : 'file';

    const safeName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._\-]/g, '_');

    const storagePath = `Por_Clasificar/Otros/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, { upsert: true });

    if (upErr) throw new Error(upErr.message);

    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
    const id = btoa(unescape(encodeURIComponent(storagePath)));

    await supabase.from('cases').upsert({ name: 'Por Clasificar' }, { onConflict: 'name' });
    await supabase.from('documents').upsert({
      id,
      name: file.name,
      original_name: file.name,
      type,
      case_name: 'Por Clasificar',
      subfolder: 'Otros',
      size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      date: new Date().toISOString().split('T')[0],
      status: 'needs_review',
      confidence: 'media',
      review_reason: 'Subido desde acceso remoto (Nube). Pendiente de asignar expediente.',
      summary: `Documento subido desde acceso remoto: "${file.name}".`,
      content_text: file.name,
      storage_path: storagePath,
      public_url: urlData?.publicUrl || ''
    });
  }

  return { success: true };
}
