# Infraestructura del borde

Configuracion de Cloudflare como codigo. Cubre lo que hasta ahora vivia
unicamente en el panel y no era ni reproducible ni auditable: reglas de rate
limiting y WAF, DNS, ajustes de zona, el widget de Turnstile y la ruta del
Worker.

## Que gestiona cada herramienta

El reparto es estricto a proposito. Dos herramientas compitiendo por el mismo
recurso terminan borrandose la configuracion entre despliegues.

| Recurso                        | Dueno      |
| ------------------------------ | ---------- |
| Rate limiting, WAF             | Terraform  |
| DNS, ajustes de zona, TLS      | Terraform  |
| Widget de Turnstile            | Terraform  |
| Ruta y dominio del Worker      | Terraform  |
| Codigo del Worker              | `wrangler` |
| Bindings del Worker, vars      | `wrangler` |
| Esquema y migraciones de D1    | `drizzle`  |
| Contenido de D1                | `scripts/data` |

Terraform no toca el Worker ni el esquema de la base. Si un recurso aparece en
`wrangler.jsonc`, no se declara aqui.

## Estado

El estado vive en HCP Terraform, nunca en el repositorio. `terraform.tfstate`
guarda en claro todos los valores que Terraform lee, incluidos los secretos: un
estado confirmado en un repositorio publico es una filtracion, y en uno privado
sigue siendo un secreto versionado de forma permanente.

`.gitignore` bloquea el estado y los `.tfvars` como red de seguridad, no como
permiso.

## Credenciales

El token se lee de `CLOUDFLARE_API_TOKEN` en el entorno. No se declara como
variable de Terraform para que no pueda acabar en un `.tfvars` por descuido, y
no se escribe en ningun fichero del repositorio.

Se usan dos tokens distintos con permisos minimos: uno de solo lectura para
inspeccionar y planificar, y uno de escritura acotado a esta zona y esta cuenta
para aplicar.

## Recursos existentes

La configuracion actual del panel se incorpora con bloques `import`, no
recreando recursos. Recrear una regla de rate limiting abre una ventana sin
proteccion, y recrear un registro DNS provoca corte de servicio.

## Alcance dentro de la zona

La zona `yersongallardo.com` aloja tambien el sitio personal. Terraform declara
unicamente los recursos de la demostracion —su registro DNS, su ruta de Worker,
su widget de Turnstile y la regla de limite que protege su API— y deja fuera los
registros del sitio personal.

Los ajustes de zona son la excepcion y merecen atencion: aplican a todo el
dominio, no solo al subdominio de la demostracion. Un cambio en
`min_tls_version` afecta igualmente al sitio personal.

## Uso

    cd infra
    terraform init
    terraform plan

Un `plan` limpio sobre la infraestructura existente —sin cambios pendientes— es
la senal de que la importacion refleja la realidad. Ese es el objetivo de la
primera iteracion: describir lo que ya hay, no cambiarlo.
