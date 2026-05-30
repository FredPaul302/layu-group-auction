FROM node:24-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PORT="3000"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma/schema.prisma ./prisma/schema.prisma
RUN pnpm db:generate

COPY . .

RUN pnpm build

ENV NODE_ENV="production"

EXPOSE 3000

CMD ["pnpm", "start"]
