# ATENCION: los ajustes de zona son de toda la zona yersongallardo.com, no
# solo del subdominio de la demostracion. Cambiar cualquiera de estos afecta
# tambien al sitio personal alojado en el mismo dominio.
#
# Se importan con su valor actual, no con el valor deseado: el objetivo de
# esta iteracion es que el plan salga sin cambios. Las correcciones van en un
# cambio aparte, para que queden como diff revisable.

# Sin esto, una primera peticion en HTTP plano se sirve tal cual. El Worker
# envia HSTS, pero HSTS solo protege a partir de la segunda visita: la primera
# viaja sin cifrar. La redireccion en el borde cierra esa ventana.
resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.zone_id
  setting_id = "always_use_https"
  value      = "on"
}

# TLS 1.0 y 1.1 estan retirados desde 2021 y los marca en rojo cualquier
# analisis externo. 1.2 deja fuera clientes anteriores a 2013, irrelevantes
# para el publico de esta demostracion.
resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.zone_id
  setting_id = "min_tls_version"
  value      = "1.2"
}

resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.zone_id
  setting_id = "ssl"
  value      = "full"
}
