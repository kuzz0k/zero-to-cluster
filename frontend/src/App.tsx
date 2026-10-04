import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import PostsPage from "./pages/PostsPage"
import PostPage from "./pages/PostPage"

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to="/posts" replace />} />
          <Route path="/posts" element={<PostsPage />} />
          <Route path="/post/:id" element={<PostPage />} />
          <Route
            path="*"
            element={
              <div className="p-12 text-center text-gray-500">404 — page not found</div>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
