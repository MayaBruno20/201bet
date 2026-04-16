# Variáveis dos providers em shared/ (usadas por providers.tf).
# Os roots reais continuam em envs/staging e envs/production com tfvars próprios.

variable "neon_api_key" {
  type      = string
  sensitive = true
}

variable "upstash_api_key" {
  type      = string
  sensitive = true
}

variable "upstash_email" {
  type = string
}

variable "vercel_api_token" {
  type      = string
  sensitive = true
}

variable "github_token" {
  type      = string
  sensitive = true
}

variable "github_owner" {
  type = string
}
