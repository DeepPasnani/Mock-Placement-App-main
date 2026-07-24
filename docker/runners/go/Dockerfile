FROM golang:1.22-alpine

RUN apk add --no-cache dumb-init

RUN addgroup -S runner && adduser -S runner -G runner

WORKDIR /code

RUN mkdir -p /go/cache && chown -R runner:runner /go/cache
ENV GOPATH=/go
ENV GOMODCACHE=/go/cache

COPY --chown=runner:runner . .

USER runner

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
