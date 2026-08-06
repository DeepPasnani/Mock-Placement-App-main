#!/bin/sh
set -e

# Ensure docker socket is available
if [ -S /var/run/docker.sock ]; then
  echo "Docker socket found"
else
  echo "Warning: Docker socket not found at /var/run/docker.sock"
fi

exec node src/queue/worker.js
