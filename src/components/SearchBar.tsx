import React from 'react';
import { Search, X, Sparkles } from 'lucide-react';
import './SearchBar.css';

interface SearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  totalMatches?: number;
}

export const SearchBar: React.FC<SearchBarProps> = ({ searchQuery, setSearchQuery, totalMatches }) => {
  return (
    <div className="search-container animate-fade-in">
      <div className="search-label-row">
        <span className="search-label-badge">
          <Sparkles size={14} /> Buscador Inteligente (Busca por nombre, caso o dentro del texto del PDF/Word)
        </span>
        {searchQuery.trim() !== '' && typeof totalMatches === 'number' && (
          <span className="search-results-count">
            {totalMatches} {totalMatches === 1 ? 'documento encontrado' : 'documentos encontrados'}
          </span>
        )}
      </div>
      <div className="search-input-wrapper">
        <Search className="search-icon" size={20} />
        <input 
          type="text" 
          className="search-input"
          placeholder="Escribe aquí para buscar: ej. 452/2026, Juzgado 4, Gómez, demanda, contrato..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setSearchQuery('')}
            title="Limpiar búsqueda"
          >
            <X size={16} /> Limpiar
          </button>
        )}
      </div>
    </div>
  );
};
