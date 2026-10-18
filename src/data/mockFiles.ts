export type FileType = 'pdf' | 'video' | 'word' | 'image' | 'audio' | 'file';

export type Subfolder = 'Demandas y Sentencias' | 'Pruebas' | 'Contratos' | 'Otros' | string;

export type FileStatus = 'needs_review' | 'reviewed';

export interface FileData {
  id: string;
  name: string;
  originalName?: string;
  type: FileType;
  caseName: string;
  subfolder: Subfolder;
  size: string;
  date: string;
  status?: FileStatus;
  confidence?: 'alta' | 'media' | 'baja';
  reviewReason?: string;
  summary?: string;
  contentText?: string;
  publicUrl?: string;
  storagePath?: string;
}

export const initialFiles: FileData[] = [
  {
    id: '1',
    name: 'Demanda_Principal_Caso_Garcia_2026.pdf',
    originalName: 'scan_demanda_01.pdf',
    type: 'pdf',
    caseName: 'Caso García',
    subfolder: 'Demandas y Sentencias',
    size: '2.4 MB',
    date: '2026-07-20',
    status: 'reviewed',
    confidence: 'alta',
    reviewReason: 'Demanda clasificada automáticamente.',
    summary: 'Demanda de Juicio Ordinario interpuesta por D. Antonio García contra Aseguradora...',
  },
  {
    id: '2',
    name: 'Prueba_Video_Declaracion_Caso_Garcia_2026-07-22.mp4',
    originalName: 'WhatsApp Video 2026-07-22 at 18.20.10.mp4',
    type: 'video',
    caseName: 'Caso García',
    subfolder: 'Pruebas',
    size: '156.8 MB',
    date: '2026-07-22',
    status: 'needs_review',
    confidence: 'media',
    reviewReason: 'Material probatorio audiovisual. Revisar contenido y validar asignación de caso.',
    summary: 'Archivo multimedia de prueba registrado. Pendiente de verificación por la letrada.',
  },
  {
    id: '3',
    name: 'Prueba_Pericial_Arquitectura_Caso_Lopez_2026.pdf',
    originalName: 'informe_humedades_final.pdf',
    type: 'pdf',
    caseName: 'Caso López',
    subfolder: 'Pruebas',
    size: '4.5 MB',
    date: '2026-07-25',
    status: 'needs_review',
    confidence: 'alta',
    reviewReason: 'Informe pericial detectado en el texto. Se sugiere verificar el perito y el caso.',
    summary: 'Dictamen pericial arquitectónico relativo a daños por humedades en inmueble de C/ Mayor...',
  },
  {
    id: '4',
    name: 'Sentencia_Favorable_Caso_Martinez_2026.pdf',
    originalName: 'Sentencia_123_2026.pdf',
    type: 'pdf',
    caseName: 'Caso Martínez',
    subfolder: 'Demandas y Sentencias',
    size: '5.1 MB',
    date: '2026-07-15',
    status: 'reviewed',
    confidence: 'alta',
    reviewReason: 'Sentencia registrada con éxito.',
    summary: 'Sentencia estimatoria total dictada por el Juzgado de 1ª Instancia nº 2...',
  },
];
