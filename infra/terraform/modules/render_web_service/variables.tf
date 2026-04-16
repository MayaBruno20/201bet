variable "service_name" {
  type        = string
  description = "Nome do Web Service no Render (ex.: 201bet-backend-prod)."
}

variable "plan" {
  type        = string
  description = "Plano Render: starter, standard, pro, etc. Instâncias gratuitas costumam ser criadas pelo dashboard; via API/TF costuma exigir plano pago."
  default     = "starter"
}

variable "region" {
  type        = string
  description = "Região: frankfurt, ohio, oregon, singapore, virginia."
  default     = "oregon"
}

variable "git_repo_url" {
  type        = string
  description = "URL HTTPS do repositório (ex.: https://github.com/org/201bet)."
}

variable "git_branch" {
  type        = string
  description = "Branch para build e deploy."
  default     = "main"
}

variable "dockerfile_path" {
  type        = string
  description = "Caminho do Dockerfile a partir da raiz do repositório."
  default     = "infra/backend.Dockerfile"
}

variable "docker_context" {
  type        = string
  description = "Contexto de build Docker (raiz do monorepo = .)."
  default     = "."
}

variable "auto_deploy" {
  type        = bool
  description = "Deploy automático a cada push na branch."
  default     = true
}

variable "health_check_path" {
  type        = string
  description = "Caminho HTTP que retorna 200 (Nest usa prefixo global api)."
  default     = "/api/health"
}

variable "pre_deploy_command" {
  type        = string
  description = "Comando antes de iniciar o serviço (migrações Prisma)."
  default     = "npx prisma migrate deploy --schema prisma/schema.prisma"
}

variable "env_vars" {
  type = map(object({
    value = string
  }))
  description = "Variáveis de ambiente no formato exigido pelo provider Render (value por chave)."
  sensitive   = true
}

variable "disk_size_gb" {
  type        = number
  default     = null
  description = "Se definido, anexa um disco persistente (GB)."
}

variable "disk_name" {
  type        = string
  default     = "data"
}

variable "disk_mount_path" {
  type        = string
  default     = "/data"
}
