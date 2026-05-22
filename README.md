# Curling Arena

Two-player curling-style browser game built with:

- `HTML`
- `CSS`
- `JavaScript`
- `Canvas API`
- `Node.js`
- `ws` WebSocket library

The project contains:

- frontend files: `index.html`, `styles.css`, `app.js`
- game configuration: `config/game-config.json`
- WebSocket server: `server.js`

## Implemented Functionality

- local match on one device
- online room for two players through WebSocket
- shared turn order
- drag-to-aim shot mechanic
- stone friction
- wall bounces
- stone-to-stone collisions
- winner detection by closest stone to the target
- online pause and resume
- online restart by mutual confirmation
- rules screen
- explicit disconnect action in the UI

## Database

This project does not use a database.
The whole game works through frontend state plus a Node.js WebSocket server.

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Start the WebSocket server:

```bash
npm start
```

3. Open the frontend through a local web server, for example:

- `http://localhost/webte2-z3/`

When the page runs on `localhost`, the browser connects to:

- `ws://127.0.0.1:3000`

## Files Included In Submission

The project is submitted without `node_modules`.

Files included:

- `index.html`
- `styles.css`
- `app.js`
- `config/game-config.json`
- `server.js`
- `package.json`
- `package-lock.json`
- `README.md`

## Server Deployment

Target server:

- `node82.webte.fei.stuba.sk`

Current uploaded project path:

- `/var/www/node82.webte.fei.stuba.sk/webte2-z3`

### 1. Uploaded Files

The following files were uploaded to the server:

- `index.html`
- `styles.css`
- `app.js`
- `config/game-config.json`
- `server.js`
- `package.json`
- `package-lock.json`
- `README.md`

### 2. Install Dependencies On The Server

Connect to the server and go to the project directory:

```bash
ssh xshudiehov@node82.webte.fei.stuba.sk
cd /var/www/node82.webte.fei.stuba.sk/webte2-z3
```

Install dependencies:

```bash
npm install
```

### 3. Start The WebSocket Server

Manual start:

```bash
WS_HOST=127.0.0.1 WS_PORT=3000 npm start
```

This starts the WebSocket server on:

- `ws://127.0.0.1:3000`

### 4. Nginx Reverse Proxy

The frontend is prepared like this:

- on `localhost` it uses `ws://127.0.0.1:3000`
- on the deployed server it uses `/ws` on the current host

For server deployment, Nginx must proxy `/ws` to the Node.js server:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 600s;
}
```

After editing Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Optional Persistent Run With systemd

Example service file:

```ini
[Unit]
Description=Curling Arena WebSocket Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/node82.webte.fei.stuba.sk/webte2-z3
ExecStart=/usr/bin/env node /var/www/node82.webte.fei.stuba.sk/webte2-z3/server.js
Environment=WS_HOST=127.0.0.1
Environment=WS_PORT=3000
Restart=always
User=xshudiehov

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable curling-arena
sudo systemctl start curling-arena
sudo systemctl status curling-arena
```

## Deployment Checklist

- site opens on `node82.webte.fei.stuba.sk`
- WebSocket server runs on `127.0.0.1:3000`
- Nginx proxies `/ws` to the Node.js process
- two browsers can enter the same room
- both players see the same launched shot
- pause works for both players
- restart works for both players
- disconnect returns the user safely back to the menu
