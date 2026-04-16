output "id" {
  value       = render_web_service.this.id
  description = "ID do serviço no Render (srv-...)."
}

output "url" {
  value       = render_web_service.this.url
  description = "URL pública HTTPS do serviço (sem barra final)."
}

output "slug" {
  value       = render_web_service.this.slug
  description = "Slug do serviço."
}
