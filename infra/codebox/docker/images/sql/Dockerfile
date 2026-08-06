FROM alpine:3.19

RUN apk add --no-cache sqlite \
    && if ! getent passwd 1000 >/dev/null; then adduser -D -u 1000 codebox; fi
USER 1000

WORKDIR /box
