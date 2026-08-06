FROM eclipse-temurin:17-jdk

# eclipse-temurin doesn't ship the Kotlin compiler, so pull the official
# release directly rather than relying on a gradle/kotlin image that only
# exposes Kotlin as an embedded Gradle plugin (no standalone `kotlinc` on PATH).
ARG KOTLIN_VERSION=1.9.24
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip \
    && curl -fsSL -o /tmp/kotlin-compiler.zip \
       "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" \
    && unzip -q /tmp/kotlin-compiler.zip -d /opt \
    && rm /tmp/kotlin-compiler.zip \
    && apt-get purge -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/kotlinc/bin:${PATH}"

RUN if ! getent passwd 1000 >/dev/null; then adduser --disabled-password --uid 1000 codebox; fi
USER 1000

WORKDIR /box
