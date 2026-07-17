import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

const ALLOWED = new Set([
  'dashboard_raw_records.csv',
  'dashboard_costos.csv',
  'dashboard_costos_empleado.csv',
  'dashboard_ordenes_detalle.csv',
  'dashboard_funnel_records.csv',
  'dashboard_roster_brigadas.csv',
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!ALLOWED.has(file)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    // Vercel Blob agrega sufijos aleatorios (ej. dashboard-1234.csv).
    // Buscamos usando el nombre base sin la extensión.
    const baseName = file.replace('.csv', '');
    const { blobs } = await list({ prefix: baseName });
    
    if (blobs.length === 0) {
      return new NextResponse('File not found in blob storage', { status: 404 });
    }

    // Ordenamos por fecha de subida (el más nuevo primero)
    blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    const latestBlobUrl = blobs[0].url;
    
    // Lo descargamos y lo enviamos al cliente
    const res = await fetch(latestBlobUrl, {
      next: { revalidate: 3600 }, // Caché de 1 hora
    });
    
    if (!res.ok) {
      return new NextResponse(`Upstream error: ${res.statusText}`, { status: res.status });
    }

    const text = await res.text();

    return new NextResponse(text, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}