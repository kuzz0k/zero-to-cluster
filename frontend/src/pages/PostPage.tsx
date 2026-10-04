import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { PostForm } from "../components/PostForm"
import { ErrorMessage } from "../components/ErrorMessage"
import {
  useDeletePostMutation,
  useGetPostQuery,
  useUpdatePostMutation,
} from "../services/posts"
import type { PostCreate } from "../types"

export default function PostPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: post, isLoading, error } = useGetPostQuery(id!, { skip: !id })
  const [deletePost, deleteState] = useDeletePostMutation()
  const [updatePost, updateState] = useUpdatePostMutation()
  const [isEditing, setIsEditing] = useState(false)

  if (!id) return <div className="p-6">Invalid post id</div>
  if (isLoading) return <div className="p-6 text-gray-500">Loading…</div>
  if (error)
    return (
      <div className="p-6">
        <ErrorMessage error={error} />
      </div>
    )
  if (!post) return null

  const handleDelete = async () => {
    try {
      await deletePost(post.id).unwrap()
      navigate("/posts")
    } catch {
      /* ошибка отрисуется ниже */
    }
  }

  const handleUpdate = async (data: PostCreate) => {
    try {
      await updatePost({ id: post.id, body: data }).unwrap()
      setIsEditing(false)
    } catch {
      /* ошибка отрисуется ниже */
    }
  }

  const mutationError = deleteState.error ?? updateState.error

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link to="/posts" className="text-sm text-blue-600 hover:underline">
        ← Back to posts
      </Link>

      {isEditing ? (
        <div className="rounded-lg border border-blue-300 bg-white p-4 shadow-sm">
          <PostForm
            initial={post}
            submitLabel="Save"
            isSubmitting={updateState.isLoading}
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900">{post.title}</h1>
          <div className="mt-1 text-xs text-gray-500">
            Created {new Date(post.created_at).toLocaleString()} · Updated{" "}
            {new Date(post.updated_at).toLocaleString()}
          </div>
          <p className="mt-4 whitespace-pre-wrap text-gray-800">{post.content}</p>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteState.isLoading}
              className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleteState.isLoading ? "Deleting…" : "Delete"}
            </button>
          </div>
        </article>
      )}

      {mutationError && <ErrorMessage error={mutationError} />}
    </div>
  )
}
