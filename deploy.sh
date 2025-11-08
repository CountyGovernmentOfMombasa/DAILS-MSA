#!/bin/bash
set -e

# ------------------------------
# VARIABLES - adjust if needed
# ------------------------------
APP_DIR="/var/www/dial-msa"
REACT_DIR="$APP_DIR/my-app"
BACKEND_DIR="$APP_DIR/backend"
NODE_VERSION="20"
NODE_APP_NAME="dials-msa"
NODE_PORT=5000
NGINX_SITE="/etc/nginx/sites-available/dials-msa"

# ------------------------------
# 1️⃣ Install Node.js 20 if missing
# ------------------------------
if ! command -v node &>/dev/null; then
  echo "Installing Node.js $NODE_VERSION..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
  sudo apt install -y nodejs build-essential
else
  echo "Node.js already installed: $(node -v)"
fi

# ------------------------------
# 2️⃣ Install PM2 globally if missing
# ------------------------------
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
else
  echo "PM2 already installed: $(pm2 -v)"
fi

# ------------------------------
# 3️⃣ Install NGINX if missing
# ------------------------------
if ! command -v nginx &>/dev/null; then
  echo "Installing NGINX..."
  sudo apt update
  sudo apt install -y nginx
else
  echo "NGINX already installed: $(nginx -v)"
fi

# ------------------------------
# 4️⃣ Build React frontend
# ------------------------------
echo "Building React frontend..."
cd $REACT_DIR
npm ci
npm run build

# ------------------------------
# 5️⃣ Install backend dependencies
# ------------------------------
echo "Installing backend dependencies..."
cd $BACKEND_DIR
npm ci --omit=dev

# ------------------------------
# 6️⃣ Setup PM2 for Node backend
# ------------------------------
echo "Starting Node backend with PM2..."
cd $BACKEND_DIR
if pm2 describe $NODE_APP_NAME &>/dev/null; then
  pm2 restart $NODE_APP_NAME --update-env
else
  pm2 start app.js --name $NODE_APP_NAME
fi
pm2 save

# Ensure PM2 restarts on reboot (idempotent)
if ! sudo systemctl list-unit-files | grep -q pm2-root.service; then
  echo "Configuring PM2 to start on boot..."
  pm2 startup systemd -u root --hp /root
  sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
  pm2 save
fi

# ------------------------------
# 7️⃣ Configure NGINX
# ------------------------------
echo "Setting up NGINX site..."
if [ ! -f $NGINX_SITE ]; then
  sudo tee $NGINX_SITE > /dev/null <<EOL
server {
    listen 80;
    server_name _;

    root $REACT_DIR/build;
    index index.html index.htm;

    location / {
        try_files \$uri /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOL
fi

# Enable site & reload NGINX
sudo ln -sf $NGINX_SITE /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# ------------------------------
# 8️⃣ Open firewall ports (idempotent)
# ------------------------------
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw reload || true

# ------------------------------
# 9️⃣ Deployment complete
# ------------------------------
echo "✅ Deployment completed successfully!"
echo "React available at: http://<your-server-ip>/"
echo "Node API available at: http://<your-server-ip>/api/"
pm2 list
sudo systemctl status nginx
