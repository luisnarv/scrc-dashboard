'use client';
import { useState } from 'react';

interface Column {
  key: string;
  label: string;
  type?: 'num';
  render?: (val: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface SortableTableProps {
  id: string;
  columns: Column[];
  data: Record<string, unknown>[];
  defaultSort?: string;
  defaultDir?: 'asc' | 'desc';
  searchPlaceholder?: string;
  searchKeys?: string[];
  maxRows?: number;
}

export default function SortableTable({
  id,
  columns,
  data,
  defaultSort,
  defaultDir = 'desc',
  searchPlaceholder = 'Buscar…',
  searchKeys,
  maxRows = 500,
}: SortableTableProps) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ col: defaultSort || columns[0]?.key || '', dir: defaultDir });

  const keys = searchKeys || columns.map(c => c.key);
  const filtered = data.filter(row =>
    !q || keys.some(k => String(row[k] ?? '').toLowerCase().includes(q.toLowerCase()))
  );

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sort.col], vb = b[sort.col];
    if (typeof va === 'number' && typeof vb === 'number')
      return sort.dir === 'asc' ? va - vb : vb - va;
    return sort.dir === 'asc'
      ? String(va ?? '').localeCompare(String(vb ?? ''))
      : String(vb ?? '').localeCompare(String(va ?? ''));
  });

  const visible = sorted.slice(0, maxRows);

  const handleSort = (col: Column) => {
    if (!col.key) return;
    setSort(prev => ({
      col: col.key,
      dir: prev.col === col.key ? (prev.dir === 'asc' ? 'desc' : 'asc') : (col.type === 'num' ? 'desc' : 'asc'),
    }));
  };

  return (
    <div>
      <div className="tabla-tools">
        <input
          className="tabla-search"
          placeholder={searchPlaceholder}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <span className="tabla-stats">{filtered.length} de {data.length} registros</span>
      </div>
      <div className="det-wrap">
        <table className="det sortable" id={id}>
          <thead>
            <tr>
              <th>#</th>
              {columns.map(col => (
                <th
                  key={col.key}
                  data-sort={col.key}
                  data-type={col.type}
                  className={sort.col === col.key ? sort.dir : ''}
                  onClick={() => handleSort(col)}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {columns.map(col => (
                  <td key={col.key}>
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
