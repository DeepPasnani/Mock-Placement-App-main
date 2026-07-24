FROM ruby:3.3-alpine

RUN apk add --no-cache dumb-init

RUN addgroup -S runner && adduser -S runner -G runner

WORKDIR /code

COPY --chown=runner:runner . .

USER runner

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
