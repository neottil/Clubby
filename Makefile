.PHONY: up down reset init logs-ls logs-pg be fe

# Avvia Postgres e LocalStack in background
up:
	docker compose up -d

# Ferma i container
down:
	docker compose down

# Reset completo (cancella tutti i dati e ricrea i volumi)
reset:
	docker compose down -v

# Crea risorse Cognito su LocalStack e genera frontend/.env.local e backend/.env
# Da eseguire UNA VOLTA dopo "make up" (o quando si fa reset)
init:
	chmod +x scripts/init-localstack.sh && ./scripts/init-localstack.sh

# Log dei container
logs-ls:
	docker compose logs -f localstack

logs-pg:
	docker compose logs -f postgres

# Avvia backend (legge backend/.env via tsx --env-file)
be:
	cd backend && npx tsx --env-file=.env src/local/server.ts

# Avvia frontend
fe:
	cd frontend && npm run dev
