# Limite de peticiones de la API publica.
#
# En plan Free, Cloudflare cuenta por centro de datos: la caracteristica
# cf.colo.id forma parte de la clave, asi que el limite efectivo global es
# 5 peticiones por cada colo alcanzado, no 5 en total. Turnstile es la
# proteccion principal; este limite acota el abuso desde una sola ruta.
#
# ATENCION: este recurso es el ruleset de entrada de la fase http_ratelimit
# de toda la zona yersongallardo.com, no una regla suelta. El bloque rules es
# su contenido completo: cualquier regla de limite creada desde el panel
# desaparece en el siguiente apply, y lo unico que lo anuncia es una linea de
# plan. Toda regla de limite de la zona se declara aqui o no existe.
resource "cloudflare_ruleset" "rate_limit" {
  zone_id = var.zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_ratelimit"

  # La expresion acota por hostname ademas de por ruta. Sin http.host la regla
  # alcanzaria esa misma ruta en cualquier otro hostname de la zona, que es
  # compartida con el sitio personal.
  rules = [{
    action      = "block"
    description = "Consulta pública API — 5 por 10 s por IP"
    enabled     = true
    expression  = "(http.host eq \"${var.demo_hostname}\" and http.request.uri.path wildcard r\"/api/v1/consulta\")"

    ratelimit = {
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 10
      requests_per_period = 5
      mitigation_timeout  = 10
    }
  }]
}

# Registro del hostname de la demostracion. El contenido es 192.0.2.1
# (TEST-NET-1, RFC 5737): no existe origen real, todo el trafico lo atiende
# el Worker. El registro debe permanecer proxied o la ruta no se aplica.
resource "cloudflare_dns_record" "demo" {
  zone_id = var.zone_id
  name    = var.demo_hostname
  type    = "A"
  content = "192.0.2.1"
  proxied = true
  ttl     = 1
}

# Ruta que publica el Worker en el hostname. El codigo del Worker lo
# despliega wrangler; Terraform solo declara donde queda expuesto.
resource "cloudflare_workers_route" "demo" {
  zone_id = var.zone_id
  pattern = "${var.demo_hostname}/*"
  script  = var.worker_name
}

# Widget de Turnstile. La clave publica se consume en el cliente y ya figura
# en app/.env.example; el secreto no lo gestiona Terraform, vive en
# wrangler secret.
resource "cloudflare_turnstile_widget" "demo" {
  account_id = var.account_id
  name       = var.worker_name
  domains    = [var.demo_hostname]
  mode       = "managed"
}
