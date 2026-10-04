import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.post import Post
from app.schemas.post import PostCreate, PostUpdate


async def create_post(db: AsyncSession, data: PostCreate) -> Post:
    post = Post(**data.model_dump())
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


async def get_post(db: AsyncSession, post_id: uuid.UUID) -> Post | None:
    return await db.get(Post, post_id)


async def list_posts(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[Post]:
    result = await db.execute(
        select(Post).order_by(Post.id.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def update_post(db: AsyncSession, post: Post, data: PostUpdate) -> Post:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(post, field, value)
    await db.commit()
    await db.refresh(post)
    return post


async def delete_post(db: AsyncSession, post: Post) -> None:
    await db.delete(post)
    await db.commit()