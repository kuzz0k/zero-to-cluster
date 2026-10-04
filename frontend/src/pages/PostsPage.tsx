import { useState } from "react"

import { PostForm } from "../components/PostForm"
import { PostItem } from "../components/PostItem"
import { ErrorMessage } from "../components/ErrorMessage"
import { useCreatePostMutation, useListPostsQuery } from "../services/posts"
import type { PostCreate } from "../types"

export default function PostsPage() {
  const { data: posts, isLoading, error } = useListPostsQuery()
  const [createPost, createState] = useCreatePostMutation()
  const [formKey, setFormKey] = useState(0)

  const handleCreate = async (data: PostCreate) => {
    try {
      await createPost(data).unwrap()
      setFormKey((k) => k + 1) // remount формы → очистка полей
    } catch {
      /* ошибка отрисуется ниже */
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-3xl font-bold text-gray-900">Posts</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">Create post</h2>
        <PostForm
          key={formKey}
          submitLabel="Create"
          isSubmitting={createState.isLoading}
          onSubmit={handleCreate}
        />
        {createState.error && <ErrorMessage error={createState.error} className="mt-3" />}
      </section>

      <section className="space-y-3">
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <ErrorMessage error={error} />}
        {posts && posts.length === 0 && (
          <p className="text-sm text-gray-500">No posts yet. Create the first one.</p>
        )}
        {posts?.map((p) => (
          <PostItem key={p.id} post={p} />
        ))}
      </section>
    </div>
  )
}
