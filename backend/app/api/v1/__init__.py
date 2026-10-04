from fastapi import APIRouter

from app.api.v1 import posts

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(posts.router)