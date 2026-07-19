'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: '🎯 Resumen Ejecutivo' },
  { href: '/estrategico', label: '📈 Estratégico', tag: 'Evolutivos', tagCls: 'tag-sip' },
  { href: '/gerencial', label: '💰 Gerencial', tag: 'P&L', tagCls: 'tag-otc' },
  { href: '/operativo', label: '⚙️ Operativo', tag: 'SIPREM', tagCls: 'tag-sip' },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="dash-nav">
      {links.map(({ href, label, tag, tagCls }) => (
        <Link
          key={href}
          href={href}
          className={`nav-link${pathname === href || (href !== '/' && pathname.startsWith(href + '/')) ? ' active' : ''}`}
        >
          {label}
          {tag && <span className={tagCls}>{tag}</span>}
        </Link>
      ))}
    </nav>
  );
}
