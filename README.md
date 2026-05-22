# Realtime WebSocket Game

Two-player curling-style browser game built for WEBTE2. The game supports local play on one device and online play through a Node.js WebSocket server.

## Live Project

- Live demo: [https://node82.webte.fei.stuba.sk/webte_z3/](https://node82.webte.fei.stuba.sk/webte_z3/)
- GitHub repository: [https://github.com/shudiehov1902/realtime-websocket-game](https://github.com/shudiehov1902/realtime-websocket-game)

The deployment runs on a temporary university server. If the link is unavailable when you read this, the server may already have been turned off, reset, or reassigned.

## Gameplay

Players take turns launching stones toward the target. The winner is determined by the stone closest to the center after the round ends.

Implemented gameplay:

- local two-player match on one device
- online room for two players
- shared turn order over WebSocket
- drag-to-aim shot mechanic
- friction-based movement
- wall bounces
- stone-to-stone collisions
- closest-stone winner detection
- pause and resume in online mode
- restart by mutual confirmation
- disconnect handling
- rules screen

## Technology Stack

- HTML
- CSS
- JavaScript
- Canvas API
- Node.js
- `ws` WebSocket library

The project does not use a database. Game state lives in the browser and is synchronized through the WebSocket server.

## Project Structure

```text
index.html                  Main page
styles.css                  Game UI and layout
app.js                      Canvas rendering, physics, UI, client networking
server.js                   WebSocket room server
config/game-config.json     Main game configuration
config/test-config.json     Test configuration
package.json                Node.js scripts and dependency list
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start the WebSocket server:

```bash
npm start
```

3. Open the frontend through a local web server, for example:

```text
http://localhost/webte2-z3/
```

When the page is opened on `localhost`, the browser connects to:

```text
ws://127.0.0.1:3000
```

## Online Mode

The online mode uses room codes. Two browsers enter the same room and receive synchronized game state from the server.

The client expects:

- local development: `ws://127.0.0.1:3000`
- deployed server: `/ws` on the current host

## Deployment Notes

For deployment on Nginx, the static files are served normally and `/ws` must be proxied to the Node.js process.

Example Nginx WebSocket proxy:

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

Example manual server start:

```bash
WS_HOST=127.0.0.1 WS_PORT=3000 npm start
```

The deployed course URL is:

```text
https://node82.webte.fei.stuba.sk/webte_z3/
```

## Verification Checklist

- page opens and canvas renders
- local mode can finish a match
- online room can be joined by two browsers
- both players see the same turn order
- launched stones are synchronized
- pause and resume affect both players
- restart requires confirmation
- disconnect returns the UI to a safe state
