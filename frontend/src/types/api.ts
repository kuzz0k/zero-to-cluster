export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export interface ValidationDetail {
  field: string
  message: string
  type: string
}
