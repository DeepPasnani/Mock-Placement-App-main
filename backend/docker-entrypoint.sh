#!/bin/sh
set -e

echo "Starting server..."
exec node src/index.js
