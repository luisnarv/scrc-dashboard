# Despliegue del dashboard con Docker

Cómo llega un cambio del código al servidor de ISES. Hoy el dashboard sigue en Vercel;
esto es la opción para publicarlo en el servidor propio, incrustado en la plataforma.

## El flujo

1. Alguien sube un cambio a `main` (por pull request, de preferencia).
2. GitHub Actions (`.github/workflows/imagen-docker.yml`) construye la imagen con `next build`.
   Si hay un error de tipos o de compilación, **no hay imagen**.
3. Arranca el contenedor y consulta `/api/salud`. Si no responde, el flujo falla.
4. Publica la imagen en GitHub Container Registry (`ghcr.io/luisnarv/scrc-dashboard`)
   con dos etiquetas: el commit completo (para volver atrás) y `latest`.
5. El job `promover` mueve la etiqueta **`produccion`** a esa versión. Si el entorno
   `produccion` tiene revisores obligatorios, espera la aprobación del equipo de la plataforma.
6. En el servidor, Watchtower ve que `produccion` cambió, baja la imagen y reinicia solo el
   contenedor del dashboard.

El servidor siempre *baja* la imagen; GitHub nunca entra al servidor.

## Una sola vez: preparar GitHub

- **Settings > Environments > New environment**, con el nombre `produccion`.
  - Con *Required reviewers* = despliegue **con aprobación**.
  - Sin revisores = despliegue **automático**.
- Si el repositorio es privado, la imagen queda privada. El servidor necesita un token
  con permiso solo de lectura de paquetes (`read:packages`).

## Una sola vez: preparar el servidor

```bash
docker login ghcr.io          # usuario de GitHub y el token de solo lectura
mkdir dashboard && cd dashboard
# copiar deploy/docker-compose.yml aquí y crear dashboard.env con:
#   POSTGRES_URL=postgresql://usuario:clave@host:5432/base
docker compose up -d
```

El proxy inverso del servidor debe apuntar `/{proyecto}/dashboard` (o el dominio que se
elija) a `127.0.0.1:3000`.

## Volver a una versión anterior

Cada imagen queda etiquetada con su commit. Para volver atrás, en GitHub se vuelve a
ejecutar el workflow del commit bueno (o se mueve la etiqueta a mano):

```bash
docker buildx imagetools create \
  --tag ghcr.io/luisnarv/scrc-dashboard:produccion \
  ghcr.io/luisnarv/scrc-dashboard:<commit-completo>
```

## Cosas que hay que resolver antes de usarlo en producción

- **Embeber en la plataforma:** el dashboard debe permitir el dominio de la plataforma
  en `frame-ancestors` (cabecera `Content-Security-Policy`). Hoy `next.config.ts` no la define.
- **La conexión a la base** (`POSTGRES_URL`) va solo en el servidor. Nunca con prefijo
  `NEXT_PUBLIC_`.
- **Seguridad del código:** `src/app/lib/db.ts` tiene un fragmento de la contraseña de la
  base escrito en el código (y por tanto en el historial de git). Conviene cambiar la
  contraseña y codificarla en la variable de entorno en lugar de corregirla en código.
  Además usa `ssl: { rejectUnauthorized: false }`, que no valida el certificado.
- **Watchtower:** verificar que su imagen siga mantenida antes de usarla; si no, se
  reemplaza por `docker compose pull && docker compose up -d` desde un job del flujo.
