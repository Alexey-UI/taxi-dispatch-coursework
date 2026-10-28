.PHONY: setup up down test logs backup helm-lint
setup:
	node scripts/setup.mjs
up: setup
	docker compose up -d --build --wait
down:
	docker compose down
test:
	go vet ./...
	go test -race ./...
	node --test simulator/*.test.mjs
logs:
	docker compose logs -f --tail=100
backup:
	sh scripts/backup.sh
helm-lint:
	helm lint deploy/helm/taxi
	helm template taxi deploy/helm/taxi > /dev/null
