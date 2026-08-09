# Conoce a tu Enfermero

Reemplazo serverless y seguro del validador público de colegiatura y habilidad del Colegio de Enfermeros del Perú. El proyecto demuestra arquitectura Cloudflare, aislamiento de datos y DevSecOps Lean para una entidad con equipo técnico y presupuesto reducidos.

> Estado: Iteración 1 completada localmente. Todos los registros incluidos son sintéticos; este repositorio no emite verificaciones oficiales ni se encuentra desplegado.

Repositorio previsto: `conoce-tu-enfermero-demo`
Demo prevista: `https://enfermeros-demo.yersongallardo.com`

## Qué resuelve

- Consulta pública sin login por número CEP o nombre exacto.
- Proyección pública aislada del padrón maestro.
- Integración adaptable desde JSON, CSV, API o exportaciones de base de datos.
- Controles anti-enumeración y anti-scraping sin Redis ni infraestructura permanente.
- Pipeline de seguridad reproducible y de costo mínimo.

## Stack

- Cloudflare Pages/Workers, D1, R2, WAF y Turnstile.
- TypeScript, React, vinext, Drizzle ORM y SQLite/D1.
- pnpm y Node.js 22.
- GitHub Actions, CodeQL, Dependency Review, Dependabot, secret scanning y OWASP ZAP.

## Arquitectura

La aplicación pública consulta exclusivamente D1. El padrón maestro produce un snapshot mínimo mediante un adaptador interno; el lote se valida en staging y se activa atómicamente. No existe conexión pública hacia el sistema principal del CEP.

Los detalles operativos y las decisiones internas se mantienen fuera del repositorio público. Los contratos ejecutables versionados permiten revisar la interfaz y las restricciones aplicadas por el código.

## Ejecución local

```bash
cd app
corepack enable
pnpm install --frozen-lockfile
pnpm run data:demo
pnpm run data:verify
pnpm run test
```

## DevSecOps

Cada push o pull request ejecuta generación/verificación de datos, lint, pruebas, build, auditoría de dependencias, Dependency Review y CodeQL. OWASP ZAP queda condicionado a la variable `DEMO_BASE_URL` para analizar el entorno publicado sin romper el pipeline antes del primer despliegue.

## Identidad y uso de marca

La demostración utiliza una identidad visual propia inspirada en servicios públicos digitales. La arquitectura de presentación admite un perfil `cep-preview` para pruebas visuales autorizadas, pero el perfil público predeterminado siempre es `demo`. El cambio no duplica páginas ni lógica funcional.

## Alcance del MVP

El MVP reemplaza solamente `/validar/`; no reconstruye WordPress. No incorpora RENIEC/PIDE, login, OTP, pagos, cálculo de deuda, Redis, Keycloak, Kubernetes ni microservicios.

## Interfaces públicas

- [Contrato OpenAPI](openapi/consulta-api.yaml)
- [Esquema JSON del snapshot](contracts/padron-snapshot.schema.json)
- [Política de seguridad](SECURITY.md)

## Licencia

El contenido publicado se distribuye bajo la [licencia MIT](LICENSE). La licencia no concede derechos sobre nombres, logotipos o marcas de terceros.
