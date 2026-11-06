FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_ASSET_VERSION
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_ASSET_VERSION=$NEXT_PUBLIC_ASSET_VERSION
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# Les variables NEXT_PUBLIC_* sont inlinées au build : sans elles, le bundle
# navigateur ne peut joindre ni l'API ni le Storage. On échoue tôt plutôt que
# de livrer une image silencieusement cassée. Une clé publique Supabase suffit :
# ANON_KEY (legacy) ou PUBLISHABLE_KEY (nouveau format `sb_publishable_...`).
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
 && { test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" || test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"; } \
 || (echo "Build args manquants : NEXT_PUBLIC_SUPABASE_URL et une clé publique (NEXT_PUBLIC_SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) sont requis au build." >&2; exit 1)
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur non-root : un défaut d'autorisation ne doit pas donner root
# dans le conteneur.
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Sortie `output: "standalone"` : le serveur et ses node_modules tracés sont
# copiés tels quels, plus besoin de `npm ci` ni de `npm start` au runtime.
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/ > /dev/null || exit 1

CMD ["node", "server.js"]
