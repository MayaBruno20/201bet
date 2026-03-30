provider "neon" {
  api_key = var.neon_api_key
}

provider "upstash" {
  api_key = var.upstash_api_key
}

provider "fly" {
  api_token = var.fly_api_token
}

provider "vercel" {
  api_token = var.vercel_api_token
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}
