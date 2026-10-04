import { baseApi } from "./baseApi"
import type { Post, PostCreate, PostUpdate, ListParams } from "../types"

export const postsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listPosts: builder.query<Post[], ListParams | void>({
      query: (params) => ({ url: "/posts", params: params ?? undefined }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Post" as const, id })),
              { type: "Post" as const, id: "LIST" },
            ]
          : [{ type: "Post" as const, id: "LIST" }],
    }),

    getPost: builder.query<Post, string>({
      query: (id) => `/posts/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Post", id }],
    }),

    createPost: builder.mutation<Post, PostCreate>({
      query: (body) => ({ url: "/posts", method: "POST", body }),
      invalidatesTags: [{ type: "Post", id: "LIST" }],
    }),

    updatePost: builder.mutation<Post, { id: string; body: PostUpdate }>({
      query: ({ id, body }) => ({ url: `/posts/${id}`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Post", id },
        { type: "Post", id: "LIST" },
      ],
    }),

    deletePost: builder.mutation<void, string>({
      query: (id) => ({ url: `/posts/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Post", id },
        { type: "Post", id: "LIST" },
      ],
    }),
  }),
})

export const {
  useListPostsQuery,
  useGetPostQuery,
  useCreatePostMutation,
  useUpdatePostMutation,
  useDeletePostMutation,
} = postsApi
