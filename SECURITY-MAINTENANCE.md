# Mantenimiento de seguridad

Este documento publica evidencia de mantenimiento del proyecto sin divulgar
payloads, secretos, rutas de evasión ni instrucciones de explotación. Los
detalles que puedan facilitar abuso se gestionan mediante el canal privado
definido en [`SECURITY.md`](SECURITY.md).

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
- `pnpm audit --audit-level low` sin avisos conocidos;
- lint, build y pruebas automatizadas;
- Dependency Review y CodeQL aprobados;
- smoke HTTP y nuevo baseline DAST posteriores al despliegue.

Las versiones exactas y el historial de cambios permanecen trazables en
`package.json`, `pnpm-lock.yaml`, los pull requests y GitHub Actions.
