# Fullstack Test App

CRUD c постами: FastAPI + PostgreSQL на бэке, React + RTK Query на фронте.

## Стек

`Python`, `FastAPI`, `Alembic`, `Pydantic`, `PostgreSQL`, `React`, `TypeScript`, `Vite`, `RTK Query`, `React Router`, `Tailwind CSS`, `Docker Compose`.

## Быстрый старт

```bash
cp .env.example .env
docker compose up --build
```

**Миграции**

```bash
docker compose exec backend alembic upgrade head
```


## Адреса

- Frontedn: http://localhost:5173
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Основные команды

```bash
# Поднять всё
docker compose up --build

# Только БД
docker compose up -d db

# Остановить и удалить контейнеры (данные БД в volume сохранятся)
docker compose down

# Остановить и снести volume (данные БД тоже)
docker compose down -v
```


## README по сервисам

- **[backend/README.md](./backend/README.md)**
- **[frontend/README.md](./frontend/README.md)**