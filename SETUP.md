# Guía de configuración — Dashboard SCRC

Bienvenido/a. Este documento te deja el proyecto corriendo **en tu propia máquina**, con una base de datos **tuya de desarrollo** (nunca la de producción). Si trabajas con ayuda de una IA (Claude Code, etc.), esta guía también está pensada para que la IA la siga.

---

## ⚠️ Reglas de seguridad (léelas primero)

1. **Nunca uses la base de datos de producción.** Trabaja siempre contra tu propia BD local o de desarrollo.
2. **Nunca subas tu `.env.local`** al repositorio (ya está en `.gitignore`).
3. **Nunca pegues cadenas de conexión, contraseñas ni tokens** en un chat de IA ni en el código.
4. Los datos de prueba (`db/seed.sql`) son **100% ficticios**. No hay datos reales de clientes.

---

## Requisitos

- **Node.js** 18 o superior.
- **PostgreSQL** — una base de datos propia. Opciones:
  - Local: instala PostgreSQL en tu máquina, o
  - En la nube (gratis): [Neon](https://neon.tech) o [Supabase](https://supabase.com) — crea un proyecto y copia su cadena de conexión.

---

## Pasos

### 1. Clonar e instalar dependencias
```bash
git clone https://github.com/luisnarv/scrc-dashboard.git
cd scrc-dashboard
npm install
```

### 2. Crear tu base de datos
Crea una base de datos vacía en tu PostgreSQL (local o en la nube). Por ejemplo, en local:
```bash
createdb scrc_dev
```

### 3. Cargar la estructura y los datos de prueba
Ejecuta, **en orden**, los dos scripts contra TU base de datos:
```bash
psql "TU_CADENA_DE_CONEXION" -f db/schema.sql
psql "TU_CADENA_DE_CONEXION" -f db/seed.sql
```
- `db/schema.sql` crea el esquema `dbanalitica` y las tablas (sin datos).
- `db/seed.sql` inserta datos **sintéticos** de prueba (8 técnicos, ~720 órdenes, 2 meses) para que el dashboard tenga qué mostrar.

### 4. Configurar el entorno
Copia la plantilla y pon **tu** conexión:
```bash
cp .env.example .env.local
```
Edita `.env.local` y ajusta `POSTGRES_URL` con la cadena de **tu** base de datos:
```
POSTGRES_URL=postgres://usuario:password@localhost:5432/scrc_dev
```

### 5. Levantar la app
```bash
npm run dev
```
Abre <http://localhost:3000>. Deberías ver el dashboard con los datos de prueba (meses 2026-07 y 2026-08).

---

## Estructura del proyecto (rápido)

- `src/app/` — páginas del dashboard (Next.js App Router): `operativo`, `estrategico`, `tecnicos`, `tecnico/productivo`.
- `src/lib/queries_v2.ts` — todas las consultas SQL a PostgreSQL.
- `src/app/lib/db.ts` — conexión (`POSTGRES_URL`).
- `src/app/components/` — componentes y utilidades del dashboard.
- `db/schema.sql`, `db/seed.sql` — estructura y datos de prueba para desarrollo.

## Notas

- El proceso de **carga de datos (ETL)** vive en un proyecto separado y **no** está en este repositorio. Aquí solo trabajas el dashboard (la capa que lee y muestra la información).
- Si necesitas más datos de prueba, puedes editar `db/seed.sql` o pedirle a la IA que agregue filas siguiendo la misma estructura.
- Antes de abrir un Pull Request, verifica que `npm run build` no dé errores.
