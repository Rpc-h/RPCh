# Create funding platform

# use slim version of node on Debian bullseye for smaller image sizes
FROM node:16-bullseye-slim@sha256:2e42e0aab9c9fd2d914417659ebedb4f995dfde79f3f7127cbc7e57ae6485dd9 as builder

# use bash to have source command and persistent environment.
SHELL ["/bin/bash", "-lc"]

WORKDIR /app

# Install turbo to be able to use its commands.
RUN yarn global add turbo

# Copy app source
COPY . .

# Generate a partial monorepo with a pruned lockfile for the target workspace.
RUN turbo prune --scope="@rpch/funding-platform" --docker

# Add lockfile and package.json's of isolated subworkspace.
FROM node:16-alpine AS installer
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app

# Install the dependencies.
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/yarn.lock .yarn.lock
RUN yarn install

# Build the project.
COPY --from=builder /app/out/full .
COPY turbo.json turbo.json
RUN yarn run build --scope="@rpch/funding-platform"

#  Copy only the necesary files to run the app.
FROM node:16-alpine AS runner
WORKDIR /app

# we use tini as process 1 to catch signals properly, which is also built into Docker by default
RUN apk add --no-cache tini curl

COPY --from=installer /app/apps/funding-platform/package.json .
COPY --from=installer /app .
COPY apps/funding-platform/src/blockchain/erc20-fixture.json /app/apps/funding-platform/build/blockchain
COPY apps/funding-platform/dump.sql /app/

# switch to normal user, to prevent dangerous root access
RUN chown -R node:node .

# finally set the non-root user so the process also run un-privilidged
USER node

CMD ["node", "apps/funding-platform/build/index.js"]

ENTRYPOINT ["/sbin/tini", "--"]