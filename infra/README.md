# Infraestructura del borde

Configuración de Cloudflare como código. Cubre lo que hasta ahora vivía
únicamente en el panel y no era ni reproducible ni auditable: la regla de rate
limiting, DNS, ajustes de zona, el widget de Turnstile y la ruta del
Worker.

## Qué gestiona cada herramienta

El reparto es estricto a propósito. Dos herramientas compitiendo por el mismo
recurso terminan borrándose la configuración entre despliegues.

| Recurso                        | Dueño      |
| ------------------------------ | ---------- |
| Regla de rate limiting         | Terraform, solo la observa |
| DNS, ajustes de zona, TLS      | Terraform  |
| Widget de Turnstile            | Terraform  |
| Ruta y dominio del Worker      | Terraform  |
| Código del Worker              | `wrangler` |
| Bindings del Worker, vars      | `wrangler` |
| Esquema y migraciones de D1    | `drizzle`  |
| Contenido de D1                | `scripts/data` |

Terraform no toca el Worker ni el esquema de la base. Si un recurso aparece en
`wrangler.jsonc`, no se declara aquí.

## Estado

El estado vive en HCP Terraform, nunca en el repositorio. `terraform.tfstate`
guarda en claro todos los valores que Terraform lee, incluidos los secretos: un
estado confirmado en un repositorio público es una filtración, y en uno privado
sigue siendo un secreto versionado de forma permanente.

`.gitignore` bloquea el estado y los `.tfvars` como red de seguridad, no como
permiso.

## Credenciales

El token se lee de `CLOUDFLARE_API_TOKEN` en el entorno. No se declara como
variable de Terraform para que no pueda acabar en un `.tfvars` por descuido, y
no se escribe en ningún fichero del repositorio.

Se usan dos tokens distintos con permisos mínimos: uno de solo lectura para
inspeccionar y planificar, y uno de escritura acotado a esta zona y esta cuenta
para aplicar.

Ninguno puede escribir la regla de rate limiting: el permiso `Zone WAF` va en
lectura, así que Terraform detecta su deriva pero no la corrige. Modificarla
exige el panel. El motivo está anotado en [`edge.tf`](edge.tf).

## Recursos existentes

La configuración que ya existía en el panel se incorporó con bloques `import`,
no recreando recursos. Recrear una regla de rate limiting abre una ventana sin
protección, y recrear un registro DNS provoca corte de servicio. Los bloques ya
no figuran en el código.

## Alcance dentro de la zona

La zona `yersongallardo.com` aloja también el sitio personal. Terraform declara
únicamente los recursos de la demostración —su registro DNS, su ruta de Worker,
su widget de Turnstile y la regla de límite que protege su API— y deja fuera los
registros del sitio personal.

Los ajustes de zona son la excepción y merecen atención: aplican a todo el
dominio, no solo al subdominio de la demostración. Un cambio en
`min_tls_version` afecta igualmente al sitio personal.

## Uso

Antes de empezar hacen falta, en el entorno, `CLOUDFLARE_API_TOKEN`,
`TF_CLOUD_ORGANIZATION` y `TF_WORKSPACE`; y `account_id` y `zone_id`, en un
`terraform.tfvars` copiado de
[`terraform.tfvars.example`](terraform.tfvars.example) o como variables del
workspace.

    cd infra
    terraform init
    terraform plan

Un `plan` limpio —sin cambios pendientes— es la señal de que el código refleja
la realidad. La primera iteración se limitó a describir lo que ya había; las
correcciones posteriores (redirección a HTTPS, TLS mínimo y `ssl` en `strict`)
entraron cada una como un cambio aparte.
