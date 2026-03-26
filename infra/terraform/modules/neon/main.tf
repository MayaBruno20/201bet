terraform {
  required_providers {
    neon = {
      source = "kislerdm/neon"
    }
  }
}

resource "neon_project" "this" {
  name           = var.project_name
  store_password = "yes"
  allowed_ips = length(var.allowed_ips) > 0 ? var.allowed_ips : null
  allowed_ips_protected_branches_only = var.allowed_ips_protected_branches_only
  block_public_connections = var.block_public_connections

  branch {
    name          = var.branch_name
    database_name = var.db_name
    role_name     = var.role_name
  }
}
