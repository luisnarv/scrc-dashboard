import { fmtCOP, fmtN } from './utils/formatters';

interface RankItem {
  label: string;
  value: number;
  sub?: string;
  format?: 'cop' | 'n';
}

export default function RankList({ items, format = 'cop' }: { items: RankItem[]; format?: 'cop' | 'n' }) {
  return (
    <div>
      {items.slice(0, 10).map((item, i) => (
        <div key={i} className="rank-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="rank-pos">{i + 1}</span>
            <div>
              <div>{item.label}</div>
              {item.sub && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.sub}</div>}
            </div>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>
            {format === 'cop' ? fmtCOP(item.value) : fmtN(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
