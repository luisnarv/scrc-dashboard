'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/resumen', label: '🎯 Resumen Ejecutivo' },
  { href: '/productividad', label: '⚙️ Productividad', tag: 'SIPREM', tagCls: 'tag-sip' },
  { href: '/rentabilidad', label: '💰 Rentabilidad y Costos', tag: 'OTC', tagCls: 'tag-otc' },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="dash-nav">
      {links.map(({ href, label, tag, tagCls }) => (
        <Link
          key={href}
          href={href}
          className={`nav-link${pathname === href || pathname.startsWith(href + '/') ? ' active' : ''}`}
        >
          {label}
          {tag && <span className={tagCls}>{tag}</span>}
        </Link>
      ))}
    </nav>
  );
}
