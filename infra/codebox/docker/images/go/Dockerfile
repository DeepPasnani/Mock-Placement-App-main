FROM golang:1.22-alpine

# No cgo needed for plain solution code, and it lets the build stay fully
# offline/static once the module cache below is warm.
ENV CGO_ENABLED=0 \
    GOCACHE=/box/.gocache \
    GOPATH=/box/.gopath

RUN if ! getent passwd 1000 >/dev/null; then adduser -D -u 1000 codebox; fi
USER 1000

WORKDIR /box
