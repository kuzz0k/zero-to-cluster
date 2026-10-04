import { useState } from "react"
import { Link } from "react-router-dom"

import { PostForm } from "./PostForm"
import { ErrorMessage } from "./ErrorMessage"
import { useDeletePostMutation, useUpdatePostMutation } from "../services/posts"
import type { Post, PostCreate } from "../types"

export function PostItem({ post }: { post: Post }) {
  const [isEditing, setIsEditing] = useState(false)
  const [deletePost, deleteState] = useDeletePostMutation()
  const [updatePost, updateState] = useUpdatePostMutation()

  const handleDelete = async () => {
    try {
      await deletePost(post.id).unwrap()
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

  const error = deleteState.error ?? updateState.error

  if (isEditing) {
    return (
      <div className="rounded border border-blue-300 bg-white p-4 shadow-sm">
        <PostForm
          initial={post}
          submitLabel="Save"
          isSubmitting={updateState.isLoading}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
        {error && <ErrorMessage error={error} className="mt-3" />}
      </div>
    )
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <Link
        to={`/post/${post.id}`}
        className="text-lg font-semibold text-gray-900 hover:text-blue-600"
      >
        {post.title}
      </Link>
      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{post.content}</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setIsEditing(true)}
          className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteState.isLoading}
          className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {deleteState.isLoading ? "Deleting…" : "Delete"}
        </button>
      </div>

      {error && <ErrorMessage error={error} className="mt-3" />}
    </div>
  )
}
