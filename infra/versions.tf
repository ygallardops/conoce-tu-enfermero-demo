terraform {
  # Los bloques import declarativos requieren 1.5; se pide 1.9 por los
  # bloques de validación de variables usados mas adelante.
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # El estado guarda en claro todo valor que Terraform lee, incluidos los
  # secretos, así que no puede vivir en este repositorio ni en ningun otro.
  # La organizacion y el workspace se pasan por TF_CLOUD_ORGANIZATION y
  # TF_WORKSPACE para no fijar el nombre de la cuenta de estado en un
  # repositorio publico.
  cloud {}
}

# El token se lee de CLOUDFLARE_API_TOKEN. No se declara como variable para
# que no pueda acabar en un fichero .tfvars por descuido.
provider "cloudflare" {}
