'use client';
import React, { useState, useRef, useEffect } from 'react';

interface SearchableSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  allLabel?: string;
}

export default function SearchableSelect({ value, onChange, options, placeholder, allLabel = "Todos" }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));
  const displayValue = value === 'ALL' ? '' : value;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '180px', flex: '0 0 auto' }}>
      <div 
        onClick={() => setIsOpen(true)}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          padding: '4px 8px',
          color: '#e6ebf2',
          fontSize: '12px',
          cursor: 'text',
          display: 'flex',
          alignItems: 'center',
          height: '28px',
        }}
      >
        {isOpen ? (
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={placeholder}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e6ebf2',
              width: '100%',
              fontSize: '12px'
            }}
          />
        ) : (
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', color: value === 'ALL' ? '#94a3b8' : '#e6ebf2' }}>
            {value === 'ALL' ? placeholder : displayValue}
          </div>
        )}
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '6px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 9999,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
        }}>
          <div 
            onClick={() => { onChange('ALL'); setIsOpen(false); setSearch(''); }}
            style={{
              padding: '6px 10px',
              fontSize: '12px',
              color: '#94a3b8',
              cursor: 'pointer',
              borderBottom: '1px solid #1e293b',
              background: value === 'ALL' ? '#1e293b' : 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
            onMouseLeave={e => e.currentTarget.style.background = value === 'ALL' ? '#1e293b' : 'transparent'}
          >
            {allLabel}
          </div>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '6px 10px', fontSize: '12px', color: '#64748b' }}>Sin resultados</div>
          ) : (
            filteredOptions.map(opt => (
              <div
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false); setSearch(''); }}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: '#e6ebf2',
                  cursor: 'pointer',
                  background: value === opt ? '#1e293b' : 'transparent',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                onMouseLeave={e => e.currentTarget.style.background = value === opt ? '#1e293b' : 'transparent'}
              >
                {opt}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
