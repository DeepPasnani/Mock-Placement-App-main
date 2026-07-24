FROM rust:1.77-slim-bookworm

RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

RUN addgroup --system runner && adduser --system --ingroup runner runner

WORKDIR /code

RUN mkdir -p /usr/local/cargo/registry && chown -R runner:runner /usr/local/cargo
ENV CARGO_HOME=/usr/local/cargo

COPY --chown=runner:runner . .

USER runner

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
