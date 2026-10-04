# Backend

FastAPI, Alembic, Pydentic

## Запуск

### Docker

```
docker compose up --build
```

### Backend локально, БД в Docker

```bash
# 1. Поднять только БД
docker compose up -d db

# 2. Создать venv и поставить зависимости
cd backend
python3 -m venv .venv
source .venv/bin/activate        # fish: source .venv/bin/activate.fish
pip install --upgrade pip
pip install -r requirements.txt

# 3. Применить миграции (см. следующий раздел)
alembic upgrade head

# 4. Запустить dev-сервер
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Миграции (Alembic)

```bash
# после правки модели
alembic revision --autogenerate -m "add field X"

# посмотреть сгенерированный файл в alembic/versions/
# применить
alembic upgrade head

# откатить последнюю
alembic downgrade -1

# откатить всё
alembic downgrade base

# посмотреть, какая ревизия применена
alembic current

# история
alembic history
```

## Эндпоинты

- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc


