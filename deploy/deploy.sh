#!/bin/bash
set -e

echo "==> Pulling latest changes..."
git pull origin master

echo "==> Building and starting containers..."
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

echo "==> Running migrations..."
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

echo "==> Done. App is running at https://plans.tsclub.com.ua"
