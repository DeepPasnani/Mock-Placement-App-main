FROM rust:1.77-slim-bookworm

RUN if ! getent passwd 1000 >/dev/null; then adduser --disabled-password --uid 1000 codebox; fi
USER 1000

WORKDIR /box
