terraform {
  required_providers {
    fly = {
      source = "fly-apps/fly"
    }
  }
}

resource "fly_app" "this" {
  name           = var.app_name
  org            = "personal"
}
