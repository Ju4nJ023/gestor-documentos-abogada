-- ============================================================================
-- SCRIPT DE CONFIGURACIÓN DE SUPABASE PARA LEXVAULT (HÍBRIDO PC + NUBE)
-- Instrucciones:
-- 1. Entra en https://supabase.com -> Tu Proyecto -> SQL Editor
-- 2. Pega todo este código y pulsa "Run" (Ejecutar)
-- ============================================================================

-- 1. Tabla de Expedientes / Casos
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

-- 3. Habilitar políticas de acceso para la aplicación
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo a cases" ON public.cases;
CREATE POLICY "Acceso completo a cases" ON public.cases
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso completo a documents" ON public.documents;
CREATE POLICY "Acceso completo a documents" ON public.documents
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Crear Bucket de Almacenamiento para los PDFs, Words y Pruebas
INSERT INTO storage.buckets (id, name, public)
VALUES ('lexvault-files', 'lexvault-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Acceso publico lectura lexvault-files" ON storage.objects;
CREATE POLICY "Acceso publico lectura lexvault-files" ON storage.objects
    FOR SELECT USING (bucket_id = 'lexvault-files');

DROP POLICY IF EXISTS "Acceso subida lexvault-files" ON storage.objects;
CREATE POLICY "Acceso subida lexvault-files" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'lexvault-files');

DROP POLICY IF EXISTS "Acceso actualizacion lexvault-files" ON storage.objects;
CREATE POLICY "Acceso actualizacion lexvault-files" ON storage.objects
    FOR UPDATE USING (bucket_id = 'lexvault-files');

DROP POLICY IF EXISTS "Acceso borrado lexvault-files" ON storage.objects;
CREATE POLICY "Acceso borrado lexvault-files" ON storage.objects
    FOR DELETE USING (bucket_id = 'lexvault-files');
