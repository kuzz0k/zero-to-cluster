import type { ApiError, ValidationDetail } from "../types"

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const e = error as ApiError & { data?: unknown }
    if (e.code === "validation_error" && Array.isArray(e.details)) {
      return (e.details as ValidationDetail[])
        .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
        .join("; ")
    }
    if (typeof e.message === "string") return e.message
    if ("data" in e) return extractMessage(e.data)
  }
  return "Something went wrong"
}

export function ErrorMessage({
  error,
  className = "",
}: {
  error: unknown
  className?: string
}) {
  return (
    <div
      className={`rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}
    >
      {extractMessage(error)}
    </div>
  )
}
