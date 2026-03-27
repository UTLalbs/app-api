# 1 — Iniciar Docker Desktop
open -a Docker

# 2 — Esperar ~30 segundos y luego levantar infraestructura
docker compose up -d mongodb redis

# 3 — Verificar que estén healthy
docker compose ps

# 4 — Iniciar servidor
npm run dev