variable "pm_api_url" {
  type = string
}

variable "pm_api_token_id" {
  type = string
}

variable "pm_api_token_secret" {
  type      = string
  sensitive = true
}

variable "virtual_machines" {
  type = map(object({
    id     = number
    cores  = number
    memory = number
    size   = number
    ip     = string
  }))
}
