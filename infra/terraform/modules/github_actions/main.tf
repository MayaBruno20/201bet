terraform {
  required_providers {
    github = {
      source = "integrations/github"
    }
  }
}

resource "github_actions_secret" "this" {
  for_each        = var.secrets
  repository      = var.repo
  secret_name     = each.key
  plaintext_value = each.value
}
