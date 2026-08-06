FROM node:18-alpine

# node:18-alpine already has uid 1000 (user "node")
RUN if ! getent passwd 1000 >/dev/null; then adduser -D -u 1000 codebox; fi
USER 1000

WORKDIR /box
