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

provider "render" {
  api_key  = var.enable_render_web_service ? var.render_api_key : "render-disabled"
  owner_id = var.enable_render_web_service ? var.render_owner_id : "render-disabled"
}
