variable "account_id" {
  description = "Identificador de la cuenta de Cloudflare."
  type        = string
}

variable "zone_id" {
  description = "Identificador de la zona yersongallardo.com."
  type        = string
}

variable "demo_hostname" {
  description = "Hostname publico de la demostración."
  type        = string
  default     = "enfermeros-demo.yersongallardo.com"
}

variable "worker_name" {
  description = "Nombre del Worker desplegado por wrangler. Terraform no gestiona su código, solo la ruta que lo publica."
  type        = string
  default     = "conoce-tu-enfermero-demo"
}
