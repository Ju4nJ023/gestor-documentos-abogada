import React from 'react';
import { FileText, Video, FileImage, FileAudio, File } from 'lucide-react';
import './FilterPills.css';
import type { FileType } from '../data/mockFiles';

interface FilterPillsProps {
  activeType: FileType | null;
  onFilterType: (type: FileType | null) => void;
}

export const FilterPills: React.FC<FilterPillsProps> = ({ activeType, onFilterType }) => {
  const filters: { label: string; type: FileType | null; icon: any }[] = [
    { label: 'Todos', type: null, icon: File },
    { label: 'PDFs', type: 'pdf', icon: FileText },
    { label: 'Videos', type: 'video', icon: Video },
    { label: 'Word', type: 'word', icon: FileText },
    { label: 'Audios', type: 'audio', icon: FileAudio },
    { label: 'Imágenes', type: 'image', icon: FileImage },
  ];

  return (
    <div className="filter-pills animate-fade-in" style={{ animationDelay: '0.1s' }}>
      {filters.map(filter => {
        const Icon = filter.icon;
        return (
          <button
            key={filter.label}
            className={`filter-pill ${activeType === filter.type ? 'active' : ''}`}
            onClick={() => onFilterType(filter.type)}
          >
            <Icon size={16} />
            {filter.label}
          </button>
        )
      })}
    </div>
  );
};
