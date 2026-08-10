# Aplicación Conoce a tu Enfermero

Miniaplicación que sustituirá el validador legado del CEP. Esta carpeta contiene la UI/API Cloudflare, el esquema D1 y las herramientas de datos.

## Requisitos

- Node.js 22.13 o superior.
- pnpm o npm.

## Ejecución local

```bash
pnpm install
pnpm run data:demo
pnpm run data:verify
pnpm run db:generate
pnpm run build
pnpm run test
```

`data:demo` crea el mismo conjunto sintético en tres formatos de origen y normaliza cada uno. `data:verify` comprueba que los checksums sean idénticos, que no haya CEP duplicados y que no aparezcan campos personales fuera del contrato público.

Los datos generados en `data/demo/` son ficticios y no representan colegiados reales.

## Iteración 1

La ruta `POST /api/v1/consulta` inicializa una proyección D1 local con el
snapshot sintético cuando no existe un snapshot activo. La UI permite solo
consultas exactas por número CEP o nombre completo, devuelve como máximo cinco
coincidencias y no ofrece listados ni exportaciones.

En local se usa un marcador de Turnstile para conservar el contrato de la API.
En el dominio demo, el widget administrado se verifica en el servidor y su
secreto permanece exclusivamente en los secretos del Worker.

La identidad visual se selecciona durante el build con `PUBLIC_BRAND_PROFILE`:
`demo` (predeterminado) o `cep-preview` (solo pruebas autorizadas). El perfil
`demo` es siempre el valor seguro ante una configuración desconocida.

## Bindings activos

- `DB`: D1, proyección pública de solo lectura para consultas.

R2 no está declarado ni habilitado. Si se autoriza posteriormente para
fotografías, deberá evaluarse y documentarse antes de añadir el binding.

El MVP no usa login, RENIEC/PIDE, OTP, correo, Redis ni Keycloak.
