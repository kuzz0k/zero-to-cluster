export interface Post {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface PostCreate {
  title: string
  content?: string
}

export interface PostUpdate {
  title?: string
  content?: string
}

export interface ListParams {
  skip?: number
  limit?: number
}
