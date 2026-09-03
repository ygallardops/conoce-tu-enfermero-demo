# Conoce a tu Enfermera(o)

[![DevSecOps](https://github.com/ygallardops/conoce-tu-enfermero-demo/actions/workflows/devsecops.yml/badge.svg)](https://github.com/ygallardops/conoce-tu-enfermero-demo/actions/workflows/devsecops.yml)
[![DAST](https://github.com/ygallardops/conoce-tu-enfermero-demo/actions/workflows/dast.yml/badge.svg)](https://github.com/ygallardops/conoce-tu-enfermero-demo/actions/workflows/dast.yml)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

Prototipo serverless y seguro para sustituir el validador público de colegiatura y habilidad del Colegio de Enfermeros del Perú (CEP). El proyecto demuestra una arquitectura Lean de bajo mantenimiento, aislamiento de datos y DevSecOps para una entidad con equipo técnico y presupuesto reducidos.

> **Demo personal no oficial.** La aplicación y su línea base de seguridad están desplegadas. Todos los nombres, fotografías y registros son sintéticos; el servicio no consulta el padrón real ni emite verificaciones oficiales.

[![Consulta pública de colegiatura en la demostración desplegada](.github/media/demo.png)](https://enfermeros-demo.yersongallardo.com/)

- [Abrir la demostración](https://enfermeros-demo.yersongallardo.com/)
- [Consultar el contrato OpenAPI](openapi/consulta-api.yaml)
- [Revisar la política de seguridad](SECURITY.md)

## Qué resuelve

- Consulta pública sin registro, login, DNI, RENIEC/PIDE ni creación de una base de datos de consultantes.
- Búsqueda exacta por número CEP de 5 o 6 dígitos —incluidos ceros iniciales— o por nombre completo normalizado.
- Respuestas de hasta cinco coincidencias con número CEP, nombre, consejo regional, habilidad, fecha de actualización y fotografía pública opcional.
- Proyección pública D1 aislada del padrón maestro; la aplicación nunca se conecta directamente al sistema institucional.
- Adaptadores demostrativos para JSON, CSV y API/NDJSON que producen el mismo snapshot canónico verificable.
- Controles anti-enumeración y anti-scraping sin Redis ni infraestructura permanente.

Para probar la demo puede utilizar el número CEP sintético `00001`.

## Arquitectura

```mermaid
flowchart LR
    U["Ciudadano"] --> E["Cloudflare Edge<br/>TLS, DDoS y rate limiting"]
    E --> W["Cloudflare Worker<br/>UI, API y cabeceras de seguridad"]
    W --> T["Turnstile<br/>verificación servidor a servidor"]
    W --> D["D1<br/>proyección pública"]

    O["Origen privado<br/>fase institucional"] --> A["Adaptador / exportación"]
    A --> S["Snapshot canónico<br/>validación y staging"]
    S --> D
```

La actualización prevista es unidireccional: origen privado → exportación mínima → validación → staging → activación atómica. Si la carga falla, el snapshot público anterior permanece activo. El origen real y sus credenciales quedan fuera de la aplicación pública.

## Seguridad implementada

- Turnstile obligatorio y fail-closed, con validación servidor a servidor de token, hostname y acción, además de timeout controlado.
- Consultas exactas, sin comodines, listados, paginación ni exportación; máximo cinco resultados.
- SQL preparado, JSON de esquema cerrado y límites explícitos de cuerpo, campos y longitudes.
- Rate limiting de Cloudflare Free en la API pública: 5 solicitudes por 10 segundos por IP y bloqueo temporal al exceder el umbral.
- CSP con nonce, HSTS, `nosniff`, políticas de permisos y referencias, protección de iframe y respuestas HTML/JSON con `no-store`.
- `x-request-id` para soporte sin registrar el término buscado ni el token de Turnstile.
- Publicación del padrón desde `staging` con versión, checksum e invariantes D1, seguida de activación atómica.
- Observabilidad nativa de Workers sin logs de aplicación que contengan búsquedas o tokens.

Las reglas WAF administradas no están habilitadas porque requieren un plan superior. R2 tampoco forma parte del despliegue actual. La línea base vigente no requirió crear recursos facturables.

## Stack

- Cloudflare Workers, D1, Turnstile y rate limiting de borde.
- TypeScript, React 19, vinext, Drizzle ORM y SQLite/D1.
- Node.js 22 y pnpm fijado mediante Corepack.
- GitHub Actions, CodeQL, Dependency Review, Dependabot, secret scanning y OWASP ZAP.
- Terraform para la configuración del borde, con estado remoto y proveedor fijado.

## DevSecOps

```mermaid
flowchart TD
    PR["Pull request"] --> Q["Lint, pruebas y build"]
    PR --> A["pnpm audit del lockfile"]
    PR --> S["CodeQL security-extended"]
    PR --> R["Dependency Review"]
    Q --> M["main protegida<br/>los cuatro checks son bloqueantes"]
    A --> M
    S --> M
    R --> M
    M --> AP{"Aprobación manual<br/>environment production"}
    AP --> B["Build y pruebas"]
    B --> SB["SBOM CycloneDX"]
    SB --> FP["Firma de procedencia"]
    FP --> DR["wrangler deploy --dry-run"]
    DR --> DP["Despliegue"]
    DP --> SM["Smoke HTTP<br/>contra el dominio real"]
    W(["Programado semanal"]) --> ZAP["OWASP ZAP Baseline"]
    W --> AU["Auditoría del lockfile"]
```

| Control | Ejecución | Comportamiento |
| --- | --- | --- |
| Datos, lint, pruebas y build | Push y pull request hacia `main` | Bloqueante |
| `pnpm audit` | Push y pull request | Revisa el lockfile completo y bloquea vulnerabilidades altas/críticas conocidas |
| Dependency Review | Pull request | Bloquea dependencias nuevas de severidad alta o crítica |
| CodeQL `security-extended` | Push y pull request | Ejecuta SAST; los hallazgos nuevos se revisan antes de integrar |
| Dependabot | Semanal | Propone actualizaciones de npm y GitHub Actions |
| OWASP ZAP Baseline + smoke HTTP | Semanal y manual | Bloquea alertas no aceptadas y verifica cabeceras/contrato de rutas críticas |
| Auditoría del lockfile programada | Semanal | Detecta avisos publicados con `main` en reposo, sin depender de que haya pull requests abiertas |
| Despliegue | Push a `main` que toque `app/` | Exige aprobación manual y verifica la demo publicada |

La rama `main` está protegida. Los cambios se integran mediante pull request y se someten a controles de calidad y seguridad. Las Actions externas se fijan a commits inmutables y Dependabot conserva comentarios de versión para proponer su renovación.

El proyecto publica un [registro de mantenimiento de seguridad](SECURITY-MAINTENANCE.md) con fechas, alcance y evidencia de remediación, sin incluir payloads, secretos ni instrucciones de explotación.

## Infraestructura y despliegue

La configuración del borde se declara como código en [`infra/`](infra/) con Terraform: la regla de rate limiting, el registro DNS de la demo, la ruta del Worker, el widget de Turnstile y los ajustes de zona. Un cambio hecho desde el panel de Cloudflare aparece como diferencia en el siguiente `terraform plan`, de modo que la configuración deja de ser un estado invisible.

Los recursos existentes se incorporaron mediante importación, sin recrearlos. El estado vive en un backend remoto con bloqueo y nunca en el repositorio: `terraform.tfstate` guarda en claro todo valor que Terraform lee.

El reparto de responsabilidades es estricto. Terraform no gestiona el Worker ni el esquema de la base: el código y sus bindings son de `wrangler` y las migraciones de Drizzle. Un recurso declarado en `wrangler.jsonc` no se declara en `infra/`.

Cada despliegue genera un SBOM en formato CycloneDX y firma la procedencia del bundle publicado, de modo que se puede verificar criptográficamente que salió de este repositorio, de un commit concreto y de este workflow. La verificación se hace con `gh attestation verify`.

El despliegue se ejecuta desde GitHub Actions contra un environment protegido que exige aprobación manual. Cada ejecución construye, pasa las pruebas, ensaya el despliegue en seco, publica y verifica la demo con un smoke HTTP contra el dominio real, dejando registro del commit y de la versión desplegada. Las credenciales son un token de mínimo privilegio guardado en el environment, no en el repositorio.

## Ejecución local

Requisitos: Node.js `22.13` o superior y Corepack disponible.

```bash
git clone https://github.com/ygallardops/conoce-tu-enfermero-demo.git
cd conoce-tu-enfermero-demo/app
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

`data:import:check` valida el plan de ingesta sin red ni credenciales. `data:local:init` carga exclusivamente el snapshot sintético en D1 local. `pnpm run test` compila la aplicación y ejecuta las pruebas automatizadas.

## Configuración

| Variable o secreto | Dónde vive | Uso |
| --- | --- | --- |
| `PUBLIC_BRAND_PROFILE` | Build | Perfil visual público: `demo` es el valor seguro predeterminado. |
| `PUBLIC_TURNSTILE_SITE_KEY` | Build | Clave pública del widget Turnstile. |
| `TURNSTILE_SECRET_KEY` | `wrangler secret` | Secreto del Worker para validar Turnstile; nunca se guarda en Git. |
| `TURNSTILE_EXPECTED_HOSTNAME` | `wrangler.jsonc` | Host público exacto que debe acreditar Siteverify. |
| `TURNSTILE_EXPECTED_ACTION` | `wrangler.jsonc` | Acción exacta esperada para la consulta pública. |
| `ALLOWED_FRAME_ANCESTORS` | `wrangler.jsonc` | Lista opcional de orígenes HTTPS autorizados para iframe; sin valor, se deniega la incrustación. |
| `DEMO_BASE_URL` | Variable de Actions | Variable de GitHub Actions para cambiar el destino del DAST. |
| `CLOUDFLARE_API_TOKEN` | Entorno local o environment | Secreto de privilegio mínimo usado únicamente por el CLI de ingesta remota. |
| `CLOUDFLARE_ACCOUNT_ID` | Entorno local o environment | Cuenta destino para una ingesta explícitamente autorizada. |
| `CLOUDFLARE_D1_DATABASE_ID` | Entorno local | Base D1 destino para una ingesta explícitamente autorizada. |

El ejemplo local está en [`app/.env.example`](app/.env.example). No copie secretos reales a archivos versionados.

La ingesta remota permanece desactivada por defecto. El CLI solo escribe cuando recibe `--apply`, la confirmación exacta de `dataset_version` y las tres variables Cloudflare; el modo normal es un `dry-run` local. No ejecute `--apply` contra la demo sin una autorización operativa explícita.

## Estado y próximos pasos

- Implementado: contratos ejecutables, esquema D1, datos sintéticos y adaptadores equivalentes.
- Desplegado: consulta accesible, D1, Turnstile y metadatos para vistas previas sociales.
- Operativo: cabeceras defensivas, publicación atómica, rate limiting, observabilidad, DAST bloqueante y protección de `main`.
- Plataforma: configuración del borde declarada en Terraform, despliegue continuo con aprobación manual, SBOM y firma de procedencia en cada publicación.
- Próximo paso institucional: adaptar el origen real, validar el catálogo oficial y preparar la sustitución controlada de `/validar/` cuando el CEP proporcione la información y autorizaciones necesarias.

## Alcance y uso de marca

El MVP reemplaza únicamente el validador legado `/validar/`; no reconstruye WordPress. No incorpora RENIEC/PIDE, cuentas, OTP, correo, pagos, cálculo de deuda, constancias firmadas, descargas masivas, Redis, Keycloak, Kubernetes ni microservicios.

La identidad visual es propia y está inspirada en servicios públicos digitales. Existe un perfil declarativo `cep-preview` para pruebas visuales autorizadas, pero `demo` es siempre el valor predeterminado y seguro. El repositorio no distribuye logotipos oficiales ni afirma representar al CEP.

## Contratos públicos

- [Contrato OpenAPI de consulta](openapi/consulta-api.yaml)
- [JSON Schema del snapshot](contracts/padron-snapshot.schema.json)
- [Política de seguridad](SECURITY.md)

## Licencia

El código publicado se distribuye bajo la [licencia MIT](LICENSE). La licencia no concede derechos sobre nombres, logotipos o marcas de terceros.
