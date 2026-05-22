import { WebSocket, WebSocketServer } from "ws";

const HOST = process.env.WS_HOST || "127.0.0.1";
const PORT = Number(process.env.WS_PORT || 3000);
const MAX_PLAYERS_PER_ROOM = 2;
const STONES_PER_PLAYER = 4;
const rooms = new Map();
let nextClientNumber = 1;

const wss = new WebSocketServer({
    host: HOST,
    port: PORT
});

wss.on("connection", (socket) => {
    const session = {
        clientId: `client-${nextClientNumber}`,
        playerName: `Guest ${nextClientNumber}`,
        roomCode: null,
        slot: null,
        playerKey: null
    };

    nextClientNumber += 1;
    socket.session = session;

    sendJson(socket, {
        type: "connection_ready",
        clientId: session.clientId
    });

    socket.on("message", (rawMessage) => {
        handleClientMessage(socket, rawMessage);
    });

    socket.on("close", () => {
        leaveCurrentRoom(socket);
    });

    socket.on("error", (error) => {
        console.error(`[ws] Socket error for ${session.clientId}:`, error.message);
    });
});

wss.on("listening", () => {
    console.log(`[ws] WebSocket server is listening on ws://${HOST}:${PORT}`);
});

function handleClientMessage(socket, rawMessage) {
    let message;

    try {
        message = JSON.parse(rawMessage.toString());
    } catch (error) {
        sendError(socket, "Message must be valid JSON.");
        return;
    }

    if (message.type === "create_room") {
        createRoom(socket, message);
        return;
    }

    if (message.type === "join_room") {
        joinRoom(socket, message);
        return;
    }

    if (message.type === "leave_room") {
        leaveCurrentRoom(socket);
        return;
    }

    if (message.type === "launch_shot") {
        handleLaunchShot(socket, message);
        return;
    }

    if (message.type === "pause_game") {
        handlePauseGame(socket);
        return;
    }

    if (message.type === "resume_game") {
        handleResumeGame(socket);
        return;
    }

    if (message.type === "restart_request") {
        handleRestartRequest(socket);
        return;
    }

    if (message.type === "board_settled") {
        handleBoardSettled(socket, message);
        return;
    }

    sendError(socket, `Unsupported message type: ${message.type}`);
}

function createRoom(socket, message) {
    const roomCode = sanitizeRoomCode(message.roomCode) || generateRoomCode();
    const playerName = sanitizePlayerName(message.playerName, socket.session.clientId);

    if (rooms.has(roomCode)) {
        sendError(socket, `Room ${roomCode} already exists.`);
        return;
    }

    rooms.set(roomCode, {
        roomCode,
        sockets: [],
        game: null
    });

    socket.session.playerName = playerName;
    attachSocketToRoom(socket, roomCode);
}

function joinRoom(socket, message) {
    const roomCode = sanitizeRoomCode(message.roomCode);
    const playerName = sanitizePlayerName(message.playerName, socket.session.clientId);
    const room = rooms.get(roomCode);

    if (!roomCode) {
        sendError(socket, "Room code is required for joining.");
        return;
    }

    if (!room) {
        sendError(socket, `Room ${roomCode} does not exist yet.`);
        return;
    }

    if (!room.sockets.includes(socket) && room.sockets.length >= MAX_PLAYERS_PER_ROOM) {
        sendError(socket, `Room ${roomCode} is already full.`);
        return;
    }

    socket.session.playerName = playerName;
    attachSocketToRoom(socket, roomCode);
}

function attachSocketToRoom(socket, roomCode) {
    leaveCurrentRoom(socket);

    const room = rooms.get(roomCode);

    if (!room) {
        sendError(socket, `Room ${roomCode} is not available.`);
        return;
    }

    room.sockets.push(socket);
    socket.session.roomCode = roomCode;
    syncRoomSlots(room);

    sendJson(socket, {
        type: "room_joined",
        roomCode,
        players: getRoomPlayers(room),
        playerCount: room.sockets.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM
    });

    broadcastRoomState(roomCode);

    if (room.sockets.length === MAX_PLAYERS_PER_ROOM) {
        startRoomGame(roomCode);
    }
}

function leaveCurrentRoom(socket) {
    const roomCode = socket.session?.roomCode;

    if (!roomCode || !rooms.has(roomCode)) {
        clearSessionRoomData(socket);
        return;
    }

    const room = rooms.get(roomCode);
    room.sockets = room.sockets.filter((roomSocket) => roomSocket !== socket);
    clearSessionRoomData(socket);

    if (room.sockets.length === 0) {
        rooms.delete(roomCode);
        return;
    }

    syncRoomSlots(room);
    room.game = null;
    broadcastRoomState(roomCode);
}

function startRoomGame(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || room.sockets.length !== MAX_PLAYERS_PER_ROOM) {
        return;
    }

    syncRoomSlots(room);
    room.game = createRoomGameState();

    broadcastToRoom(room, {
        type: "game_ready",
        roomCode,
        players: getRoomPlayers(room),
        activePlayerKey: room.game.activePlayerKey,
        turnNumber: room.game.turnNumber
    });
}

function handleLaunchShot(socket, message) {
    const room = getRoomForSocket(socket);

    if (!room || !room.game) {
        sendError(socket, "Game is not ready in this room.");
        return;
    }

    const { game } = room;

    if (game.paused) {
        sendError(socket, "The game is currently paused.");
        return;
    }

    if (game.phase !== "aiming") {
        sendError(socket, "The room is waiting for the board to settle.");
        return;
    }

    if (socket.session.playerKey !== game.activePlayerKey) {
        sendError(socket, "It is not your turn.");
        return;
    }

    const expectedStoneId = getExpectedStoneId(game.activePlayerKey, game.launchedCounts);

    if (message.stoneId !== expectedStoneId) {
        sendError(socket, `Expected ${expectedStoneId}, but received ${message.stoneId}.`);
        return;
    }

    const shotDx = Number(message.shotDx);
    const shotDy = Number(message.shotDy);
    const powerRatio = Number(message.powerRatio);

    if (!Number.isFinite(shotDx) || !Number.isFinite(shotDy) || !Number.isFinite(powerRatio)) {
        sendError(socket, "Shot payload is invalid.");
        return;
    }

    game.phase = "resolving";
    game.launchedCounts[game.activePlayerKey] += 1;
    game.waitingFor = new Set(room.sockets.map((client) => client.session.clientId));

    const totalLaunched = getTotalLaunchedStones(game.launchedCounts);
    const roundComplete = totalLaunched >= (STONES_PER_PLAYER * MAX_PLAYERS_PER_ROOM);
    game.nextPlayerKey = roundComplete
        ? null
        : getNextPlayerAfterShot(game.activePlayerKey, game.launchedCounts);

    broadcastToRoom(room, {
        type: "shot_started",
        roomCode: room.roomCode,
        playerKey: socket.session.playerKey,
        stoneId: message.stoneId,
        shotDx,
        shotDy,
        powerRatio,
        turnNumber: game.turnNumber,
        nextPlayerKey: game.nextPlayerKey,
        roundComplete
    });
}

function handlePauseGame(socket) {
    const room = getRoomForSocket(socket);

    if (!room || !room.game) {
        sendError(socket, "Game is not ready in this room.");
        return;
    }

    const { game } = room;

    if (game.phase === "finished") {
        sendError(socket, "The round has already finished.");
        return;
    }

    if (game.paused) {
        return;
    }

    if (socket.session.playerKey !== game.activePlayerKey) {
        sendError(socket, "Only the current player can pause the online match.");
        return;
    }

    game.paused = true;
    game.pausedByPlayerKey = socket.session.playerKey;

    broadcastToRoom(room, {
        type: "game_paused",
        roomCode: room.roomCode,
        pausedByPlayerKey: game.pausedByPlayerKey,
        activePlayerKey: game.activePlayerKey,
        turnNumber: game.turnNumber
    });
}

function handleResumeGame(socket) {
    const room = getRoomForSocket(socket);

    if (!room || !room.game) {
        sendError(socket, "Game is not ready in this room.");
        return;
    }

    const { game } = room;

    if (game.phase === "finished") {
        sendError(socket, "The round has already finished.");
        return;
    }

    if (!game.paused) {
        return;
    }

    game.paused = false;
    game.pausedByPlayerKey = null;

    broadcastToRoom(room, {
        type: "game_resumed",
        roomCode: room.roomCode,
        resumedByPlayerKey: socket.session.playerKey,
        activePlayerKey: game.activePlayerKey,
        turnNumber: game.turnNumber
    });
}

function handleRestartRequest(socket) {
    const room = getRoomForSocket(socket);

    if (!room || !room.game) {
        sendError(socket, "Game is not ready in this room.");
        return;
    }

    if (room.sockets.length !== MAX_PLAYERS_PER_ROOM) {
        sendError(socket, "Restart needs two connected players.");
        return;
    }

    const { game } = room;
    const requesterPlayerKey = socket.session.playerKey;

    if (!game.restartRequestedByPlayerKey) {
        game.restartRequestedByPlayerKey = requesterPlayerKey;

        broadcastToRoom(room, {
            type: "restart_requested",
            roomCode: room.roomCode,
            requestedByPlayerKey: requesterPlayerKey
        });

        return;
    }

    if (game.restartRequestedByPlayerKey === requesterPlayerKey) {
        return;
    }

    restartRoomGame(room, requesterPlayerKey);
}

function handleBoardSettled(socket, message) {
    const room = getRoomForSocket(socket);

    if (!room || !room.game || room.game.phase !== "resolving") {
        return;
    }

    if (room.game.paused) {
        return;
    }

    const turnNumber = Number(message.turnNumber);

    if (!Number.isFinite(turnNumber) || turnNumber !== room.game.turnNumber) {
        return;
    }

    room.game.waitingFor.delete(socket.session.clientId);

    if (room.game.waitingFor.size > 0) {
        return;
    }

    const totalLaunched = getTotalLaunchedStones(room.game.launchedCounts);
    const roundComplete = totalLaunched >= (STONES_PER_PLAYER * MAX_PLAYERS_PER_ROOM);

    if (roundComplete) {
        room.game.phase = "finished";

        broadcastToRoom(room, {
            type: "round_finished",
            roomCode: room.roomCode,
            turnNumber: room.game.turnNumber
        });

        return;
    }

    room.game.phase = "aiming";
    room.game.activePlayerKey = room.game.nextPlayerKey;
    room.game.nextPlayerKey = null;
    room.game.turnNumber += 1;

    broadcastToRoom(room, {
        type: "turn_ready",
        roomCode: room.roomCode,
        activePlayerKey: room.game.activePlayerKey,
        turnNumber: room.game.turnNumber
    });
}

function restartRoomGame(room, restartedByPlayerKey) {
    syncRoomSlots(room);
    room.game = createRoomGameState();

    broadcastToRoom(room, {
        type: "game_restarted",
        roomCode: room.roomCode,
        players: getRoomPlayers(room),
        activePlayerKey: room.game.activePlayerKey,
        turnNumber: room.game.turnNumber,
        restartedByPlayerKey
    });
}

function createRoomGameState() {
    return {
        phase: "aiming",
        activePlayerKey: "player1",
        nextPlayerKey: null,
        paused: false,
        pausedByPlayerKey: null,
        restartRequestedByPlayerKey: null,
        turnNumber: 1,
        launchedCounts: {
            player1: 0,
            player2: 0
        },
        waitingFor: new Set()
    };
}

function broadcastRoomState(roomCode) {
    const room = rooms.get(roomCode);

    if (!room) {
        return;
    }

    broadcastToRoom(room, {
        type: "room_update",
        roomCode,
        players: getRoomPlayers(room),
        playerCount: room.sockets.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM
    });
}

function broadcastToRoom(room, payload) {
    room.sockets.forEach((socket) => {
        sendJson(socket, payload);
    });
}

function syncRoomSlots(room) {
    room.sockets.forEach((socket, index) => {
        socket.session.slot = index + 1;
        socket.session.playerKey = index === 0 ? "player1" : "player2";
    });
}

function clearSessionRoomData(socket) {
    if (!socket.session) {
        return;
    }

    socket.session.roomCode = null;
    socket.session.slot = null;
    socket.session.playerKey = null;
}

function getRoomPlayers(room) {
    return room.sockets.map((socket) => {
        return {
            clientId: socket.session.clientId,
            playerName: socket.session.playerName,
            slot: socket.session.slot,
            playerKey: socket.session.playerKey
        };
    });
}

function getRoomForSocket(socket) {
    const roomCode = socket.session?.roomCode;
    return roomCode ? rooms.get(roomCode) || null : null;
}

function getExpectedStoneId(playerKey, launchedCounts) {
    return `${playerKey}-stone-${launchedCounts[playerKey] + 1}`;
}

function getTotalLaunchedStones(launchedCounts) {
    return launchedCounts.player1 + launchedCounts.player2;
}

function getNextPlayerAfterShot(currentPlayerKey, launchedCounts) {
    const otherPlayerKey = currentPlayerKey === "player1" ? "player2" : "player1";
    const currentPlayerHasStones = launchedCounts[currentPlayerKey] < STONES_PER_PLAYER;
    const otherPlayerHasStones = launchedCounts[otherPlayerKey] < STONES_PER_PLAYER;

    if (otherPlayerHasStones) {
        return otherPlayerKey;
    }

    if (currentPlayerHasStones) {
        return currentPlayerKey;
    }

    return null;
}

function sendJson(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

function sendError(socket, message) {
    sendJson(socket, {
        type: "room_error",
        message
    });
}

function sanitizePlayerName(rawValue, fallbackValue) {
    const trimmedValue = String(rawValue || "").trim();
    return trimmedValue ? trimmedValue.slice(0, 24) : fallbackValue;
}

function sanitizeRoomCode(rawValue) {
    return String(rawValue || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 12);
}

function generateRoomCode() {
    return `ICE${Math.floor(100 + (Math.random() * 900))}`;
}
