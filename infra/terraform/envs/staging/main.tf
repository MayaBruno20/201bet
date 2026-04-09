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
    # CI (prisma migrate) e referência para configurar Fly secrets
    DATABASE_URL_STAGING = module.neon.connection_uri
    # Upstash por ambiente (evita sobrescrever no mesmo repo)
    UPSTASH_REDIS_REST_URL_STAGING   = module.upstash.rest_url
    UPSTASH_REDIS_REST_TOKEN_STAGING = module.upstash.rest_token
    JWT_SECRET_STAGING   = var.jwt_secret
    CORS_ORIGIN_STAGING  = var.cors_origin
  }
}
