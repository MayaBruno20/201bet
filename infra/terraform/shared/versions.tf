terraform {
  required_version = ">= 1.6.0"
  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = ">= 0.13.0"
    }
    upstash = {
      source  = "upstash/upstash"
      version = "~> 1.2"
    }
    fly = {
      source  = "fly-apps/fly"
      version = "~> 0.0.23"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.10"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.4"
    }
  }
}
