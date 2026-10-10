FROM node:22-alpine

# ssh: to run the lock scripts on the MikroTik router. tzdata: local times in the log.
RUN apk add --no-cache openssh-client tzdata

WORKDIR /app
COPY . .

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://localhost:8080/api/status > /dev/null || exit 1

CMD ["node", "server/server.js"]
