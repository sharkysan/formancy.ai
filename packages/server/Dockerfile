# The self-hostable formancy server.
#
# Built from the repository root, because a pnpm workspace package cannot be
# built without its lockfile and its sibling packages:
#
#   docker build -f packages/server/Dockerfile -t formancy/server .

# ---------------------------------------------------------------- build stage
FROM node:22.12-alpine AS build
WORKDIR /repo

# Node 22.12 bundles a corepack whose signature verification fails against the
# current npm registry keys — the same failure a contributor hits on a fresh
# clone (docs/architecture/02-constraints.md). Upgrading corepack first is the
# fix in both places.
RUN npm install -g corepack@latest && corepack enable pnpm

# The manifests and the lockfile first, so that a change to source code does not
# invalidate the dependency layer. This is most of the build time.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/spec/package.json          packages/spec/
COPY packages/expressions/package.json   packages/expressions/
COPY packages/core/package.json          packages/core/
COPY packages/server-core/package.json   packages/server-core/
COPY packages/server/package.json        packages/server/

# --ignore-scripts: nothing in the server's dependency graph needs a postinstall
# to function, and a build that runs arbitrary install scripts from the network
# is a supply-chain surface for no benefit here.
RUN pnpm install --frozen-lockfile --ignore-scripts \
      --filter @formancy/server... --filter .

COPY LICENSE NOTICE tsconfig.base.json ./
COPY scripts/ scripts/
COPY packages/spec/        packages/spec/
COPY packages/expressions/ packages/expressions/
COPY packages/core/        packages/core/
COPY packages/server-core/ packages/server-core/
COPY packages/server/      packages/server/

RUN pnpm --filter @formancy/server... build

# `pnpm deploy` resolves the workspace links into a self-contained tree, so the
# runtime stage needs neither pnpm nor the rest of the repository.
RUN pnpm --filter @formancy/server --prod deploy /app

# -------------------------------------------------------------- runtime stage
FROM node:22.12-alpine AS runtime
WORKDIR /app

# Nothing here needs to write to its own filesystem, and nothing needs root.
# node:alpine already provides an unprivileged `node` user.
COPY --from=build --chown=node:node /app /app

USER node

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4380 \
    # The pure-JavaScript ReDoS analyser. The alternatives are a 23 MB JVM jar
    # and per-platform native binaries, neither of which belongs in a container
    # for one static check at publish time.
    RECHECK_BACKEND=pure

EXPOSE 4380

# DATABASE_URL and FORMANCY_AUTH_SECRET have no defaults on purpose: a server
# that starts with a well-known signing key is worse than one that refuses to
# start. See packages/server/src/main.ts.

# Hits a real route rather than a synthetic one, so the check fails if the app
# is up but not serving. 404 is a healthy answer from an empty installation —
# what matters is that something answered.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4380)+'/f/__health').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.mjs"]
