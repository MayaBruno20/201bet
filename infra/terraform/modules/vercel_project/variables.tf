variable "name" { type = string }
variable "framework" { type = string }
variable "envs" { type = map(string) }

# Monorepo: o build na Vercel corre nesta pasta (onde está o package.json com "next").
variable "root_directory" {
  type        = string
  description = "Caminho relativo no repositório até à app Next.js."
  default     = "apps/frontend"
}
