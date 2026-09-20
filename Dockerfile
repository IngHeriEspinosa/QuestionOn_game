# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps: dependencias completas, que next build necesita (typescript, tailwind,
# esbuild). NODE_ENV no se define aqui a proposito: si valiera "production",
# npm ci omitiria las devDependencies y el build fallaria.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# build: comprueba tipos, compila Next y empaqueta el servidor con esbuild.
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# runner: imagen final, solo con dependencias de produccion.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# Sin esto, el servidor evalua dev = true y arranca Next en modo desarrollo,
# ignorando el build de la etapa anterior.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Ya se puede omitir dev: el servidor va compilado en dist/, sin ts-node.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/.next          ./.next
COPY --from=build /app/dist           ./dist
COPY --from=build /app/public         ./public
COPY --from=build /app/next.config.ts ./next.config.ts

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
