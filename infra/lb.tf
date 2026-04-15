# ── Reserve a global static IP ────────────────────────────────────
resource "google_compute_global_address" "coms_portal" {
  name = "coms-portal-lb-ip"
}

# ── Google-managed SSL certificate ────────────────────────────────
resource "google_compute_managed_ssl_certificate" "coms_portal" {
  name = "coms-portal-ssl-cert"

  managed {
    domains = [var.domain]
  }
}

# ── Serverless NEG → Cloud Run ────────────────────────────────────
resource "google_compute_region_network_endpoint_group" "coms_portal" {
  name                  = "coms-portal-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.coms_portal.name
  }
}

# ── Backend service ───────────────────────────────────────────────
resource "google_compute_backend_service" "coms_portal" {
  name                  = "coms-portal-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"

  backend {
    group = google_compute_region_network_endpoint_group.coms_portal.id
  }
}

# ── URL map with path routing ─────────────────────────────────────
resource "google_compute_url_map" "coms_portal" {
  name            = "coms-portal-url-map"
  default_service = google_compute_backend_service.coms_portal.id

  # /heroes/* and /fast/* stubs — wire up when those services are ready
  # host_rule {
  #   hosts        = [var.domain]
  #   path_matcher = "paths"
  # }
  # path_matcher {
  #   name            = "paths"
  #   default_service = google_compute_backend_service.coms_portal.id
  #   path_rule {
  #     paths   = ["/heroes", "/heroes/*"]
  #     service = google_compute_backend_service.heroes.id
  #   }
  #   path_rule {
  #     paths   = ["/fast", "/fast/*"]
  #     service = google_compute_backend_service.fast.id
  #   }
  # }
}

# ── HTTPS proxy ───────────────────────────────────────────────────
resource "google_compute_target_https_proxy" "coms_portal" {
  name             = "coms-portal-https-proxy"
  url_map          = google_compute_url_map.coms_portal.id
  ssl_certificates = [google_compute_managed_ssl_certificate.coms_portal.id]
}

# ── Forwarding rule (HTTPS) ──────────────────────────────────────
resource "google_compute_global_forwarding_rule" "coms_portal" {
  name                  = "coms-portal-forwarding-rule"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_https_proxy.coms_portal.id
  ip_address            = google_compute_global_address.coms_portal.address
  port_range            = "443"
}

# ── HTTP → HTTPS redirect ────────────────────────────────────────
resource "google_compute_url_map" "http_redirect" {
  name = "coms-portal-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http_redirect" {
  name    = "coms-portal-http-redirect-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http_redirect" {
  name                  = "coms-portal-http-redirect-rule"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_http_proxy.http_redirect.id
  ip_address            = google_compute_global_address.coms_portal.address
  port_range            = "80"
}
