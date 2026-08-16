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
pnpm run data:import:check
pnpm run data:local:init
pnpm run lint
pnpm run test
pnpm run dev
```

`data:demo` genera el mismo padrón sintético desde tres orígenes simulados: JSON/exportación de base de datos, CSV y API/NDJSON. `data:verify` comprueba que los snapshots y checksums sean equivalentes, que no existan CEP duplicados y que no aparezcan campos personales fuera del contrato público.

Los datos de `data/demo/` son ficticios y no representan colegiados reales. Puede probar la consulta con el número CEP `00001`.

`data:import:check` valida el snapshot y el plan de lotes sin usar red. `data:local:init` genera temporalmente un SQL estático solo con fixtures sintéticos, lo carga mediante Wrangler en D1 local y elimina el archivo temporal al terminar.

## Estado funcional

La ruta `POST /api/v1/consulta` consulta exclusivamente la proyección D1 activa. Admite número CEP exacto de 5 o 6 dígitos o nombre completo normalizado, devuelve como máximo cinco coincidencias y no ofrece listados, comodines, paginación ni exportaciones.

Turnstile falla de forma cerrada en todos los entornos. Para desarrollo local se deben usar las claves dummy publicadas por Cloudflare en un `.dev.vars` ignorado; no existe un token especial aceptado por el código. En el dominio público, `TURNSTILE_SECRET_KEY` permanece exclusivamente en los secretos del Worker y Siteverify debe acreditar el hostname y la acción configurados.

La identidad se selecciona durante el build mediante `PUBLIC_BRAND_PROFILE`: `demo` es el perfil predeterminado y `cep-preview` se reserva para pruebas visuales autorizadas. Un valor desconocido vuelve de forma segura a `demo`.

## Seguridad y operación

- El Worker aplica CSP con nonce, HSTS, `nosniff`, políticas de permisos y referencias, aislamiento de origen y `no-store` para HTML/JSON.
- La demo deniega iframes por defecto; `ALLOWED_FRAME_ANCESTORS` acepta únicamente orígenes HTTPS explícitos.
- La API devuelve `x-request-id` sin registrar el dato consultado ni el token Turnstile.
- La API exige JSON, limita el cuerpo a 8 KiB, rechaza campos adicionales y acota el token Turnstile.
- La publicación D1 usa `staging`, versión y checksum antes de activar atómicamente un snapshot completo.
- Cloudflare Free limita la API a 5 solicitudes por 10 segundos por IP y aplica un bloqueo temporal al exceder el umbral.
- Workers Observability está habilitado sin logs de aplicación que contengan búsquedas o tokens.
- OWASP ZAP es bloqueante para alertas no aceptadas; CodeQL, Dependency Review, pruebas y build se ejecutan como controles del repositorio.

Las reglas WAF administradas no se habilitaron porque requieren un plan superior. La línea base vigente no necesitó recursos facturables adicionales.

## Configuración

El archivo `.env.example` contiene solo configuración pública de ejemplo:

- `PUBLIC_BRAND_PROFILE`: `demo` o `cep-preview`.
- `PUBLIC_TURNSTILE_SITE_KEY`: clave pública de Turnstile.

Configuración de runtime:

- `TURNSTILE_SECRET_KEY`: secreto del Worker; nunca debe guardarse en Git.
- `TURNSTILE_EXPECTED_HOSTNAME`: hostname exacto esperado en Siteverify.
- `TURNSTILE_EXPECTED_ACTION`: acción exacta esperada en Siteverify.
- `ALLOWED_FRAME_ANCESTORS`: lista opcional, separada por comas, de orígenes HTTPS autorizados para iframe.
- `DB`: binding D1 de la proyección pública.

La ingesta remota se ejecuta fuera del Worker mediante `scripts/data/import-d1.mjs`. Su modo predeterminado es `dry-run`; `--apply` exige confirmación exacta de la versión y `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_D1_DATABASE_ID` por entorno.

R2 no está declarado ni habilitado. Si posteriormente se autoriza para fotografías, deberá evaluarse y documentarse antes de añadir el binding.

El MVP no usa login, RENIEC/PIDE, OTP, correo, Redis, Keycloak, Kubernetes ni microservicios.
