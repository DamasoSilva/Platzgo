# Deploy em produção (Hetzner + Cloudflare + GitHub)

Guia para subir **um novo site** no mesmo servidor que já possui outro site em produção. Usa Docker e Caddy como reverse proxy, com múltiplos domínios.

---

## 1) Pré-requisitos no servidor
```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin
sudo usermod -aG docker $USER
```
Saia e entre novamente no SSH para aplicar o grupo.

---

## 2) DNS no Cloudflare
Para o **novo domínio**:
- Crie um registro **A** apontando para o IP do servidor.
- Ex.: `app.seudominio.com` → IP da Hetzner.
- Proxy ligado (nuvem laranja).

---

## 3) Estrutura de pastas
```bash
mkdir -p /opt/apps
cd /opt/apps
```

---

## 4) Clonar o projeto (via GitHub)
```bash
git clone <URL_DO_REPO> playhubfit
cd playhubfit
```

---

## 5) Criar .env de produção
Crie `.env` baseado no `.env.example`:
```
DATABASE_URL=postgresql://playhub:playhubpass@db:5432/playhubfit?schema=public
NEXTAUTH_URL=https://app.seudominio.com
NEXTAUTH_SECRET=...

PAYMENTS_ENABLED=1
PAYMENT_PROVIDER=asaas
ASAAS_API_KEY=...
ASAAS_WEBHOOK_TOKEN=...
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
PAYMENT_RETURN_URL=https://app.seudominio.com/meus-agendamentos
```

---

## 6) Dockerfile (na raiz do repo)
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm","run","start"]
```

---

## 7) docker-compose.yml do app
```yaml
version: "3.9"

services:
  db:
    image: postgres:16
    container_name: playhubfit_db
    restart: always
    environment:
      POSTGRES_USER: playhub
      POSTGRES_PASSWORD: playhubpass
      POSTGRES_DB: playhubfit
    volumes:
      - playhubfit_db:/var/lib/postgresql/data
    networks:
      - proxy

  app:
    build: .
    container_name: playhubfit_app
    restart: always
    env_file:
      - .env
    depends_on:
      - db
    networks:
      - proxy

volumes:
  playhubfit_db:

networks:
  proxy:
    external: true
```

---

## 8) Reverse proxy (Caddy) com múltiplos domínios
Se já existe um Caddy rodando para outro site, apenas **adicione** um novo bloco no Caddyfile.

Exemplo de Caddyfile com **dois sites**:
```caddyfile
site-antigo.com {
  reverse_proxy localhost:3001
}

platzgo.com.br {
  reverse_proxy playhubfit_app:3000
}
```

### Subindo o Caddy (uma única vez no servidor)
```bash
docker network create proxy

cat <<'EOF' > /opt/caddy/Caddyfile
site-antigo.com {
  reverse_proxy localhost:3001
}

platzgo.com.br {
  reverse_proxy playhubfit_app:3000
}
EOF

cat <<'EOF' > /opt/caddy/docker-compose.yml
version: "3.9"
services:
  caddy:
    image: caddy:2
    container_name: caddy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - proxy

volumes:
  caddy_data:
  caddy_config:

networks:
  proxy:
    external: true
EOF

cd /opt/caddy
sudo docker compose up -d
```

---

## 9) Subir o app
```bash
cd /opt/apps/playhubfit
sudo docker compose up -d --build
```

---

## 10) Rodar migrations
```bash
sudo docker exec -it playhubfit_app npx prisma migrate deploy
```

---

## 11) Testar
- Acesse: `https://app.seudominio.com`
- Logs:
```bash
sudo docker logs -f playhubfit_app
```

---

## 12) Atualização (pull + rebuild)
```bash
cd /opt/apps/playhubfit
git pull
sudo docker compose up -d --build
sudo docker exec -it playhubfit_app npx prisma migrate deploy
```

---

## 13) Backup rápido do banco
```bash
sudo docker exec -t playhubfit_db pg_dump -U playhub playhubfit > /opt/backups/playhubfit_$(date +%F).sql
```

---

## Observações
- Use um **subdomínio** por app para evitar conflitos.
- Cada app com seu próprio banco, usuário e volume.
- O Caddy gerencia SSL automaticamente.
