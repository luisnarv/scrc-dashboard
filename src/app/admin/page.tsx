'use client';

import { useState } from 'react';

const FILES_NEEDED = [
  'dashboard_raw_records.csv',
  'dashboard_costos.csv',
  'dashboard_costos_empleado.csv',
  'dashboard_ordenes_detalle.csv',
];

export default function AdminPage() {
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!secret) {
      alert('Debes ingresar el token de seguridad (UPLOAD_SECRET) antes de subir archivos.');
      e.target.value = '';
      return;
    }

    setLoading(true);
    setStatus('Subiendo archivos...');

    // Evita el error de `upload` requires @vercel/blob/client import
    // y como esto ya usa Next.js client component, importamos de ahí.
    const { upload } = await import('@vercel/blob/client');

    let uploaded = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (!FILES_NEEDED.includes(file.name)) {
          setStatus((prev) => prev + `\nIgnorado: ${file.name} (nombre no válido)`);
          continue;
        }

        await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: `${window.location.origin}/api/upload`,
          clientPayload: JSON.stringify({ secret }),
        });

        uploaded++;
        setStatus((prev) => prev + `\n✅ Subido con éxito: ${file.name}`);
      }

      setStatus((prev) => prev + `\n\n🎉 Proceso terminado. Subidos: ${uploaded}`);
    } catch (error) {
      setStatus((prev) => prev + `\n❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>Panel de Administración</h1>
      <p>Sube los 4 archivos CSV resultantes del ETL local aquí. Serán almacenados en Vercel Blob.</p>
      
      <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
        <strong>Archivos requeridos:</strong>
        <ul style={{ margin: '10px 0 0 20px', fontSize: '14px', color: '#555' }}>
          {FILES_NEEDED.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Token de Seguridad (UPLOAD_SECRET)</label>
        <input 
          type="password" 
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Ingresa la contraseña..."
          style={{ padding: '0.5rem', width: '100%', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>

      <input 
        type="file" 
        multiple 
        accept=".csv"
        disabled={loading || !secret}
        onChange={handleUpload}
        style={{ padding: '1rem', border: '2px dashed #ccc', width: '100%', borderRadius: '8px', cursor: 'pointer' }}
      />

      {status && (
        <pre style={{ marginTop: '2rem', padding: '1rem', background: '#333', color: '#fff', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
          {status}
        </pre>
      )}
    </div>
  );
}
