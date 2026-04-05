.PHONY: up down reset init logs-kc logs-pg be fe

# Avvia Postgres, Keycloak-DB e Keycloak in background
up:
	docker compose up -d

# Ferma i container
down:
	docker compose down

# Reset completo (cancella tutti i dati e ricrea i volumi)
reset:
	docker compose down -v

# Configura realm Keycloak, client, ruoli e utente admin di test.
# Genera frontend/.env.local e backend/.env.
# Da eseguire UNA VOLTA dopo "make up" (o quando si fa reset)
init:
	chmod +x scripts/init-keycloak.sh && ./scripts/init-keycloak.sh

# Log dei container
logs-kc:
	docker compose logs -f keycloak

logs-pg:
	docker compose logs -f postgres

# Avvia backend (legge backend/.env via tsx --env-file)
be:
	cd backend && npx tsx --env-file=.env src/local/server.ts

# Avvia frontend
fe:
	cd frontend && npm run dev
