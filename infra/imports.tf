# La configuracion ya existe en produccion. Se incorpora con bloques import
# para que Terraform la adopte sin recrearla: recrear la regla de limite abre
# una ventana sin proteccion y recrear el registro DNS provoca corte.

import {
  to = cloudflare_ruleset.rate_limit
  id = "zones/${var.zone_id}/d049c6a7d11843329646fe6b488072e7"
}

import {
  to = cloudflare_dns_record.demo
  id = "${var.zone_id}/a9622661ad9b80c8fcf5850450795b3a"
}

import {
  to = cloudflare_workers_route.demo
  id = "${var.zone_id}/9d068789203f4213b22c5499dda5a8b4"
}

import {
  to = cloudflare_turnstile_widget.demo
  id = "${var.account_id}/0x4AAAAAAELgOttEQExh7l1W"
}

import {
  to = cloudflare_zone_setting.always_use_https
  id = "${var.zone_id}/always_use_https"
}

import {
  to = cloudflare_zone_setting.min_tls_version
  id = "${var.zone_id}/min_tls_version"
}

import {
  to = cloudflare_zone_setting.ssl
  id = "${var.zone_id}/ssl"
}
