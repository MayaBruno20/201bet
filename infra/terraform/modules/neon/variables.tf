variable "project_name" { type = string }
variable "branch_name" { type = string }
variable "db_name" { type = string }
variable "role_name" { type = string }
variable "allowed_ips" {
  type    = list(string)
  default = []
}
variable "allowed_ips_protected_branches_only" {
  type    = string
  default = "no"
}
variable "block_public_connections" {
  type    = string
  default = "no"
}
variable "history_retention_seconds" {
  type    = number
  default = 21600
}
