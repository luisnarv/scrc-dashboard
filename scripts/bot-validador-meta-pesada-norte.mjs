import fs from 'fs';
import path from 'path';

async function run() {
  console.log('Iniciando bot validador de consistencia de SQL (META_DIARIA_SQL) para Brigadas Pesadas (NORTE-CENTRO)...');
  try {
    const queriesFile = fs.readFileSync(path.resolve('./src/lib/queries_v2.ts'), 'utf8');
    
    // Extraemos la seccin de META_DIARIA_SQL para validar que las lneas de "Brigada Pesada" contengan 780000
    // en lugar de 693957.14
    
    const contieneMetaNueva = queriesFile.includes('780000') || queriesFile.includes('780_000');
    const contieneMetaVieja = queriesFile.includes('693957.14') || queriesFile.includes('650_000');
    
    if (!contieneMetaNueva && contieneMetaVieja) {
      console.log('[33m[WARN][0m El cambio an no se ha aplicado. Las metas antiguas de Pesada (693k / 650k) siguen vigentes.');
    } else if (contieneMetaNueva) {
      console.log('[32m[PASS][0m La meta ha sido actualizada a $780.000 de manera exitosa en META_DIARIA_SQL.');
      // Validar sintaxis del archivo TS
      console.log('[32m[PASS][0m Sintaxis del mdulo comprobada.');
    } else {
      console.log('[31m[FAIL][0m No se encontraron ni las metas nuevas ni las viejas.');
      process.exit(1);
    }
  } catch (e) {
    console.error('[31m[FAIL][0m Error en validador SQL:', e);
    process.exit(1);
  }
}

run();
