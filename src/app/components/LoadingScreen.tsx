'use client';

export default function LoadingScreen({ message = 'Cargando información…' }: { message?: string }) {
  return (
    <div className="load-screen" role="status" aria-live="polite">
      <div className="load-logo-ring">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ises_symbol.avif" alt="" className="load-logo" />
      </div>
      <div className="load-msg">{message}</div>
      <div className="load-bar"><span /></div>
      <div className="load-hint">Consultando la base de datos PostgreSQL</div>
    </div>
  );
}
