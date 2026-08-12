# Aplicación Conoce a tu Enfermera(o)

Miniaplicación Cloudflare que sustituye el validador público legado sin reconstruir el portal WordPress. Esta carpeta contiene la UI, la API, el esquema D1 y las herramientas de generación y validación de datos.

## Requisitos

- Node.js 22.13 o superior.
- pnpm 11.16.0, activado mediante Corepack.

## Ejecución local

```bash
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm install --frozen-lockfile
pnpm run data:demo
pnpm run data:verify
pnpm run lint
pnpm run test
pnpm run dev
```

`data:demo` genera el mismo padrón sintético desde tres orígenes simulados: JSON/exportación de base de datos, CSV y API/NDJSON. `data:verify` comprueba que los snapshots y checksums sean equivalentes, que no existan CEP duplicados y que no aparezcan campos personales fuera del contrato público.

Los datos de `data/demo/` son ficticios y no representan colegiados reales. Puede probar la consulta con el número CEP `00001`.

## Estado funcional

La ruta `POST /api/v1/consulta` consulta exclusivamente la proyección D1 activa. Admite número CEP exacto de 5 o 6 dígitos o nombre completo normalizado, devuelve como máximo cinco coincidencias y no ofrece listados, comodines, paginación ni exportaciones.

En desarrollo local se conserva el contrato de Turnstile mediante un token de demostración. En el dominio público, el widget administrado se verifica contra Cloudflare desde el servidor y `TURNSTILE_SECRET_KEY` permanece exclusivamente en los secretos del Worker.

La identidad se selecciona durante el build mediante `PUBLIC_BRAND_PROFILE`: `demo` es el perfil predeterminado y `cep-preview` se reserva para pruebas visuales autorizadas. Un valor desconocido vuelve de forma segura a `demo`.

## Seguridad y operación — Iteración 2 completada

- El Worker aplica CSP con nonce, HSTS, `nosniff`, políticas de permisos y referencias, aislamiento de origen y `no-store` para HTML/JSON.
- La demo deniega iframes por defecto; `ALLOWED_FRAME_ANCESTORS` acepta únicamente orígenes HTTPS explícitos.
- La API devuelve `x-request-id` sin registrar el dato consultado ni el token Turnstile.
- La publicación D1 usa `staging`, versión y checksum antes de activar atómicamente un snapshot completo.
- Cloudflare Free limita la API a 5 solicitudes por 10 segundos por IP y aplica un bloqueo temporal al exceder el umbral.
- Workers Observability está habilitado sin logs de aplicación que contengan búsquedas o tokens.
- OWASP ZAP es bloqueante para alertas no aceptadas; CodeQL, Dependency Review, pruebas y build se ejecutan como controles del repositorio.

Las reglas WAF administradas no se habilitaron porque requieren un plan superior. Ningún recurso facturable fue necesario para completar esta iteración.

## Configuración

El archivo `.env.example` contiene solo configuración pública de ejemplo:

- `PUBLIC_BRAND_PROFILE`: `demo` o `cep-preview`.
- `PUBLIC_TURNSTILE_SITE_KEY`: clave pública de Turnstile.

Configuración de runtime:

- `TURNSTILE_SECRET_KEY`: secreto del Worker; nunca debe guardarse en Git.
- `ALLOWED_FRAME_ANCESTORS`: lista opcional, separada por comas, de orígenes HTTPS autorizados para iframe.
- `DB`: binding D1 de la proyección pública.

R2 no está declarado ni habilitado. Si posteriormente se autoriza para fotografías, deberá evaluarse y documentarse antes de añadir el binding.

El MVP no usa login, RENIEC/PIDE, OTP, correo, Redis, Keycloak, Kubernetes ni microservicios.
