terraform {
  required_version = ">= 1.6.0"
  required_providers {
    render = {
      source  = "render-oss/render"
      version = "~> 1.8"
    }
  }
}

resource "render_web_service" "this" {
  name              = var.service_name
  plan              = var.plan
  region            = var.region
  health_check_path = var.health_check_path

  pre_deploy_command = var.pre_deploy_command

  runtime_source = {
    docker = {
      repo_url        = var.git_repo_url
      branch          = var.git_branch
      dockerfile_path = var.dockerfile_path
      context         = var.docker_context
      auto_deploy     = var.auto_deploy
    }
  }

  env_vars = var.env_vars

  disk = var.disk_size_gb == null ? null : {
    name       = var.disk_name
    size_gb    = var.disk_size_gb
    mount_path = var.disk_mount_path
  }
}
