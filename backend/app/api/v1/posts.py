import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import post as crud_post
from app.db.deps import get_db
from app.schemas.post import PostCreate, PostRead, PostUpdate

router = APIRouter(prefix="/posts", tags=["posts"])


@router.get("", response_model=list[PostRead])
async def list_posts(
    skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)
):
    return await crud_post.list_posts(db, skip=skip, limit=limit)


@router.get("/{post_id}", response_model=PostRead)
async def get_post(post_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    post = await crud_post.get_post(db, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return post


@router.post("", response_model=PostRead, status_code=status.HTTP_201_CREATED)
async def create_post(data: PostCreate, db: AsyncSession = Depends(get_db)):
    return await crud_post.create_post(db, data)


@router.patch("/{post_id}", response_model=PostRead)
async def update_post(
    post_id: uuid.UUID, data: PostUpdate, db: AsyncSession = Depends(get_db)
):
    post = await crud_post.get_post(db, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return await crud_post.update_post(db, post, data)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    post = await crud_post.get_post(db, post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    await crud_post.delete_post(db, post)