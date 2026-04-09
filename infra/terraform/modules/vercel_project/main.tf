terraform {
  required_providers {
    vercel = {
      source = "vercel/vercel"
    }
  }
}

resource "vercel_project" "this" {
  name             = var.name
  framework        = var.framework
  root_directory   = var.root_directory
}

resource "vercel_project_environment_variable" "env" {
  for_each   = var.envs
  project_id = vercel_project.this.id
  key        = each.key
  value      = each.value
  target     = ["production", "preview"]
}
