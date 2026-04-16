variable "neon_api_key" { type = string }
variable "upstash_api_key" { type = string }
variable "upstash_email" { type = string }

variable "create_upstash_redis" {
  type        = bool
  description = "Se false, não cria Redis via Terraform; use upstash_rest_url e upstash_rest_token (ex.: free tier com 1 database)."
  default     = true
}

variable "upstash_rest_url" {
  type        = string
  description = "Obrigatório se create_upstash_redis = false. URL REST no console Upstash (ex.: https://xxx.upstash.io)."
  default     = ""
}

variable "upstash_rest_token" {
  type        = string
  sensitive   = true
  description = "Obrigatório se create_upstash_redis = false. Token REST no console Upstash."
  default     = ""
}
variable "vercel_api_token" { type = string }
variable "github_token" { type = string }
variable "github_owner" { type = string }
variable "github_repo" { type = string }
variable "enable_github_secrets" {
  type    = bool
  default = true
}

variable "jwt_secret" { type = string }
variable "jwt_expires_in" {
  type        = string
  description = "JWT_EXPIRES_IN enviado ao backend (ex.: 8h)."
  default     = "8h"
}
variable "cors_origin" { type = string }
variable "vercel_project_name" { type = string }

variable "backend_public_url" {
  type        = string
  description = "URL base pública do backend (ex.: https://api.onrender.com), sem /api. Obrigatória se enable_render_web_service = false."
  default     = ""
}

# --- Render (opcional, via Terraform) ---
variable "enable_render_web_service" {
  type        = bool
  description = "Se true, cria render_web_service. Exige RENDER_API_KEY e RENDER_OWNER_ID no ambiente no momento do apply."
  default     = false
}

variable "render_api_key" {
  type        = string
  sensitive   = true
  description = "Opcional: para gravar em GitHub Actions secrets. O provider Render usa a variável de ambiente RENDER_API_KEY no apply."
  default     = ""
}

variable "render_owner_id" {
  type        = string
  description = "Opcional: GitHub secret. O provider usa RENDER_OWNER_ID no ambiente no apply."
  default     = ""
}

variable "render_service_name" {
  type        = string
  description = "Nome do Web Service no Render."
  default     = "201bet-backend-prod"
}

variable "render_plan" {
  type        = string
  description = "Plano do serviço (starter, standard, ...)."
  default     = "starter"
}

variable "render_region" {
  type        = string
  description = "frankfurt | ohio | oregon | singapore | virginia"
  default     = "oregon"
}

variable "render_git_repo_url" {
  type        = string
  description = "HTTPS do repositório (ex.: https://github.com/org/201bet). Tem de ser o mesmo repo que o Render/GitHub conseguem clonar; confirme com git remote get-url origin."
  default     = ""
}

variable "render_git_branch" {
  type        = string
  default     = "main"
}

variable "render_dockerfile_path" {
  type    = string
  default = "infra/backend.Dockerfile"
}

variable "render_docker_context" {
  type    = string
  default = "."
}

variable "render_auto_deploy" {
  type    = bool
  default = true
}

variable "render_additional_env" {
  type        = map(string)
  sensitive   = true
  description = "Variáveis extras no Web Service (ex.: VALUT_*, VALUT_WEBHOOK_SECRET, GOOGLE_CLIENT_ID, MARKET_SIMULATION_LEADER)."
  default     = {}
}
