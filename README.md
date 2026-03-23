# Training Plan App

PWA для планування тренувань в легкій атлетиці. Тренери створюють плани, спортсмени виконують та залишають відгуки.

## Стек

- **Backend:** Node.js + Fastify + Prisma + PostgreSQL
- **Frontend:** React + Vite + TypeScript (PWA)
- **Docker:** docker compose для локальної розробки та продакшну

## Швидкий старт

```bash
# 1. Скопіюй змінні середовища
cp .env.example .env

# 2. Запусти все
docker compose up

# 3. Запусти міграції та seed (перший раз)
docker compose exec api npm run db:migrate:dev
docker compose exec api npm run db:seed
```

Відкрий у браузері:
- Фронтенд: http://localhost:5173
- API: http://localhost:3001

Перший адмін: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` з `.env`

## Структура проекту

```
apps/
  api/          # Fastify REST API
    src/
      routes/   # auth, admin, teams, plans, athlete
      plugins/  # db (Prisma), auth (JWT)
      parsers/  # regex workout parser
    prisma/
      schema.prisma
      seed.ts
  web/          # React PWA
    src/
      pages/    # LoginPage, RegisterPage, WeeklyCalendarPage...
      components/
      api/      # axios client + interceptors
      store/    # Zustand auth store
packages/
  shared/       # Shared TypeScript types
```

## Роди користувачів

| Роль | Можливості |
|------|-----------|
| ATHLETE | Реєстрація, перегляд плану, відгук після тренування |
| TRAINER | + Створення команд, групових і індивідуальних планів, перегляд відгуків |
| ADMIN | + Управління ролями користувачів |

## Типи планів

**Груповий план** — прив'язаний до дати та команди. Містить кілька груп вправ (наприклад, "Витривалість 1", "Спринт 1"). Спортсмен обирає свою групу.

**Індивідуальний план** — тижневий, для конкретного спортсмена. Вводиться по днях (Пн-Нд) у вигляді вільного тексту.

## Відгуки

Після тренування спортсмен вказує:
- Статус: Виконано / Частково / Пропущено
- RPE (1-10)
- Текстовий коментар

## Парсинг тренувань

Текст типу `4*800м через 3 хв відпочинку. 2 серії між серіями 5 хв. Пейс 1.20-1.25 хлопці` автоматично парситься в структуровані дані. Сирий текст завжди зберігається поряд.

## Продакшн деплой

```bash
cp .env.example .env
# Встанови надійні значення для всіх змінних

docker compose -f docker-compose.prod.yml up -d

docker compose -f docker-compose.prod.yml exec api npm run db:migrate
docker compose -f docker-compose.prod.yml exec api npm run db:seed
```

## Майбутні стадії

- **Stage 2:** Telegram-бот (відправка планів, збір відгуків)
- **Stage 3:** Інтеграція зі Strava
- **Stage 4:** AI self-planner
