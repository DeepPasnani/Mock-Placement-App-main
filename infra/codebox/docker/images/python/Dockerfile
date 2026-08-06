FROM python:3.8-alpine

RUN if ! getent passwd 1000 >/dev/null; then adduser -D -u 1000 codebox; fi
USER 1000

WORKDIR /box
