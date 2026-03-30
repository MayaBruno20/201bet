output "rest_url" {
  description = "URL REST do Redis (UPSTASH_REDIS_REST_URL)."
  value       = "https://${upstash_redis_database.this.endpoint}"
}

output "rest_token" {
  description = "Token REST (UPSTASH_REDIS_REST_TOKEN)."
  value       = upstash_redis_database.this.rest_token
  sensitive   = true
}

output "endpoint" {
  description = "Hostname Redis (sem esquema)."
  value       = upstash_redis_database.this.endpoint
}
