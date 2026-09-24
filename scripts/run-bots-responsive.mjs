#!/usr/bin/env node
/**
 * RUNNER: ejecuta los 6 bots de validación responsive sobre las 8 vistas.
 * Carga cada combinación vista x viewport una sola vez y aplica los chequeos (el bot de modales va al final: hace clic) sobre esa página.
 * Requiere el servidor en marcha (npm run dev, o BASE_URL=...) y Chrome/Edge instalado.
 */
import { runBots } from './responsive/lib.mjs';
import { bot as b1 } from './bot-responsive-1-desborde-horizontal.mjs';
import { bot as b2 } from './bot-responsive-2-contenido-solapamientos.mjs';
import { bot as b3 } from './bot-responsive-3-touch-legibilidad.mjs';
import { bot as b4 } from './bot-responsive-4-graficos-tablas-mapas.mjs';
import { bot as b5 } from './bot-responsive-5-shell-layout.mjs';
import { bot as b6 } from './bot-responsive-6-modales.mjs';

const { failed } = await runBots([b1, b2, b3, b4, b5, b6]);
process.exit(failed ? 1 : 0);
