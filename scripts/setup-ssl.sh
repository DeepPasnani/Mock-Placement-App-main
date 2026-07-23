#!/bin/bash
set -e

# ============================================================
# CampusTrack SSL Setup Script
#
# Uses certbot to obtain Let's Encrypt certificates and
# configures the Nginx container to use them.
#
# Prerequisites:
#   - Domain pointed to this server
#   - Port 80 and 443 accessible
#   - Docker and docker-compose installed
#
# Usage:
#   ./scripts/setup-ssl.sh campustrack.app admin@college.edu
# ============================================================

DOMAIN="${1:-campustrack.app}"
EMAIL="${2:-admin@college.edu}"

echo "=== CampusTrack SSL Setup ==="
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo ""

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
  echo "Installing certbot..."
  apt-get update && apt-get install -y certbot || {
    echo "Failed to install certbot. Try: brew install certbot"
    exit 1
  }
fi

# Obtain certificate
echo "Obtaining certificate for $DOMAIN..."
sudo certbot certonly --standalone \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL" || {
    echo "Standalone failed — trying webroot..."
    sudo certbot certonly --webroot \
      -w ./frontend/dist \
      -d "$DOMAIN" \
      --non-interactive \
      --agree-tos \
      -m "$EMAIL"
  }

# Copy certs to nginx ssl directory
CERT_DIR="./certs"
mkdir -p "$CERT_DIR"

sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/campustrack.crt"
sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/campustrack.key"
sudo chmod 644 "$CERT_DIR/campustrack.crt"
sudo chmod 600 "$CERT_DIR/campustrack.key"

echo ""
echo "Certificates copied to $CERT_DIR/"
echo "Update docker-compose.yml to mount them:"
echo ""
echo "  volumes:"
echo "    - ./certs/campustrack.crt:/etc/ssl/certs/campustrack.crt"
echo "    - ./certs/campustrack.key:/etc/ssl/private/campustrack.key"
echo ""
echo "Then: docker compose up -d --build frontend"
echo ""

# Setup auto-renewal cron
CRON="0 3 * * * sudo certbot renew --quiet && sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $CERT_DIR/campustrack.crt && sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $CERT_DIR/campustrack.key && docker compose restart frontend"
(crontab -l 2>/dev/null | grep -v certbot; echo "$CRON") | crontab -

echo "Auto-renewal cron job installed (runs daily at 3 AM)"
