variable "neon_api_key" { type = string }
variable "upstash_api_key" { type = string }
variable "upstash_email" { type = string }
variable "upstash_rest_url" { type = string }
variable "upstash_rest_token" { type = string }
variable "fly_api_token" { type = string }
variable "vercel_api_token" { type = string }
variable "github_token" { type = string }
variable "github_owner" { type = string }
variable "github_repo" { type = string }
variable "enable_github_secrets" {
  type    = bool
  default = true
}

variable "jwt_secret" { type = string }
variable "cors_origin" { type = string }
variable "vercel_project_name" { type = string }
variable "fly_app_name" { type = string }
