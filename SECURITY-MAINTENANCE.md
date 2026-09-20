# Mantenimiento de seguridad

Este documento publica evidencia de mantenimiento del proyecto sin divulgar
payloads, secretos, rutas de evasión ni instrucciones de explotación. Los
detalles que puedan facilitar abuso se gestionan mediante el canal privado
definido en [`SECURITY.md`](SECURITY.md).

## Auditoría del 19 y 20 de septiembre de 2026

Auditoría de seguridad aplicando una metodología pública externa,
[`cloudflare/security-audit-skill`](https://github.com/cloudflare/security-audit-skill),
sobre la totalidad del código versionado. Lectura de fuente únicamente: no se
ejercitó el despliegue ni se probó contra el dominio público, conforme a las
reglas de investigación segura de [`SECURITY.md`](SECURITY.md).

Alcance revisado:

- Worker, cabeceras de seguridad y API pública;
- validación de entrada, verificación anti-bots y proyección D1;
- CLI de ingesta y validación de snapshots canónicos;
- configuración del borde declarada en `infra/`;
- workflows, cadena de suministro y contratos publicados;
- exclusiones del repositorio público.

**Resultado: ninguna vulnerabilidad explotable.** Los hallazgos fueron de
aseguramiento de controles, de endurecimiento y de coherencia entre lo
documentado y lo implementado.

Endurecimientos integrados, en diez pull requests:

- la verificación anti-bots en servidor pasa a comprobarse por comportamiento
  —con `fetch` inyectado y casos de éxito, rechazo, anfitrión y acción
  divergentes, error de transporte y configuración ausente— en lugar de por
  inspección del código;
- una sola fuente de verdad para el esquema D1: la ingesta deja de declararlo y
  se detiene si a la base le falta alguna invariante, en vez de emitir un DDL
  que sobre una base existente no tenía efecto;
- el endpoint de optimización de imágenes conserva su política de contenidos
  propia, más estrecha que la general;
- validación del certificado de origen en el borde, sumada al mínimo de TLS y a
  la redirección a HTTPS ya vigentes;
- identificadores de cuenta fuera del repositorio público, inyectados en el
  despliegue desde una variable del entorno protegido;
- ficheros de plan de Terraform excluidos del control de versiones;
- contrato público alineado con la implementación en el método no permitido y
  en la medición de longitudes.

Límites aceptados y registrados como tales, no como pendientes:

- el pipeline no aplica migraciones de la base, porque su credencial no tiene
  permiso sobre ella y ampliarlo convertiría un token que solo publica código
  en otro capaz de reescribir el padrón;
- la regla de límite de peticiones no admite acotarse por anfitrión en el plan
  gratuito.

Evidencia exigida antes de integrar, además de la ya vigente:

- verificación por mutación de los controles con prueba nueva: deshacer la
  corrección hace fallar la prueba correspondiente y solo esa;
- comprobación posterior al despliegue del estado real del esquema y de la
  configuración del borde.

## Revisión del 16 de agosto de 2026

Alcance revisado:

- dependencias directas y transitivas del lockfile;
- artefacto Worker y API pública;
- Turnstile, validación de entrada y proyección D1;
- workflows GitHub Actions, SAST, SCA, secretos y DAST;
- protección de `main` y configuración de reporte responsable.

Remediaciones:

- React, React DOM y React Server Components actualizados a `19.2.8` y
  desplegados para corregir el aviso de disponibilidad publicado en julio;
- Vite, Vinext, Wrangler y el plugin oficial de Cloudflare actualizados como
  una unidad compatible;
- lockfile completo sin vulnerabilidades conocidas al cierre de la revisión;
- Turnstile fail-closed con hostname, acción y timeout validados en servidor;
- límites de cuerpo y contrato JSON cerrado en la API;
- fotografías externas restringidas a hosts aprobados e invariantes D1
  reforzadas;
- Actions de terceros fijadas a commits completos y auditoría SCA ampliada a
  todo el lockfile;
- smoke HTTP de bajo volumen como control compensatorio del baseline ZAP.

Evidencia exigida antes de integrar:

- generación y equivalencia de datos sintéticos;
- `pnpm audit --audit-level moderate` sin avisos conocidos de severidad
  moderada o superior;
- lint, build y pruebas automatizadas;
- Dependency Review y CodeQL aprobados;
- smoke HTTP y nuevo baseline DAST posteriores al despliegue.

Las versiones exactas y el historial de cambios permanecen trazables en
`package.json`, `pnpm-lock.yaml`, los pull requests y GitHub Actions.
