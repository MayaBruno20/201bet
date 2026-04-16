terraform {
  required_version = ">= 1.6.0"
  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = ">= 0.13.0"
    }
    upstash = {
      source  = "upstash/upstash"
      version = "~> 1.2"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.10"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.4"
    }
    render = {
      source  = "render-oss/render"
      version = "~> 1.8"
    }
  }
}

provider "neon" {
  api_key = var.neon_api_key
}

provider "upstash" {
  api_key = var.upstash_api_key
  email   = var.upstash_email
}


provider "vercel" {
  api_token = var.vercel_api_token
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}

# Credenciais via ambiente: RENDER_API_KEY e RENDER_OWNER_ID (obrigatórias só se enable_render_web_service = true no apply).
provider "render" {}
