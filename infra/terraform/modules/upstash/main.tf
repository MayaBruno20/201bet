terraform {
  required_providers {
    upstash = {
      source = "upstash/upstash"
    }
  }
}

resource "upstash_redis_database" "this" {
  database_name = var.name
  region        = var.region
  primary_region = var.primary_region
  tls           = true
}
