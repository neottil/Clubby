.PHONY: infra-up infra-down infra-reset init-keycloak dev dev-backend dev-frontend logs-kc logs-pg

# Avvia Postgres, Keycloak-DB e Keycloak in background
infra-up:
	docker compose up -d

# Ferma i container
infra-down:
	docker compose down

# Reset completo (cancella tutti i dati e ricrea i volumi)
infra-reset:
	docker compose down -v

# Configura realm Keycloak, client, ruoli e utenti di test.
# Genera frontend/.env.local e backend/.env.
# Da eseguire UNA VOLTA dopo "make infra-up" (o quando si fa reset)
init-keycloak:
	chmod +x scripts/init-keycloak.sh && ./scripts/init-keycloak.sh

# Setup completo: avvia infra + init keycloak
dev: infra-up
	@echo "Attendo che Keycloak sia pronto..."
	@sleep 5
	@$(MAKE) init-keycloak

# Avvia backend (legge backend/.env)
dev-backend:
	cd backend && npx tsx src/local/server.ts

# Avvia frontend
dev-frontend:
	cd frontend && npm run dev

# Log dei container
logs-kc:
	docker compose logs -f keycloak

logs-pg:
	docker compose logs -f postgres
