# Backend image for Render.
#
# Root directory / build context: server/  (this directory)
#   Dockerfile path:  ./Dockerfile
#   Build context:    .
#
# Everything the API needs lives under server/, including config/store.config.json,
# which src/utils/config.ts loads from `<cwd>/config/store.config.json`. Nothing
# outside this directory is referenced, so the context stays small and the image
# does not depend on the surrounding monorepo.

FROM node:20-slim

# Prisma's query engine needs OpenSSL; node:20-slim does not ship the binary.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so edits to src/ do not invalidate the install layer.
# typescript, prisma and the @types/* packages the compile needs are regular
# dependencies, so a production install is enough — no --include=dev needed.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

# `prisma generate && tsc` — the client must be generated before compiling.
RUN npm run build

# Set after the build so it cannot strip devDependencies from the install above.
ENV NODE_ENV=production

# Cosmetic; Render injects PORT and the app reads process.env.PORT.
EXPOSE 4000

# ponytail: single stage keeps the compiler and types in the final image
# (~326 pkgs). Pruning risks deleting the generated client in
# node_modules/.prisma, so split into a builder stage if size ever matters.
CMD ["npm", "start"]
