import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next (con **/ para cubrir subproyectos
    // anidados como "Dashboar mapa de calor/dashboard/.next"):
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "next-env.d.ts",
    // Scripts de prueba/diagnóstico sueltos en la raíz (Node CommonJS, no
    // forman parte del build de la app): p. ej. test_db.js.
    "test_*.js",
  ]),
]);

export default eslintConfig;
