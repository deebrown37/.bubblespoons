FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
RUN mkdir data && chown node:node data
USER node
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production DB_PATH=/app/data/app.sqlite
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
