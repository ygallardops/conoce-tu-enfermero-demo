# ATENCION: los ajustes de zona son de toda la zona yersongallardo.com, no
# solo del subdominio de la demostracion. Cambiar cualquiera de estos afecta
# tambien al sitio personal alojado en el mismo dominio.
#
# Se importaron con su valor actual, no con el deseado, para que aquel plan
# saliera sin cambios. Las correcciones van en cambios aparte, cada una como
# diff revisable: always_use_https y min_tls_version el 2026-09-02, ssl el
# 2026-09-20.

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

# full cifra el tramo Cloudflare-origen pero no valida el certificado, asi que
# no distingue el origen legitimo de quien se interponga. strict lo valida.
#
# Para el hostname de la demostracion la diferencia es teorica: edge.tf apunta
# a 192.0.2.1 (TEST-NET-1) y la ruta del Worker atiende todas las peticiones,
# de modo que no existe tramo Cloudflare-origen. El ajuste es de zona y quien
# gana es el otro hostname, el sitio personal, cuyo origen presenta
# certificado valido —comprobado el 2026-09-20; era el dato que faltaba para
# poder subirlo y por el que estuvo en full hasta hoy—.
#
# Si alguna vez ese certificado caduca o deja de coincidir con el nombre,
# Cloudflare respondera 526 en ese sitio. La demostracion no se entera.
resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.zone_id
  setting_id = "ssl"
  value      = "strict"
}
