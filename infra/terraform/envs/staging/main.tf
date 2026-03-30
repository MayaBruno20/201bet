module "neon" {
  source       = "../../modules/neon"
  project_name = "201bet-staging"
  branch_name  = "staging"
  db_name      = "betdb"
  role_name    = "betuser"
}

module "upstash" {
  source = "../../modules/upstash"
  name   = "201bet-staging"
  region = "global"
  primary_region = "us-east-1"
}

module "vercel" {
  source    = "../../modules/vercel_project"
  name      = var.vercel_project_name
  framework = "nextjs"
  envs = {
    NEXT_PUBLIC_API_URL = "https://${var.fly_app_name}.fly.dev/api"
    NEXT_PUBLIC_WS_URL  = "https://${var.fly_app_name}.fly.dev/realtime"
  }
}

module "gha" {
  source  = "../../modules/github_actions"
  count   = var.enable_github_secrets ? 1 : 0
  repo    = var.github_repo
  secrets = {
    FLY_API_TOKEN_STAGING = var.fly_api_token
    FLY_APP_NAME_STAGING  = var.fly_app_name
  }
}
