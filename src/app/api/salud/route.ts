// Salud del contenedor: no toca la base de datos a propósito, para que Docker
// y el actualizador distingan "la app arrancó" de "la base respondió".
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
