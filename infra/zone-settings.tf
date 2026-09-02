# ATENCION: los ajustes de zona son de toda la zona yersongallardo.com, no
# solo del subdominio de la demostracion. Cambiar cualquiera de estos afecta
# tambien al sitio personal alojado en el mismo dominio.
#
# Se importan con su valor actual, no con el valor deseado: el objetivo de
# esta iteracion es que el plan salga sin cambios. Las correcciones van en un
# cambio aparte, para que queden como diff revisable.

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.zone_id
  setting_id = "always_use_https"
  value      = "off"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.zone_id
  setting_id = "min_tls_version"
  value      = "1.0"
}

resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.zone_id
  setting_id = "ssl"
  value      = "full"
}
