# Backend image for Render.
#
# IMPORTANT: build context is the REPO ROOT, not server/.
#   Dockerfile path:  ./server/Dockerfile
#   Build context:    .
# src/utils/config.ts reads `../config/store.config.json` relative to cwd, so the
# container mirrors the repo layout — /app/server is the workdir and /app/config
# sits beside it. A context of server/ cannot see config/ and the app would exit
# at startup with "Store configuration file not found or invalid".

FROM node:20-slim

# Prisma's query engine needs OpenSSL; node:20-slim does not ship the binary.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

# Dependencies first so edits to src/ do not invalidate the install layer.
# --include=dev is required: typescript, prisma, and every @types/* package are
# devDependencies, and npm omits those whenever NODE_ENV=production is set.
COPY server/package.json ./
RUN npm install --include=dev --no-audit --no-fund

COPY server/ ./
COPY config/ /app/config/

# `prisma generate && tsc` — the client must be generated before compiling.
RUN npm run build

# Set after the build so it cannot strip devDependencies from the install above.
ENV NODE_ENV=production

# Cosmetic; Render injects PORT and the app reads process.env.PORT.
EXPOSE 4000

# ponytail: single stage keeps devDependencies in the final image (~418 pkgs).
# Pruning them risks deleting the generated client in node_modules/.prisma, so
# if image size ever matters, split into a builder stage rather than pruning.
CMD ["npm", "start"]
