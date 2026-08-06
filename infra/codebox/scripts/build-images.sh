#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building from: $PROJECT_DIR"
echo ""

echo "Building Python 3.8 image..."
docker build -t codebox/python:3.8 "$PROJECT_DIR/docker/images/python/"

echo "Building Node.js 18 image..."
docker build -t codebox/node:18 "$PROJECT_DIR/docker/images/node/"

echo "Building GCC 9 image..."
docker build -t codebox/gcc:9 "$PROJECT_DIR/docker/images/gcc/"

echo "Building Java 17 image..."
docker build -t codebox/java:17 "$PROJECT_DIR/docker/images/java/"

echo "Building Go 1.22 image..."
docker build -t codebox/go:1.22 "$PROJECT_DIR/docker/images/go/"

echo "Building Ruby 3.3 image..."
docker build -t codebox/ruby:3.3 "$PROJECT_DIR/docker/images/ruby/"

echo "Building Rust 1.77 image..."
docker build -t codebox/rust:1.77 "$PROJECT_DIR/docker/images/rust/"

echo "Building Kotlin 1.9 image..."
docker build -t codebox/kotlin:1.9 "$PROJECT_DIR/docker/images/kotlin/"

echo "Building SQLite 3 image..."
docker build -t codebox/sqlite:3 "$PROJECT_DIR/docker/images/sql/"

echo ""
echo "All images built successfully!"
echo ""
docker images | grep codebox
