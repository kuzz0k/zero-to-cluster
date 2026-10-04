import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query"

import type { ApiError } from "../types"

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1",
  prepareHeaders: (headers) => {
    headers.set("Content-Type", "application/json")
    return headers
  },
})

const baseQueryWithErrors: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError | ApiError
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions)
  if (result.error) {
    const data = result.error.data as { error?: ApiError } | undefined
    if (data?.error) {
      return { error: data.error }
    }
  }
  return result
}

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithErrors,
  tagTypes: ["Post"],
  endpoints: () => ({}),
})
