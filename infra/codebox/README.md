# CodeBox — Code Execution Engine

CodeBox is a self-hosted code execution engine that securely runs user-submitted code in isolated Docker containers.

## Prerequisites

- Docker + Docker Compose v2
- Docker socket accessible from containers

## Quick Start

### 1. Build language runtime images

```bash
cd infra/codebox
./scripts/build-images.sh
```

### 2. Start CodeBox

```bash
cd infra/codebox
docker compose up -d
```

This starts 3 services:
- **codebox-api** on port **3000** — REST API
- **codebox-worker** — executes code in isolated Docker containers
- **codebox-redis** on port **6380** — job queue

Health check:
```bash
curl http://localhost:3000/health
```

### 3. Point the backend at CodeBox

In `backend/.env`:
```env
CODEBOX_API_URL=http://localhost:3000
CODEBOX_AUTH_TOKEN=dev-token
CODE_EXECUTION_PROVIDER=codebox
```

`CODEBOX_AUTH_TOKEN` must match CodeBox's `AUTH_TOKEN` (defaults to `dev-token` in `docker-compose.yml`). An empty token causes every `/submissions` call to return 401.

Restart the backend. Code submissions now go through CodeBox.

## Supported Languages

| ID | Language | Docker Image |
|----|----------|-------------|
| 50 | C (GCC 9) | `codebox/gcc:9` |
| 54 | C++ (GCC 9) | `codebox/gcc:9` |
| 60 | Go (1.22) | `codebox/go:1.22` |
| 62 | Java (OpenJDK 17) | `codebox/java:17` |
| 63 | JavaScript (Node 18) | `codebox/node:18` |
| 71 | Python (3.8) | `codebox/python:3.8` |
| 72 | Ruby (3.3) | `codebox/ruby:3.3` |
| 73 | Rust (1.77) | `codebox/rust:1.77` |
| 78 | Kotlin (1.9) | `codebox/kotlin:1.9` |
| 82 | SQL (SQLite 3) | `codebox/sqlite:3` |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/submissions` | Create submission (async) |
| `POST` | `/submissions?wait=true` | Create and wait for result |
| `GET` | `/submissions/:token` | Get result by token |
| `POST` | `/submissions/batch` | Submit multiple (up to 20) |
| `GET` | `/submissions/batch?tokens=a,b,c` | Get multiple results |
| `GET` | `/health` | Health check |
| `GET` | `/languages` | List supported languages |

## Architecture

```
POST /submissions
     │
     ▼
  codebox-api  ──►  Redis Queue  ──►  codebox-worker
                                          │
                                    ┌─────┴─────┐
                                    │   Docker   │
                                    │ container  │
                                    └───────────┘
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_TOKEN` | — | API authentication token |
| `EXECUTOR_TYPE` | `docker` | Execution backend |
| `WORKER_CONCURRENCY` | `4` | Parallel workers |
| `DEFAULT_CPU_TIME_LIMIT` | `5` | Seconds |
| `DEFAULT_MEMORY_LIMIT` | `128000` | KB |


