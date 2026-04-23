locals {
  upstash_rest_url_value   = var.create_upstash_redis ? module.upstash[0].rest_url : trimsuffix(var.upstash_rest_url, "/")
  upstash_rest_token_value = var.create_upstash_redis ? module.upstash[0].rest_token : var.upstash_rest_token

  backend_http_origin = var.enable_render_web_service ? module.render_backend[0].url : trimsuffix(var.backend_public_url, "/")

  # Front (Vercel) e API (Render) em domínios diferentes: cookie SameSite=None; Secure (ver AUTH_COOKIE_SAMESITE no backend).
  render_env_plain = merge(
    {
      NODE_ENV                 = "production"
      DATABASE_URL             = module.neon.connection_uri
      JWT_SECRET               = var.jwt_secret
      JWT_EXPIRES_IN           = var.jwt_expires_in
      CORS_ORIGIN              = var.cors_origin
      FRONTEND_URL             = var.frontend_url
      AUTH_COOKIE_SAMESITE     = "none" # Vercel + Render: cookie em pedidos cross-site
      UPSTASH_REDIS_REST_URL   = local.upstash_rest_url_value
      UPSTASH_REDIS_REST_TOKEN = local.upstash_rest_token_value
      EMAIL_PROVIDER           = var.email_provider
      EMAIL_FROM_ADDRESS       = var.email_from_address
      EMAIL_FROM_NAME          = var.email_from_name
      EMAIL_REPLY_TO           = var.email_reply_to
      EMAIL_DAILY_LIMIT        = tostring(var.email_daily_limit)
      EMAIL_VERIFICATION_TTL_HOURS = tostring(var.email_verification_ttl_hours)
      PASSWORD_RESET_TTL_MINUTES   = tostring(var.password_reset_ttl_minutes)
      EMAIL_LOGO_URL           = var.email_logo_url
      QUOTAGUARDSTATIC_URL     = var.quotaguardstatic_url
    },
    var.render_additional_env,
  )

  render_env_vars = { for k, v in local.render_env_plain : k => { value = v } }
}

check "backend_origin_configured" {
  assert {
    condition     = var.enable_render_web_service || var.backend_public_url != ""
    error_message = "Defina backend_public_url (https://... sem /api) ou enable_render_web_service = true."
  }
}

check "render_managed_vs_manual_url" {
  assert {
    condition     = !(var.enable_render_web_service && trimspace(var.backend_public_url) != "")
    error_message = "Com enable_render_web_service = true, defina backend_public_url = \"\" (a origem vem do URL do Web Service no Render)."
  }
}

check "render_managed_requires_git" {
  assert {
    condition     = !var.enable_render_web_service || var.render_git_repo_url != ""
    error_message = "Com enable_render_web_service = true, preencha render_git_repo_url (HTTPS do repositório)."
  }
}

check "upstash_manual_when_no_resource" {
  assert {
    condition     = var.create_upstash_redis || (var.upstash_rest_url != "" && var.upstash_rest_token != "") || (!var.enable_render_web_service && !var.enable_github_secrets)
    error_message = "Com create_upstash_redis = false e enable_render_web_service ou enable_github_secrets = true, defina upstash_rest_url e upstash_rest_token (Upstash → REST API)."
  }
}

module "neon" {
  source       = "../../modules/neon"
  project_name = "201bet-staging"
  branch_name  = "staging"
  db_name      = "betdb"
  role_name    = "betuser"
}

module "upstash" {
  count = var.create_upstash_redis ? 1 : 0

  source         = "../../modules/upstash"
  name           = "201bet-staging"
  region         = "global"
  primary_region = "us-east-1"
}

module "render_backend" {
  count  = var.enable_render_web_service ? 1 : 0
  source = "../../modules/render_web_service"

  service_name    = var.render_service_name
  plan            = var.render_plan
  region          = var.render_region
  git_repo_url    = var.render_git_repo_url
  git_branch      = var.render_git_branch
  dockerfile_path = var.render_dockerfile_path
  docker_context  = var.render_docker_context
  auto_deploy     = var.render_auto_deploy
  env_vars        = local.render_env_vars
}

module "vercel" {
  source    = "../../modules/vercel_project"
  name      = var.vercel_project_name
  framework = "nextjs"
  envs = {
    NEXT_PUBLIC_API_URL = "${local.backend_http_origin}/api"
    NEXT_PUBLIC_WS_URL  = "${local.backend_http_origin}/realtime"
  }
}

module "gha" {
  source = "../../modules/github_actions"
  count  = var.enable_github_secrets ? 1 : 0
  repo   = var.github_repo
  secrets = merge(
    {
      DATABASE_URL_STAGING             = module.neon.connection_uri
      UPSTASH_REDIS_REST_URL_STAGING   = local.upstash_rest_url_value
      UPSTASH_REDIS_REST_TOKEN_STAGING = local.upstash_rest_token_value
      JWT_SECRET_STAGING               = var.jwt_secret
      CORS_ORIGIN_STAGING              = var.cors_origin
      FRONTEND_URL_STAGING             = var.frontend_url
      EMAIL_PROVIDER_STAGING           = var.email_provider
      EMAIL_FROM_ADDRESS_STAGING       = var.email_from_address
      EMAIL_FROM_NAME_STAGING          = var.email_from_name
      EMAIL_REPLY_TO_STAGING           = var.email_reply_to
      EMAIL_DAILY_LIMIT_STAGING        = tostring(var.email_daily_limit)
      EMAIL_VERIFICATION_TTL_HOURS_STAGING = tostring(var.email_verification_ttl_hours)
      PASSWORD_RESET_TTL_MINUTES_STAGING   = tostring(var.password_reset_ttl_minutes)
      EMAIL_LOGO_URL_STAGING           = var.email_logo_url
      QUOTAGUARDSTATIC_URL_STAGING     = var.quotaguardstatic_url
      BACKEND_HTTP_ORIGIN_STAGING      = local.backend_http_origin
    },
    var.enable_render_web_service && var.render_api_key != "" && var.render_owner_id != "" ? {
      RENDER_API_KEY_STAGING    = var.render_api_key
      RENDER_OWNER_ID_STAGING   = var.render_owner_id
      RENDER_SERVICE_ID_STAGING = module.render_backend[0].id
    } : {},
  )
}

output "backend_http_origin" {
  value       = local.backend_http_origin
  description = "Origem pública do backend (Render gerido pelo TF ou backend_public_url)."
}

output "render_web_service_id" {
  value       = try(module.render_backend[0].id, null)
  description = "ID do serviço Render quando enable_render_web_service = true."
}

output "vercel_project" {
  value = var.vercel_project_name
}

output "upstash_rest_url" {
  value = local.upstash_rest_url_value
}
