# Política de seguridad

## Versiones y superficies soportadas

Este repositorio mantiene únicamente la versión más reciente de la rama `main` y la demostración publicada en `https://enfermeros-demo.yersongallardo.com/`. No se mantienen versiones antiguas, forks ni despliegues de terceros.

La demo es un proyecto personal no oficial, utiliza datos sintéticos y no consulta sistemas reales del Colegio de Enfermeros del Perú (CEP).

Las dependencias soportadas son las fijadas por el lockfile de `main`. Los avisos altos o críticos confirmados se priorizan antes de cambios funcionales y su cierre se resume en [`SECURITY-MAINTENANCE.md`](SECURITY-MAINTENANCE.md).

## Reporte responsable

No publique vulnerabilidades, credenciales, tokens, datos personales ni instrucciones de explotación en un issue, discusión o pull request público.

Utilice [Report a vulnerability](https://github.com/ygallardops/conoce-tu-enfermero-demo/security/advisories/new) para enviar un aviso privado mediante GitHub Security Advisories. Incluya, cuando sea posible:

- componente o URL afectada;
- descripción e impacto esperado;
- pasos mínimos y reproducibles;
- evidencia no destructiva;
- versión, commit, navegador o entorno utilizado;
- propuesta de corrección, si dispone de una.

No incluya datos personales ni secretos reales en la evidencia. Los errores funcionales o de documentación que no tengan impacto de seguridad pueden reportarse mediante un issue público.

## Alcance de las pruebas

Están dentro de alcance:

- el código mantenido en este repositorio;
- la API `POST /api/v1/consulta` de la demo;
- el validador y CLI de ingesta D1, únicamente con snapshots sintéticos y sin ejecutar escrituras remotas no autorizadas;
- la configuración de seguridad y los workflows versionados;
- el dominio demo, mediante pruebas manuales de bajo volumen.

Están fuera de alcance:

- el portal, infraestructura, personal y sistemas oficiales del CEP;
- Cloudflare, GitHub, Turnstile y cualquier otro servicio de terceros;
- forks, copias o despliegues no administrados por este proyecto;
- integraciones futuras con padrón real, RENIEC/PIDE, pagos o constancias que no existen en esta demo;
- hallazgos basados únicamente en ausencia de WAF administrado, límites del plan gratuito o alertas ya aceptadas en `.zap/rules.tsv`, salvo que exista un impacto nuevo y reproducible.

## Reglas de investigación segura

- No realice denegación de servicio, pruebas de carga, scraping masivo ni enumeración automatizada.
- No intente eludir deliberadamente el rate limiting o Turnstile mediante redes distribuidas o identidades de terceros.
- No use ingeniería social, phishing, acceso físico ni ataques contra cuentas del responsable o proveedores.
- No persista acceso, modifique datos, descargue información innecesaria ni acceda a cuentas ajenas.
- Detenga la prueba y reporte de inmediato si encuentra credenciales, datos personales o acceso no previsto.
- Utilice exclusivamente los datos sintéticos de la demo y limite las solicitudes al mínimo necesario para demostrar el hallazgo.
- Coordine la divulgación pública antes de publicar detalles técnicos que puedan facilitar abuso.

La investigación de buena fe que respete estas reglas será tratada como un reporte responsable. Este proyecto no ofrece actualmente un programa de recompensas económicas.

## Tiempos objetivo

- Crítico: confirmación y evaluación inicial en un máximo de 24 horas.
- Alto: evaluación inicial en un máximo de 3 días hábiles.
- Medio o bajo: evaluación dentro del siguiente ciclo planificado.

Estos tiempos son objetivos de respuesta inicial, no compromisos de remediación. La prioridad final depende de la reproducibilidad, el impacto y la exposición real. Una credencial confirmada se revocará inmediatamente, sin esperar el análisis completo del incidente.

## Privacidad

La aplicación no requiere registro y no debe almacenar el dato consultado ni el token Turnstile en logs de aplicación. El CLI de ingesta tampoco debe imprimir registros, parámetros SQL ni credenciales. Las respuestas incluyen un identificador aleatorio de solicitud para soporte. La observabilidad se limita a metadatos operativos del Worker y a los controles del proveedor.

Si un registro sintético coincidiera accidentalmente con una persona real, repórtelo de forma privada para evaluar su sustitución sin publicar información personal.
