FROM gradle:8.7-jdk21-alpine

RUN apk add --no-cache dumb-init

RUN addgroup -S runner && adduser -S runner -G runner

WORKDIR /code

ENV GRADLE_OPTS="-Dorg.gradle.daemon=false -Dorg.gradle.parallel=false"

COPY --chown=runner:runner . .

USER runner

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
