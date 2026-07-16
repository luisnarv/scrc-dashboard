import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch (e) {
    return NextResponse.json({ error: 'Body no es JSON válido' }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let secret = '';
        try {
          if (clientPayload) {
            const parsed = JSON.parse(clientPayload);
            secret = parsed.secret;
          }
        } catch (e) {
          console.error("Error parseando clientPayload", e);
          throw new Error('Payload inválido');
        }
        
        if (secret !== process.env.UPLOAD_SECRET) {
          console.error("Token incorrecto. Recibido:", secret);
          throw new Error('Contraseña incorrecta');
        }

        // Como Vercel Blob es estricto con addRandomSuffix en Client Uploads,
        // lo dejamos por defecto (true) para que asigne sufijos aleatorios.
        // El Dashboard buscará siempre el archivo más reciente.

        return {
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: true, // Forzamos esto explícitamente como pidió el error
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('Subida exitosa:', blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Error interno handleUpload:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 } 
    );
  }
}
