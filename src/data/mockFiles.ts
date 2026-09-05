export type FileType = 'pdf' | 'video' | 'word' | 'image' | 'audio';

export type Subfolder = 'Demandas y Sentencias' | 'Pruebas' | 'Contratos' | 'Otros';

export interface FileData {
  id: string;
  name: string;
  type: FileType;
  caseName: string;
  subfolder: Subfolder;
  size: string;
  date: string;
}

export const initialFiles: FileData[] = [
  {
    id: '1',
    name: 'Demanda_Inicial.pdf',
    type: 'pdf',
    caseName: 'Caso García vs López',
    subfolder: 'Demandas y Sentencias',
    size: '2.4 MB',
    date: '2026-07-20',
  },
  {
    id: '2',
    name: 'Declaracion_Testigo.mp4',
    type: 'video',
    caseName: 'Caso García vs López',
    subfolder: 'Pruebas',
    size: '156.8 MB',
    date: '2026-07-22',
  },
  {
    id: '3',
    name: 'Contrato_Arrendamiento.docx',
    type: 'word',
    caseName: 'Caso Martínez',
    subfolder: 'Contratos',
    size: '45 KB',
    date: '2026-07-25',
  },
  {
    id: '4',
    name: 'Sentencia_Favorable.pdf',
    type: 'pdf',
    caseName: 'Caso Martínez',
    subfolder: 'Demandas y Sentencias',
    size: '5.1 MB',
    date: '2026-07-15',
  },
];
