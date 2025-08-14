include .env

.PHONY: build up down logs restart

build:
	docker compose build --no-cache

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

restart: down up logs


