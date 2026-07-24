#!/bin/bash
set -e

echo "=== CampusTrack Deployment Script ==="

# Check requirements
command -v docker >/dev/null 2>&1 || { echo "Error: Docker is required. Install it first."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "Error: docker-compose is required."; exit 1; }

# Create required directories
mkdir -p backups
mkdir -p logs

# Check for .env files
if [ ! -f backend/.env ]; then
  echo "Creating backend/.env from example..."
  cp backend/.env.example backend/.env
  echo "IMPORTANT: Edit backend/.env with your actual configuration!"
fi

if [ ! -f frontend/.env ]; then
  echo "Creating frontend/.env from example..."
  cp frontend/.env.example frontend/.env
  echo "IMPORTANT: Edit frontend/.env with your actual configuration!"
fi

# Pull images and build
echo "Building and pulling Docker images..."
docker-compose build
docker-compose pull postgres redis

# Run database migrations
echo "Running database migrations..."
docker-compose up --abort-on-container-exit backend-init

# Start all services
echo "Starting all services..."
docker-compose up -d

echo ""
echo "=== Deployment Complete ==="
echo "Frontend: http://localhost:2828"
echo "Backend:  http://localhost:5000"
echo ""
echo "To view logs:  docker-compose logs -f"
echo "To stop:       docker-compose down"
echo "To backup DB:  bash scripts/backup-db.sh ./backups"
echo ""
echo "For HTTPS setup, run: bash scripts/setup-ssl.sh"
