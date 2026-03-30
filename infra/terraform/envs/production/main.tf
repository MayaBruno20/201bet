module "neon" {
  source       = "../../modules/neon"
  project_name = "201bet-prod"
  branch_name  = "prod"
  db_name      = "betdb"
  role_name    = "betuser"
}

module "upstash" {
  source = "../../modules/upstash"
  name   = "201bet-prod"
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
    FLY_API_TOKEN_PROD = var.fly_api_token
    FLY_APP_NAME_PROD  = var.fly_app_name
    DATABASE_URL_PROD = module.neon.connection_uri
    UPSTASH_REDIS_REST_URL_PROD   = module.upstash.rest_url
    UPSTASH_REDIS_REST_TOKEN_PROD = module.upstash.rest_token
    JWT_SECRET_PROD   = var.jwt_secret
    CORS_ORIGIN_PROD  = var.cors_origin
  }
}
