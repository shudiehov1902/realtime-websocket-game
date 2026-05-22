const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusText = document.getElementById("statusText");
const heroControls = document.getElementById("heroControls");
const pauseButton = document.getElementById("pauseButton");
const resumeButton = document.getElementById("resumeButton");
const restartButton = document.getElementById("restartButton");
const disconnectGameButton = document.getElementById("disconnectGameButton");
const homeScreen = document.getElementById("homeScreen");
const rulesScreen = document.getElementById("rulesScreen");
const lobbyScreen = document.getElementById("lobbyScreen");
const gameScreen = document.getElementById("gameScreen");
const startLocalButton = document.getElementById("startLocalButton");
const openLobbyButton = document.getElementById("openLobbyButton");
const importJsonButton = document.getElementById("importJsonButton");
const importJsonInput = document.getElementById("importJsonInput");
const openRulesButton = document.getElementById("openRulesButton");
const lobbyForm = document.getElementById("lobbyForm");
const playerNameInput = document.getElementById("playerNameInput");
const roomCodeInput = document.getElementById("roomCodeInput");
const disconnectLobbyButton = document.getElementById("disconnectLobbyButton");
const backToHomeButton = document.getElementById("backToHomeButton");
const backFromRulesButton = document.getElementById("backFromRulesButton");
const serverStatusText = document.getElementById("serverStatusText");

const playerColors = {
    player1: "#d34b4b",
    player2: "#3d6fd1"
};

const CONFIG_DEFAULTS = {
    board: {
        padding: 40
    },
    physics: {
        maxDragDistance: 220,
        launchPowerMultiplier: 0.03,
        frictionPerFrame: 0.985,
        stoneCollisionDamping: 0.96,
        wallBounceDamping: 0.88,
        stopSpeedThreshold: 0.12
    }
};

const SIMULATION_FRAME_MS = 1000 / 60;
const MAX_FRAME_DELTA_MS = 100;
const MAX_SIMULATION_STEPS = 8;

let gameConfig = null;
let canvasSize = {
    width: 0,
    height: 0
};

const gameState = {
    activePlayer: "player1",
    stones: [],
    roundResult: null
};

const simulationState = {
    animationFrameId: null,
    lastTimestamp: 0,
    accumulatorMs: 0
};

const controlState = {
    isPaused: false
};

const aimState = {
    hoveredStoneId: null,
    draggingStoneId: null,
    pointerBoardX: 0,
    pointerBoardY: 0,
    lastPreview: null
};

const uiState = {
    currentScreen: "home",
    gameMode: "menu",
    playerName: "Player 1",
    roomCode: "ICE42"
};

const networkState = {
    socket: null,
    serverUrl: getWebSocketServerUrl(),
    connectionState: "disconnected",
    clientId: null,
    roomCode: null,
    players: [],
    pendingLobbyAction: null,
    localPlayerKey: null,
    currentTurnNumber: 0,
    pendingNextPlayerKey: null,
    awaitingTurnReady: false,
    gameStarted: false,
    pausedByPlayerKey: null,
    restartRequestedByPlayerKey: null
};

async function init() {
    try {
        const response = await fetch("./config/game-config.json?v=minimal-lobby-20260415-1", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Config request failed with status ${response.status}.`);
        }

        gameConfig = normalizeGameConfig(await response.json());
        setupInitialGameState();

        setupCanvasInteractions();
        setupControlButtons();
        setupScreenFlow();
        renderGameSummary();
        updateServerStatus("");
        setScreen("home");
        window.addEventListener("resize", handleWindowResize);

        statusText.textContent = "";
    } catch (error) {
        statusText.textContent = `Error: ${error.message}`;
        statusText.classList.add("status--error");
        console.error(error);
    }
}

function normalizeGameConfig(rawConfig) {
    const physics = rawConfig.physics || {};
    const board = rawConfig.board || {};

    return {
        ...rawConfig,
        board: {
            ...board,
            padding: getFiniteConfigValue(board.padding, CONFIG_DEFAULTS.board.padding)
        },
        physics: {
            maxDragDistance: getFiniteConfigValue(physics.maxDragDistance, CONFIG_DEFAULTS.physics.maxDragDistance),
            launchPowerMultiplier: getFiniteConfigValue(physics.launchPowerMultiplier, CONFIG_DEFAULTS.physics.launchPowerMultiplier),
            frictionPerFrame: getFiniteConfigValue(physics.frictionPerFrame, CONFIG_DEFAULTS.physics.frictionPerFrame),
            stoneCollisionDamping: getFiniteConfigValue(physics.stoneCollisionDamping, CONFIG_DEFAULTS.physics.stoneCollisionDamping),
            wallBounceDamping: getFiniteConfigValue(physics.wallBounceDamping, CONFIG_DEFAULTS.physics.wallBounceDamping),
            stopSpeedThreshold: getFiniteConfigValue(physics.stopSpeedThreshold, CONFIG_DEFAULTS.physics.stopSpeedThreshold)
        }
    };
}

function validateGameConfig(config) {
    if (!Number.isFinite(Number(config.board?.baseWidth)) || Number(config.board.baseWidth) <= 0) {
        throw new Error("JSON must contain a positive board.baseWidth value.");
    }

    if (!Number.isFinite(Number(config.board?.baseHeight)) || Number(config.board.baseHeight) <= 0) {
        throw new Error("JSON must contain a positive board.baseHeight value.");
    }

    if (!Number.isFinite(Number(config.target?.x)) || !Number.isFinite(Number(config.target?.y))) {
        throw new Error("JSON must contain valid target.x and target.y coordinates.");
    }

    if (!Number.isFinite(Number(config.target?.radius)) || Number(config.target.radius) <= 0) {
        throw new Error("JSON must contain a positive target.radius value.");
    }

    if (!Number.isInteger(Number(config.stonesPerPlayer)) || Number(config.stonesPerPlayer) <= 0) {
        throw new Error("JSON must contain a positive integer stonesPerPlayer value.");
    }

    if (!Number.isFinite(Number(config.stoneRadius)) || Number(config.stoneRadius) <= 0) {
        throw new Error("JSON must contain a positive stoneRadius value.");
    }

    if (!Number.isFinite(Number(config.startPositions?.player1?.x)) || !Number.isFinite(Number(config.startPositions?.player1?.y))) {
        throw new Error("JSON must contain valid startPositions.player1 coordinates.");
    }

    if (!Number.isFinite(Number(config.startPositions?.player2?.x)) || !Number.isFinite(Number(config.startPositions?.player2?.y))) {
        throw new Error("JSON must contain valid startPositions.player2 coordinates.");
    }
}

function getFiniteConfigValue(value, fallback) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function setupInitialGameState() {
    gameState.activePlayer = "player1";
    gameState.stones = createInitialStones();
    gameState.roundResult = null;
}

function setupControlButtons() {
    pauseButton.addEventListener("click", pauseGame);
    resumeButton.addEventListener("click", resumeGame);
    restartButton.addEventListener("click", restartRound);
    disconnectGameButton.addEventListener("click", disconnectOnlineFlow);
    updateControlButtons();
}

function setupScreenFlow() {
    startLocalButton.addEventListener("click", handleStartLocalGame);
    openLobbyButton.addEventListener("click", openOnlineLobby);
    importJsonButton.addEventListener("click", openJsonImportPicker);
    importJsonInput.addEventListener("change", handleJsonImport);
    openRulesButton.addEventListener("click", showRulesScreen);
    disconnectLobbyButton.addEventListener("click", disconnectOnlineFlow);
    backToHomeButton.addEventListener("click", showHomeScreen);
    backFromRulesButton.addEventListener("click", showHomeScreen);
    lobbyForm.addEventListener("submit", handleLobbySubmit);
}

function openJsonImportPicker() {
    importJsonInput.click();
}

async function handleJsonImport(event) {
    const importedFile = event.target.files?.[0];

    if (!importedFile) {
        return;
    }

    try {
        const rawText = await importedFile.text();
        const parsedConfig = JSON.parse(rawText);
        const normalizedConfig = normalizeGameConfig(parsedConfig);

        validateGameConfig(normalizedConfig);

        gameConfig = normalizedConfig;
        stopSimulationLoop();
        controlState.isPaused = false;
        resetAimState();
        setupInitialGameState();
        updateControlButtons();
        updateCanvasCursor();
        renderGameSummary();

        if (uiState.currentScreen === "game") {
            resizeCanvas();
            renderScene();
        }

        statusText.textContent = `JSON imported from ${importedFile.name}. The new config will be used for the next round.`;
    } catch (error) {
        statusText.textContent = `Import JSON failed: ${error.message}`;
    } finally {
        importJsonInput.value = "";
    }
}

function handleStartLocalGame() {
    disconnectFromServer();
    uiState.gameMode = "local";
    setScreen("game");
    startFreshLocalMatch("Local match started. Drag the highlighted stone to begin.");
}

function openOnlineLobby() {
    uiState.gameMode = "online";
    playerNameInput.value = uiState.playerName;
    roomCodeInput.value = uiState.roomCode;
    setScreen("lobby");
    updateServerStatus("");
    connectToServer();
    statusText.textContent = "";
}

function showRulesScreen() {
    disconnectFromServer();
    uiState.gameMode = "menu";
    setScreen("rules");
    statusText.textContent = "";
}

function showHomeScreen() {
    disconnectFromServer();
    uiState.gameMode = "menu";
    setScreen("home");
    updateServerStatus("");
    statusText.textContent = "";
}

function disconnectOnlineFlow() {
    const hadConnection = Boolean(networkState.socket)
        || Boolean(networkState.roomCode)
        || uiState.gameMode === "online";

    disconnectFromServer();
    stopSimulationLoop();
    controlState.isPaused = false;
    resetAimState();
    uiState.gameMode = "menu";
    setScreen("home");
    updateServerStatus("");
    statusText.textContent = hadConnection
        ? "Connection closed."
        : "No active connection.";
}

function handleLobbySubmit(event) {
    event.preventDefault();

    const action = event.submitter?.dataset.lobbyAction || "create";
    const fallbackRoomCode = action === "create" ? generateRoomCode() : uiState.roomCode || "ICE42";

    uiState.playerName = sanitizePlayerName(playerNameInput.value);
    uiState.roomCode = sanitizeRoomCode(roomCodeInput.value, fallbackRoomCode);

    playerNameInput.value = uiState.playerName;
    roomCodeInput.value = uiState.roomCode;

    if (!sendSocketMessage({
        type: action === "create" ? "create_room" : "join_room",
        playerName: uiState.playerName,
        roomCode: uiState.roomCode
    })) {
        updateServerStatus("Server is not connected yet. Start the WebSocket server and reopen the lobby.");
        statusText.textContent = "WebSocket server is not connected yet. Start it and try again.";
        return;
    }

    networkState.pendingLobbyAction = action;

    updateServerStatus(
        action === "create"
            ? `Create request sent for room ${uiState.roomCode}. Waiting for the server reply.`
            : `Join request sent for room ${uiState.roomCode}. Waiting for the server reply.`
    );

    statusText.textContent = action === "create"
        ? `Create room sent for ${uiState.roomCode}.`
        : `Join room sent for ${uiState.roomCode}.`;
}

function startFreshLocalMatch(statusMessage) {
    stopSimulationLoop();
    controlState.isPaused = false;
    resetAimState();
    setupInitialGameState();
    networkState.currentTurnNumber = 0;
    networkState.pendingNextPlayerKey = null;
    networkState.awaitingTurnReady = false;
    networkState.gameStarted = false;
    networkState.localPlayerKey = null;
    networkState.pausedByPlayerKey = null;
    networkState.restartRequestedByPlayerKey = null;
    updateControlButtons();
    updateCanvasCursor();
    renderGameSummary();
    resizeCanvas();
    renderScene();
    statusText.textContent = statusMessage;
}

function startFreshOnlineMatch(message) {
    stopSimulationLoop();
    controlState.isPaused = false;
    resetAimState();
    setupInitialGameState();
    gameState.activePlayer = message.activePlayerKey;
    gameState.roundResult = null;
    networkState.players = message.players || [];
    networkState.localPlayerKey = getLocalPlayerKeyFromPlayers(networkState.players);
    networkState.currentTurnNumber = message.turnNumber || 1;
    networkState.pendingNextPlayerKey = null;
    networkState.awaitingTurnReady = false;
    networkState.gameStarted = true;
    networkState.pausedByPlayerKey = null;
    networkState.restartRequestedByPlayerKey = null;

    uiState.gameMode = "online";
    setScreen("game");
    updateControlButtons();
    updateCanvasCursor();
    renderGameSummary();
    resizeCanvas();
    renderScene();
    statusText.textContent = buildTurnStatusMessage();
}

function setScreen(screenName) {
    uiState.currentScreen = screenName;
    homeScreen.hidden = screenName !== "home";
    rulesScreen.hidden = screenName !== "rules";
    lobbyScreen.hidden = screenName !== "lobby";
    gameScreen.hidden = screenName !== "game";
    heroControls.hidden = screenName !== "game";

    updateControlButtons();

    if (screenName === "game") {
        requestAnimationFrame(() => {
            resizeCanvas();
            renderScene();
        });
    }
}

function handleWindowResize() {
    if (uiState.currentScreen === "game") {
        resizeCanvas();
    }
}

function updateServerStatus(message) {
    if (!serverStatusText) {
        return;
    }

    serverStatusText.textContent = message;
}

function getWebSocketServerUrl() {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    if (isLocalhost) {
        return "ws://127.0.0.1:3000";
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
}

function connectToServer() {
    if (networkState.socket && networkState.socket.readyState === WebSocket.OPEN) {
        return;
    }

    if (networkState.socket && networkState.socket.readyState === WebSocket.CONNECTING) {
        return;
    }

    networkState.connectionState = "connecting";
    updateServerStatus("");

    const socket = new WebSocket(networkState.serverUrl);
    networkState.socket = socket;

    socket.addEventListener("open", handleSocketOpen);
    socket.addEventListener("message", handleSocketMessage);
    socket.addEventListener("close", handleSocketClose);
    socket.addEventListener("error", handleSocketError);
}

function disconnectFromServer() {
    resetRoomSession();

    if (!networkState.socket) {
        networkState.connectionState = "disconnected";
        networkState.clientId = null;
        return;
    }

    const socket = networkState.socket;
    networkState.socket = null;
    networkState.connectionState = "disconnected";
    networkState.clientId = null;

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, "Leaving local screen flow.");
    }
}

function resetRoomSession() {
    networkState.roomCode = null;
    networkState.players = [];
    networkState.pendingLobbyAction = null;
    networkState.localPlayerKey = null;
    networkState.currentTurnNumber = 0;
    networkState.pendingNextPlayerKey = null;
    networkState.awaitingTurnReady = false;
    networkState.gameStarted = false;
    networkState.pausedByPlayerKey = null;
    networkState.restartRequestedByPlayerKey = null;
}

function sendSocketMessage(payload) {
    if (!networkState.socket || networkState.socket.readyState !== WebSocket.OPEN) {
        return false;
    }

    networkState.socket.send(JSON.stringify(payload));
    return true;
}

function handleSocketOpen() {
    networkState.connectionState = "connected";
    updateServerStatus("");
    statusText.textContent = uiState.currentScreen === "lobby" ? "" : "WebSocket connection opened.";
}

function handleSocketMessage(event) {
    let message;

    try {
        message = JSON.parse(event.data);
    } catch (error) {
        console.error("Invalid WebSocket message:", error);
        return;
    }

    if (message.type === "connection_ready") {
        networkState.clientId = message.clientId;
        return;
    }

    if (message.type === "room_joined") {
        const lobbyAction = networkState.pendingLobbyAction;
        networkState.roomCode = message.roomCode;
        networkState.players = message.players || [];
        networkState.localPlayerKey = getLocalPlayerKeyFromPlayers(networkState.players);
        networkState.pendingLobbyAction = null;

        updateServerStatus(
            message.playerCount < message.maxPlayers
                ? lobbyAction === "join"
                    ? `Joined room ${message.roomCode}. Waiting for the second player.`
                    : `Room ${message.roomCode} created. Waiting for the second player.`
                : `Room ${message.roomCode} is full. Preparing the match.`
        );
        statusText.textContent = "";
        return;
    }

    if (message.type === "room_update") {
        networkState.roomCode = message.roomCode;
        networkState.players = message.players || [];
        networkState.localPlayerKey = getLocalPlayerKeyFromPlayers(networkState.players);

        if (uiState.currentScreen === "lobby") {
            updateServerStatus(
                message.playerCount < message.maxPlayers
                    ? `Room ${message.roomCode} is open. Waiting for the second player.`
                    : `Room ${message.roomCode} is full and ready to start.`
            );
        }

        if (uiState.gameMode === "online" && uiState.currentScreen === "game" && message.playerCount < message.maxPlayers) {
            stopSimulationLoop();
            controlState.isPaused = false;
            networkState.pausedByPlayerKey = null;
            networkState.restartRequestedByPlayerKey = null;
            networkState.awaitingTurnReady = false;
            networkState.gameStarted = false;
            setScreen("lobby");
            updateServerStatus(`Room ${message.roomCode} lost a player. Waiting for someone to reconnect or join again.`);
            statusText.textContent = "";
        }

        return;
    }

    if (message.type === "game_ready") {
        networkState.roomCode = message.roomCode;
        startFreshOnlineMatch(message);
        updateServerStatus("");
        return;
    }

    if (message.type === "shot_started") {
        networkState.currentTurnNumber = message.turnNumber;
        networkState.pendingNextPlayerKey = message.nextPlayerKey;
        networkState.awaitingTurnReady = true;
        applyNetworkShot(message);
        return;
    }

    if (message.type === "turn_ready") {
        networkState.awaitingTurnReady = false;
        networkState.currentTurnNumber = message.turnNumber;
        networkState.pendingNextPlayerKey = null;
        networkState.pausedByPlayerKey = null;
        networkState.restartRequestedByPlayerKey = null;
        gameState.activePlayer = message.activePlayerKey;
        aimState.lastPreview = null;
        aimState.hoveredStoneId = null;
        controlState.isPaused = false;
        updateControlButtons();
        updateCanvasCursor();
        renderScene();
        statusText.textContent = buildTurnStatusMessage();
        return;
    }

    if (message.type === "game_paused") {
        applyNetworkPause(message);
        return;
    }

    if (message.type === "game_resumed") {
        applyNetworkResume(message);
        return;
    }

    if (message.type === "restart_requested") {
        applyNetworkRestartRequest(message);
        return;
    }

    if (message.type === "game_restarted") {
        applyNetworkRestarted(message);
        return;
    }

    if (message.type === "round_finished") {
        networkState.awaitingTurnReady = false;
        networkState.pendingNextPlayerKey = null;
        networkState.pausedByPlayerKey = null;
        networkState.restartRequestedByPlayerKey = null;
        gameState.roundResult = calculateRoundResult();
        controlState.isPaused = false;
        updateControlButtons();
        updateCanvasCursor();
        statusText.textContent = buildRoundFinishedStatusMessage();
        renderScene();

        return;
    }

    if (message.type === "room_error") {
        networkState.pendingLobbyAction = null;
        updateServerStatus(`Server rejected the request: ${message.message}`);
        statusText.textContent = uiState.currentScreen === "lobby"
            ? ""
            : `WebSocket server error: ${message.message}`;
    }
}

function handleSocketClose() {
    networkState.socket = null;
    networkState.connectionState = "disconnected";
    networkState.clientId = null;
    controlState.isPaused = false;
    resetRoomSession();

    if (uiState.currentScreen === "lobby") {
        updateServerStatus("Connection closed. Start the WebSocket server and reopen the lobby.");
        statusText.textContent = "";
        return;
    }

    if (uiState.gameMode === "online" && uiState.currentScreen === "game") {
        setScreen("lobby");
        updateServerStatus("Connection lost during the online match. Reconnect to the server and rejoin the room.");
        statusText.textContent = "";
    }
}

function handleSocketError() {
    networkState.connectionState = "error";

    if (uiState.currentScreen === "lobby") {
        updateServerStatus(`Could not connect to ${networkState.serverUrl}. Start the WebSocket server first.`);
        statusText.textContent = "";
        return;
    }

    if (uiState.gameMode === "online" && uiState.currentScreen === "game") {
        statusText.textContent = "The online match lost the connection to the WebSocket server.";
    }
}

function sanitizePlayerName(rawValue) {
    const trimmedValue = String(rawValue || "").trim();
    return trimmedValue ? trimmedValue.slice(0, 24) : "Player 1";
}

function sanitizeRoomCode(rawValue, fallbackValue) {
    const normalizedValue = String(rawValue || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 12);

    return normalizedValue || fallbackValue;
}

function generateRoomCode() {
    return `ICE${Math.floor(100 + (Math.random() * 900))}`;
}

function formatPlayerList(players) {
    if (!players || players.length === 0) {
        return "no players yet";
    }

    return players.map((player) => player.playerName).join(", ");
}

function getPlayerEntryByKey(playerKey) {
    return networkState.players.find((player) => player.playerKey === playerKey) || null;
}

function getLocalPlayerKeyFromPlayers(players) {
    const localPlayer = (players || []).find((player) => player.clientId === networkState.clientId);
    return localPlayer ? localPlayer.playerKey : null;
}

function isOnlineGame() {
    return uiState.gameMode === "online" && networkState.gameStarted;
}

function isLocalPlayersTurn() {
    return isOnlineGame() && networkState.localPlayerKey === gameState.activePlayer;
}

function canLocalPlayerAct() {
    if (!isOnlineGame()) {
        return true;
    }

    return isLocalPlayersTurn() && !networkState.awaitingTurnReady;
}

function buildTurnStatusMessage() {
    if (!isOnlineGame()) {
        const activeStone = getActiveStone();
        return activeStone
            ? `${formatStoneName(activeStone)} is ready.`
            : "The board is ready.";
    }

    if (isLocalPlayersTurn()) {
        const activeStone = getActiveStone();
        return activeStone
            ? `Your turn. Drag ${formatStoneName(activeStone)} and launch the shot.`
            : "Your turn. The board is ready.";
    }

    const activePlayerName = formatPlayerName(gameState.activePlayer);
    return `Waiting for ${activePlayerName} to play.`;
}

function buildRoundFinishedStatusMessage() {
    if (!gameState.roundResult) {
        return "Round finished.";
    }

    if (gameState.roundResult.isTie) {
        return `Round finished with a tie. ${formatStoneName(gameState.roundResult.bestStone)} shares the closest distance of ${formatDistance(gameState.roundResult.bestDistance)} px.`;
    }

    return `Round finished. ${formatPlayerName(gameState.roundResult.winnerPlayerKey)} wins because ${formatStoneName(gameState.roundResult.bestStone)} is closest to the target at ${formatDistance(gameState.roundResult.bestDistance)} px.`;
}

function buildPausedStatusMessage(pausedByPlayerKey) {
    const pausedByLabel = !pausedByPlayerKey
        ? "A player"
        : pausedByPlayerKey === networkState.localPlayerKey
        ? "You"
        : formatPlayerName(pausedByPlayerKey);
    const suffix = isAnyStoneMoving()
        ? "The moving stones are frozen until someone presses Resume."
        : "Throwing is locked until someone presses Resume.";

    return `${pausedByLabel} paused the online match. ${suffix}`;
}

function buildResumedStatusMessage(resumedByPlayerKey) {
    if (isAnyStoneMoving()) {
        if (!resumedByPlayerKey) {
            return "The online match resumed. Frozen movement continues.";
        }

        return resumedByPlayerKey === networkState.localPlayerKey
            ? "You resumed the online match. Frozen movement continues."
            : `${formatPlayerName(resumedByPlayerKey)} resumed the online match. Frozen movement continues.`;
    }

    return buildTurnStatusMessage();
}

function buildRestartRequestedStatusMessage(requestedByPlayerKey) {
    if (!requestedByPlayerKey) {
        return "A restart request is waiting for confirmation.";
    }

    return requestedByPlayerKey === networkState.localPlayerKey
        ? "Restart request sent. Waiting for the other player to confirm."
        : `${formatPlayerName(requestedByPlayerKey)} wants to restart the round. Press Restart Round to confirm.`;
}

function buildRestartedStatusMessage(restartedByPlayerKey) {
    if (!restartedByPlayerKey) {
        return "The online round was restarted.";
    }

    return restartedByPlayerKey === networkState.localPlayerKey
        ? "Restart confirmed. A fresh online round has started."
        : `${formatPlayerName(restartedByPlayerKey)} confirmed the restart. A fresh online round has started.`;
}

function applySharedPauseState(isPaused, pausedByPlayerKey) {
    controlState.isPaused = isPaused;
    networkState.pausedByPlayerKey = isPaused ? pausedByPlayerKey : null;
    aimState.draggingStoneId = null;
    aimState.hoveredStoneId = null;
    aimState.lastPreview = null;

    updateControlButtons();
    updateCanvasCursor();
    renderGameSummary();
    renderScene();
}

function applyNetworkPause(message) {
    gameState.activePlayer = message.activePlayerKey || gameState.activePlayer;
    networkState.currentTurnNumber = message.turnNumber || networkState.currentTurnNumber;
    applySharedPauseState(true, message.pausedByPlayerKey || null);
    statusText.textContent = buildPausedStatusMessage(message.pausedByPlayerKey || null);
}

function applyNetworkResume(message) {
    gameState.activePlayer = message.activePlayerKey || gameState.activePlayer;
    networkState.currentTurnNumber = message.turnNumber || networkState.currentTurnNumber;
    applySharedPauseState(false, null);

    if (isAnyStoneMoving() && !simulationState.animationFrameId) {
        startSimulationLoop();
    }

    statusText.textContent = buildResumedStatusMessage(message.resumedByPlayerKey || null);
}

function applyNetworkRestartRequest(message) {
    networkState.restartRequestedByPlayerKey = message.requestedByPlayerKey || null;
    updateControlButtons();
    statusText.textContent = buildRestartRequestedStatusMessage(message.requestedByPlayerKey || null);
}

function applyNetworkRestarted(message) {
    stopSimulationLoop();
    controlState.isPaused = false;
    resetAimState();
    setupInitialGameState();
    gameState.activePlayer = message.activePlayerKey;
    gameState.roundResult = null;
    networkState.players = message.players || networkState.players;
    networkState.localPlayerKey = getLocalPlayerKeyFromPlayers(networkState.players);
    networkState.currentTurnNumber = message.turnNumber || 1;
    networkState.pendingNextPlayerKey = null;
    networkState.awaitingTurnReady = false;
    networkState.gameStarted = true;
    networkState.pausedByPlayerKey = null;
    networkState.restartRequestedByPlayerKey = null;

    updateControlButtons();
    updateCanvasCursor();
    renderGameSummary();
    resizeCanvas();
    renderScene();
    statusText.textContent = buildRestartedStatusMessage(message.restartedByPlayerKey || null);
}

function applyShotImpulse(stone, shotDx, shotDy) {
    stone.launched = true;
    stone.isMoving = true;
    stone.vx = shotDx * gameConfig.physics.launchPowerMultiplier;
    stone.vy = shotDy * gameConfig.physics.launchPowerMultiplier;
}

function applyNetworkShot(message) {
    const stone = gameState.stones.find((item) => item.id === message.stoneId);

    if (!stone) {
        statusText.textContent = `The server launched an unknown stone: ${message.stoneId}.`;
        return;
    }

    aimState.draggingStoneId = null;
    aimState.hoveredStoneId = null;
    aimState.lastPreview = null;
    gameState.activePlayer = message.playerKey;

    applyShotImpulse(stone, message.shotDx, message.shotDy);

    statusText.textContent = message.playerKey === networkState.localPlayerKey
        ? `Your shot is in motion. Waiting for the board to settle.`
        : `${formatPlayerName(message.playerKey)} launched ${formatStoneName(stone)}. Waiting for the board to settle.`;

    updateCanvasCursor();
    renderScene();
    startSimulationLoop();
}

function createInitialStones() {
    const stones = [];

    Object.entries(gameConfig.startPositions).forEach(([playerKey, startPosition]) => {
        for (let index = 0; index < gameConfig.stonesPerPlayer; index += 1) {
            const isFrontStone = index === 0;
            const reserveSlot = index - 1;
            const reserveCenter = (gameConfig.stonesPerPlayer - 2) / 2;
            const reserveOffset = reserveSlot - reserveCenter;

            stones.push({
                id: `${playerKey}-stone-${index + 1}`,
                owner: playerKey,
                number: index + 1,
                radius: gameConfig.stoneRadius,
                x: isFrontStone ? startPosition.x : startPosition.x - (gameConfig.stoneRadius * 3),
                y: isFrontStone
                    ? startPosition.y
                    : startPosition.y + (reserveOffset * gameConfig.stoneRadius * 2.4),
                vx: 0,
                vy: 0,
                isMoving: false,
                launched: false
            });
        }
    });

    return stones;
}

function renderGameSummary() {
    // The side HUD was removed from the interface, so there is no summary panel to render here.
}

function resizeCanvas() {
    if (!gameConfig || uiState.currentScreen !== "game") {
        return;
    }

    const wrapper = canvas.parentElement;
    const wrapperStyles = window.getComputedStyle(wrapper);
    const horizontalPadding = parseFloat(wrapperStyles.paddingLeft) + parseFloat(wrapperStyles.paddingRight);
    const verticalPadding = parseFloat(wrapperStyles.paddingTop) + parseFloat(wrapperStyles.paddingBottom);
    const aspectRatio = gameConfig.board.baseWidth / gameConfig.board.baseHeight;
    const availableWidth = Math.max(220, wrapper.clientWidth - horizontalPadding);
    const availableHeight = Math.max(180, wrapper.clientHeight - verticalPadding);

    let cssWidth = availableWidth;
    let cssHeight = cssWidth / aspectRatio;

    if (cssHeight > availableHeight) {
        cssHeight = availableHeight;
        cssWidth = cssHeight * aspectRatio;
    }

    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvasSize.width = cssWidth;
    canvasSize.height = cssHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderScene();
}

function renderScene() {
    const { width, height } = canvasSize;

    if (!width || !height) {
        return;
    }

    const scaleX = width / gameConfig.board.baseWidth;
    const scaleY = height / gameConfig.board.baseHeight;
    const scale = Math.min(scaleX, scaleY);

    ctx.clearRect(0, 0, width, height);

    const iceGradient = ctx.createLinearGradient(0, 0, 0, height);
    iceGradient.addColorStop(0, "#dff5ff");
    iceGradient.addColorStop(1, "#c5eaf8");
    ctx.fillStyle = iceGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#89bad4";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, width, height);

    drawLaneLines(width, height, scale);
    drawStartZones(scaleX, scaleY);
    drawTarget(scaleX, scaleY);
    drawRoundResult(scaleX, scaleY);
    drawAimingGuide(scaleX, scaleY);

    ctx.fillStyle = "#33506b";
    ctx.font = `${16 * scale}px Trebuchet MS`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Player queues", 60 * scaleX, 90 * scaleY);

    drawStones(scaleX, scaleY);
    drawPauseOverlay(scaleX, scaleY);
}

function drawLaneLines(width, height, scale) {
    const padding = gameConfig.board.padding * scale;
    const startLineX = gameConfig.startPositions.player1.x * (width / gameConfig.board.baseWidth);
    const targetLineX = gameConfig.target.x * (width / gameConfig.board.baseWidth);

    ctx.strokeStyle = "rgba(78, 129, 159, 0.48)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, height / 2);
    ctx.lineTo(width - padding, height / 2);
    ctx.moveTo(startLineX, padding);
    ctx.lineTo(startLineX, height - padding);
    ctx.moveTo(targetLineX, padding);
    ctx.lineTo(targetLineX, height - padding);
    ctx.stroke();
}

function drawStartZones(scaleX, scaleY) {
    Object.entries(gameConfig.startPositions).forEach(([playerKey, startPosition]) => {
        const width = gameConfig.stoneRadius * 10 * scaleX;
        const height = gameConfig.stoneRadius * 3 * scaleY;
        const x = (startPosition.x - (gameConfig.stoneRadius * 7.4)) * scaleX;
        const y = (startPosition.y - (height / scaleY / 2)) * scaleY;

        ctx.fillStyle = `${playerColors[playerKey]}18`;
        ctx.strokeStyle = `${playerColors[playerKey]}55`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 14);
        ctx.fill();
        ctx.stroke();
    });
}

function drawTarget(scaleX, scaleY) {
    const targetX = gameConfig.target.x * scaleX;
    const targetY = gameConfig.target.y * scaleY;
    const targetRadius = gameConfig.target.radius * Math.min(scaleX, scaleY);
    const rings = [
        { radius: targetRadius, color: "#3c7fd3" },
        { radius: targetRadius * 0.66, color: "#f5fbff" },
        { radius: targetRadius * 0.33, color: "#d34848" }
    ];

    rings.forEach((ring) => {
        ctx.beginPath();
        ctx.fillStyle = ring.color;
        ctx.arc(targetX, targetY, ring.radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawStones(scaleX, scaleY) {
    gameState.stones.forEach((stone) => {
        drawStone(stone, scaleX, scaleY);
    });
}

function drawStone(stone, scaleX, scaleY) {
    const x = stone.x * scaleX;
    const y = stone.y * scaleY;
    const radius = stone.radius * Math.min(scaleX, scaleY);
    const isActiveStone = stone.id === getActiveStoneId();
    const isHoveredStone = stone.id === aimState.hoveredStoneId;
    const isDraggingStone = stone.id === aimState.draggingStoneId;
    const isWinningStone = gameState.roundResult && gameState.roundResult.bestStone.id === stone.id;

    if (isWinningStone) {
        ctx.beginPath();
        ctx.fillStyle = gameState.roundResult.isTie
            ? "rgba(226, 150, 44, 0.22)"
            : "rgba(37, 166, 91, 0.2)";
        ctx.arc(x, y, radius * 1.65, 0, Math.PI * 2);
        ctx.fill();
    }

    if (isActiveStone) {
        ctx.beginPath();
        ctx.fillStyle = isDraggingStone
            ? "rgba(15, 111, 168, 0.3)"
            : isHoveredStone
                ? "rgba(15, 111, 168, 0.22)"
                : "rgba(15, 111, 168, 0.16)";
        ctx.arc(x, y, radius * 1.45, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.beginPath();
    ctx.fillStyle = playerColors[stone.owner];
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#17324d";
    ctx.font = `${radius * 0.9}px Trebuchet MS`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(stone.number), x, y);
}

function drawRoundResult(scaleX, scaleY) {
    if (!gameState.roundResult) {
        return;
    }

    const { bestStone, bestDistance, isTie, winnerPlayerKey } = gameState.roundResult;
    const stoneX = bestStone.x * scaleX;
    const stoneY = bestStone.y * scaleY;
    const targetX = gameConfig.target.x * scaleX;
    const targetY = gameConfig.target.y * scaleY;
    const guideScale = Math.min(scaleX, scaleY);
    const label = isTie
        ? `Tie at ${formatDistance(bestDistance)} px`
        : `${formatPlayerName(winnerPlayerKey)} wins`;

    ctx.save();

    ctx.beginPath();
    ctx.strokeStyle = isTie ? "#e2962c" : "#25a65b";
    ctx.lineWidth = 3;
    ctx.setLineDash([10 * guideScale, 8 * guideScale]);
    ctx.moveTo(stoneX, stoneY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = isTie ? "#e2962c" : "#25a65b";
    ctx.font = `${15 * guideScale}px Trebuchet MS`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, stoneX + (14 * guideScale), stoneY - (16 * guideScale));

    ctx.restore();
}

function drawPauseOverlay(scaleX, scaleY) {
    if (!controlState.isPaused) {
        return;
    }

    const width = canvasSize.width;
    const height = canvasSize.height;
    const guideScale = Math.min(scaleX, scaleY);
    const resumeLabel = isOnlineGame() ? "someone presses Resume" : "you press Resume";
    const subtitle = isAnyStoneMoving()
        ? `Movement is frozen until ${resumeLabel}.`
        : `Throwing is locked until ${resumeLabel}.`;

    ctx.save();

    ctx.fillStyle = "rgba(247, 251, 255, 0.62)";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#16324f";
    ctx.font = `${34 * guideScale}px Trebuchet MS`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", width / 2, height / 2 - (18 * guideScale));

    ctx.fillStyle = "#54708b";
    ctx.font = `${16 * guideScale}px Trebuchet MS`;
    ctx.fillText(subtitle, width / 2, height / 2 + (18 * guideScale));

    ctx.restore();
}

function drawAimingGuide(scaleX, scaleY) {
    const draggingStone = getDraggingStone();
    const preview = getLiveAimPreview();

    if (!draggingStone || !preview || preview.powerRatio <= 0) {
        return;
    }

    const guideScale = Math.min(scaleX, scaleY);
    const stoneX = draggingStone.x * scaleX;
    const stoneY = draggingStone.y * scaleY;
    const pullX = preview.pullEndX * scaleX;
    const pullY = preview.pullEndY * scaleY;
    const shotEndX = (draggingStone.x + preview.shotDx) * scaleX;
    const shotEndY = (draggingStone.y + preview.shotDy) * scaleY;
    const maxRadius = gameConfig.physics.maxDragDistance * guideScale;

    ctx.save();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(15, 111, 168, 0.18)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8 * guideScale, 8 * guideScale]);
    ctx.arc(stoneX, stoneY, maxRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(210, 108, 55, 0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12 * guideScale, 10 * guideScale]);
    ctx.moveTo(stoneX, stoneY);
    ctx.lineTo(pullX, pullY);
    ctx.stroke();

    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#0f6fa8";
    ctx.lineWidth = 4;
    ctx.moveTo(stoneX, stoneY);
    ctx.lineTo(shotEndX, shotEndY);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = "#d26c37";
    ctx.arc(pullX, pullY, 7 * guideScale, 0, Math.PI * 2);
    ctx.fill();

    drawArrowHead(stoneX, stoneY, shotEndX, shotEndY, 16 * guideScale);

    ctx.restore();
}

function drawArrowHead(startX, startY, endX, endY, size) {
    const angle = Math.atan2(endY - startY, endX - startX);

    ctx.beginPath();
    ctx.fillStyle = "#0f6fa8";
    ctx.moveTo(endX, endY);
    ctx.lineTo(
        endX - (Math.cos(angle - Math.PI / 6) * size),
        endY - (Math.sin(angle - Math.PI / 6) * size)
    );
    ctx.lineTo(
        endX - (Math.cos(angle + Math.PI / 6) * size),
        endY - (Math.sin(angle + Math.PI / 6) * size)
    );
    ctx.closePath();
    ctx.fill();
}

function setupCanvasInteractions() {
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointercancel", handlePointerCancel);
}

function handlePointerDown(event) {
    if (controlState.isPaused) {
        statusText.textContent = "The round is paused. Press Resume to continue.";
        return;
    }

    if (isOnlineGame() && !canLocalPlayerAct()) {
        statusText.textContent = isLocalPlayersTurn()
            ? "Wait until the current online turn is confirmed by the server."
            : `Wait for ${formatPlayerName(gameState.activePlayer)} to play.`;
        return;
    }

    if (gameState.roundResult) {
        statusText.textContent = "The round is already finished. Press Restart Round to play again.";
        return;
    }

    if (isAnyStoneMoving()) {
        statusText.textContent = "Wait until all moving stones stop before starting the next shot.";
        return;
    }

    const boardPoint = getBoardPointFromEvent(event);
    const activeStone = getStoneAtPoint(boardPoint);

    if (!activeStone) {
        return;
    }

    aimState.draggingStoneId = activeStone.id;
    aimState.hoveredStoneId = activeStone.id;
    aimState.pointerBoardX = boardPoint.x;
    aimState.pointerBoardY = boardPoint.y;
    aimState.lastPreview = null;

    try {
        canvas.setPointerCapture(event.pointerId);
    } catch (error) {
        console.warn("Pointer capture could not be set.", error);
    }

    statusText.textContent = `Aiming ${formatStoneName(activeStone)}. Pull away from the target and watch the guide lines.`;

    updateCanvasCursor();
    renderGameSummary();
    renderScene();
}

function handlePointerMove(event) {
    if (controlState.isPaused) {
        if (aimState.hoveredStoneId) {
            aimState.hoveredStoneId = null;
            updateCanvasCursor();
            renderScene();
        }

        return;
    }

    if (isOnlineGame() && !canLocalPlayerAct()) {
        if (aimState.hoveredStoneId) {
            aimState.hoveredStoneId = null;
            updateCanvasCursor();
            renderScene();
        }

        return;
    }

    const boardPoint = getBoardPointFromEvent(event);
    const previousHoverId = aimState.hoveredStoneId;

    aimState.pointerBoardX = boardPoint.x;
    aimState.pointerBoardY = boardPoint.y;

    if (aimState.draggingStoneId) {
        renderGameSummary();
        renderScene();
        return;
    }

    const hoveredStone = getStoneAtPoint(boardPoint);
    aimState.hoveredStoneId = hoveredStone ? hoveredStone.id : null;

    updateCanvasCursor();

    if (previousHoverId !== aimState.hoveredStoneId) {
        renderScene();
    }
}

function handlePointerUp(event) {
    if (!aimState.draggingStoneId) {
        return;
    }

    const boardPoint = getBoardPointFromEvent(event);
    const draggingStone = getDraggingStone();
    const preview = draggingStone ? buildAimPreview(draggingStone, boardPoint) : null;

    aimState.pointerBoardX = boardPoint.x;
    aimState.pointerBoardY = boardPoint.y;
    aimState.draggingStoneId = null;

    if (preview && preview.powerRatio > 0.02 && draggingStone) {
        aimState.lastPreview = {
            stoneId: draggingStone.id,
            stoneNumber: draggingStone.number,
            playerKey: draggingStone.owner,
            ...preview
        };

        if (isOnlineGame()) {
            sendOnlineShot(draggingStone, preview);
        } else {
            launchStone(draggingStone, preview);
        }
    } else {
        aimState.lastPreview = null;
        statusText.textContent = "Aim cancelled. Drag the highlighted stone again.";
    }

    const hoveredStone = getStoneAtPoint(boardPoint);
    aimState.hoveredStoneId = hoveredStone ? hoveredStone.id : null;

    try {
        canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
        console.warn("Pointer capture could not be released.", error);
    }

    updateCanvasCursor();
    renderGameSummary();
    renderScene();
}

function handlePointerLeave() {
    if (aimState.draggingStoneId) {
        return;
    }

    aimState.hoveredStoneId = null;
    updateCanvasCursor();
    renderScene();
}

function handlePointerCancel() {
    aimState.draggingStoneId = null;
    aimState.hoveredStoneId = null;
    statusText.textContent = "Aiming was interrupted. Drag the highlighted stone again.";
    updateCanvasCursor();
    renderGameSummary();
    renderScene();
}

function pauseGame() {
    if (controlState.isPaused || gameState.roundResult) {
        return;
    }

    if (isOnlineGame()) {
        if (!isLocalPlayersTurn()) {
            statusText.textContent = "Only the current player can pause the online match.";
            return;
        }

        if (!sendSocketMessage({
            type: "pause_game",
            roomCode: networkState.roomCode
        })) {
            statusText.textContent = "Could not send the pause request to the WebSocket server.";
            return;
        }

        statusText.textContent = "Pause request sent to the server.";
        return;
    }

    if (uiState.gameMode !== "local") {
        statusText.textContent = "Pause is available only during a match.";
        return;
    }

    controlState.isPaused = true;
    aimState.draggingStoneId = null;
    aimState.hoveredStoneId = null;
    aimState.lastPreview = null;

    statusText.textContent = isAnyStoneMoving()
        ? "Game paused. The moving stones are frozen until you press Resume."
        : "Game paused. Throwing is disabled until you press Resume.";

    updateControlButtons();
    updateCanvasCursor();
    renderGameSummary();
    renderScene();
}

function resumeGame() {
    if (!controlState.isPaused) {
        return;
    }

    if (isOnlineGame()) {
        if (!sendSocketMessage({
            type: "resume_game",
            roomCode: networkState.roomCode
        })) {
            statusText.textContent = "Could not send the resume request to the WebSocket server.";
            return;
        }

        statusText.textContent = "Resume request sent to the server.";
        return;
    }

    if (uiState.gameMode !== "local") {
        statusText.textContent = "Resume is available only during a match.";
        return;
    }

    controlState.isPaused = false;

    if (gameState.roundResult) {
        statusText.textContent = "The round has already finished. Press Restart Round to start again.";
    } else if (isAnyStoneMoving()) {
        statusText.textContent = "Game resumed. Frozen movement continues.";

        if (!simulationState.animationFrameId) {
            startSimulationLoop();
        }
    } else {
        const activeStone = getActiveStone();
        statusText.textContent = activeStone
            ? `Game resumed. ${formatStoneName(activeStone)} is ready.`
            : "Game resumed.";
    }

    updateControlButtons();
    updateCanvasCursor();
    renderGameSummary();
    renderScene();
}

function restartRound() {
    if (isOnlineGame()) {
        if (networkState.restartRequestedByPlayerKey === networkState.localPlayerKey) {
            statusText.textContent = "Your restart request is already waiting for the other player.";
            return;
        }

        if (!sendSocketMessage({
            type: "restart_request",
            roomCode: networkState.roomCode
        })) {
            statusText.textContent = "Could not send the restart request to the WebSocket server.";
            return;
        }

        statusText.textContent = networkState.restartRequestedByPlayerKey
            ? "Restart confirmation sent to the server."
            : "Restart request sent to the server.";
        return;
    }

    if (uiState.gameMode !== "local") {
        statusText.textContent = "Restart is available only during a match.";
        return;
    }

    stopSimulationLoop();
    controlState.isPaused = false;
    resetAimState();
    setupInitialGameState();

    statusText.textContent = "Round restarted. Player 1 begins again with a fresh local board.";

    updateControlButtons();
    updateCanvasCursor();
    renderGameSummary();
    renderScene();
}

function resetAimState() {
    aimState.hoveredStoneId = null;
    aimState.draggingStoneId = null;
    aimState.pointerBoardX = 0;
    aimState.pointerBoardY = 0;
    aimState.lastPreview = null;
}

function updateControlButtons() {
    const isGameScreen = uiState.currentScreen === "game";
    const isLocalGame = isGameScreen && uiState.gameMode === "local";
    const isOnlineGameScreen = isGameScreen && isOnlineGame();
    const localPauseEnabled = isLocalGame && !controlState.isPaused && !Boolean(gameState.roundResult);
    const localResumeEnabled = isLocalGame && controlState.isPaused;
    const onlinePauseEnabled = isOnlineGameScreen
        && !controlState.isPaused
        && !Boolean(gameState.roundResult)
        && isLocalPlayersTurn();
    const onlineResumeEnabled = isOnlineGameScreen && controlState.isPaused;
    const onlineRestartEnabled = isOnlineGameScreen
        && networkState.restartRequestedByPlayerKey !== networkState.localPlayerKey;

    pauseButton.disabled = !(localPauseEnabled || onlinePauseEnabled);
    resumeButton.disabled = !(localResumeEnabled || onlineResumeEnabled);
    restartButton.disabled = !(isLocalGame || onlineRestartEnabled);
    restartButton.textContent = getRestartButtonLabel();
    disconnectGameButton.hidden = !isOnlineGameScreen;
    disconnectGameButton.disabled = !isOnlineGameScreen;
}

function getRestartButtonLabel() {
    if (isOnlineGame()) {
        if (networkState.restartRequestedByPlayerKey === networkState.localPlayerKey) {
            return "Restart Requested";
        }

        if (networkState.restartRequestedByPlayerKey) {
            return "Accept Restart";
        }
    }

    return "Restart Round";
}

function getBoardPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasSize.width / gameConfig.board.baseWidth;
    const scaleY = canvasSize.height / gameConfig.board.baseHeight;

    return {
        x: (event.clientX - rect.left) / scaleX,
        y: (event.clientY - rect.top) / scaleY
    };
}

function getStoneAtPoint(boardPoint) {
    const activeStone = getActiveStone();

    if (!activeStone) {
        return null;
    }

    return isPointInsideStone(boardPoint, activeStone) ? activeStone : null;
}

function isPointInsideStone(boardPoint, stone) {
    const distance = Math.hypot(boardPoint.x - stone.x, boardPoint.y - stone.y);
    return distance <= stone.radius;
}

function buildAimPreview(stone, boardPoint) {
    const rawDx = boardPoint.x - stone.x;
    const rawDy = boardPoint.y - stone.y;
    const rawDistance = Math.hypot(rawDx, rawDy);
    const maxDistance = gameConfig.physics.maxDragDistance;

    if (rawDistance === 0) {
        return {
            pullDx: 0,
            pullDy: 0,
            pullEndX: stone.x,
            pullEndY: stone.y,
            shotDx: 0,
            shotDy: 0,
            powerRatio: 0
        };
    }

    const clampRatio = Math.min(1, maxDistance / rawDistance);
    const pullDx = rawDx * clampRatio;
    const pullDy = rawDy * clampRatio;
    const pullDistance = Math.hypot(pullDx, pullDy);

    return {
        pullDx,
        pullDy,
        pullEndX: stone.x + pullDx,
        pullEndY: stone.y + pullDy,
        shotDx: -pullDx,
        shotDy: -pullDy,
        powerRatio: pullDistance / maxDistance
    };
}

function getLiveAimPreview() {
    const draggingStone = getDraggingStone();

    if (!draggingStone) {
        return null;
    }

    return buildAimPreview(draggingStone, {
        x: aimState.pointerBoardX,
        y: aimState.pointerBoardY
    });
}

function getActiveStone() {
    if (isAnyStoneMoving()) {
        return null;
    }

    return getNextStoneForPlayer(gameState.activePlayer);
}

function getDraggingStone() {
    if (!aimState.draggingStoneId) {
        return null;
    }

    return gameState.stones.find((stone) => {
        return stone.id === aimState.draggingStoneId;
    }) || null;
}

function updateCanvasCursor() {
    const hasAimableStone = Boolean(aimState.hoveredStoneId)
        && !isAnyStoneMoving()
        && !controlState.isPaused
        && (!isOnlineGame() || canLocalPlayerAct());
    const isDragging = Boolean(aimState.draggingStoneId);

    canvas.classList.toggle("canvas--aimable", hasAimableStone && !isDragging);
    canvas.classList.toggle("canvas--dragging", isDragging);
}

function launchStone(stone, preview) {
    applyShotImpulse(stone, preview.shotDx, preview.shotDy);
    aimState.hoveredStoneId = null;

    statusText.textContent = `${formatStoneName(stone)} is moving.`;

    updateCanvasCursor();
    renderGameSummary();
    renderScene();
    startSimulationLoop();
}

function sendOnlineShot(stone, preview) {
    const messageSent = sendSocketMessage({
        type: "launch_shot",
        roomCode: networkState.roomCode,
        stoneId: stone.id,
        playerKey: stone.owner,
        shotDx: preview.shotDx,
        shotDy: preview.shotDy,
        powerRatio: preview.powerRatio
    });

    if (!messageSent) {
        statusText.textContent = "Could not send the shot to the WebSocket server.";
        return;
    }

    aimState.hoveredStoneId = null;
    updateCanvasCursor();
    renderScene();
    statusText.textContent = "Shot sent to the server. Waiting for both clients to start the turn.";
}

function startSimulationLoop() {
    if (simulationState.animationFrameId) {
        return;
    }

    simulationState.lastTimestamp = 0;
    simulationState.accumulatorMs = 0;
    simulationState.animationFrameId = requestAnimationFrame(stepSimulation);
}

function stopSimulationLoop() {
    if (simulationState.animationFrameId) {
        cancelAnimationFrame(simulationState.animationFrameId);
        simulationState.animationFrameId = null;
    }

    simulationState.lastTimestamp = 0;
    simulationState.accumulatorMs = 0;
}

function stepSimulation(timestamp) {
    if (simulationState.lastTimestamp === 0) {
        simulationState.lastTimestamp = timestamp;
    }

    if (controlState.isPaused) {
        simulationState.lastTimestamp = timestamp;
        simulationState.animationFrameId = requestAnimationFrame(stepSimulation);
        return;
    }

    const deltaMs = Math.min(
        MAX_FRAME_DELTA_MS,
        timestamp - simulationState.lastTimestamp || SIMULATION_FRAME_MS
    );
    simulationState.lastTimestamp = timestamp;
    simulationState.accumulatorMs += deltaMs;

    let steps = 0;

    while (simulationState.accumulatorMs >= SIMULATION_FRAME_MS && steps < MAX_SIMULATION_STEPS) {
        updateMovingStones();
        simulationState.accumulatorMs -= SIMULATION_FRAME_MS;
        steps += 1;
    }

    if (steps === MAX_SIMULATION_STEPS) {
        simulationState.accumulatorMs = 0;
    }

    renderGameSummary();
    renderScene();

    if (isAnyStoneMoving()) {
        simulationState.animationFrameId = requestAnimationFrame(stepSimulation);
        return;
    }

    stopSimulationLoop();
    handleBoardSettled();
}

function updateMovingStones() {
    gameState.stones.forEach((stone) => {
        if (!stone.isMoving) {
            return;
        }

        stone.x += stone.vx;
        stone.y += stone.vy;
    });

    resolveStoneCollisions();

    gameState.stones.forEach((stone) => {
        keepStoneInsideBoard(stone);

        if (getStoneSpeed(stone) === 0) {
            stone.isMoving = false;
            return;
        }

        stone.vx *= gameConfig.physics.frictionPerFrame;
        stone.vy *= gameConfig.physics.frictionPerFrame;

        syncStoneMotionState(stone);
    });
}

function keepStoneInsideBoard(stone) {
    const minX = stone.radius;
    const maxX = gameConfig.board.baseWidth - stone.radius;
    const minY = stone.radius;
    const maxY = gameConfig.board.baseHeight - stone.radius;
    const bounce = gameConfig.physics.wallBounceDamping;

    if (stone.x < minX) {
        stone.x = minX;
        stone.vx = Math.abs(stone.vx) * bounce;
    } else if (stone.x > maxX) {
        stone.x = maxX;
        stone.vx = -Math.abs(stone.vx) * bounce;
    }

    if (stone.y < minY) {
        stone.y = minY;
        stone.vy = Math.abs(stone.vy) * bounce;
    } else if (stone.y > maxY) {
        stone.y = maxY;
        stone.vy = -Math.abs(stone.vy) * bounce;
    }
}

function resolveStoneCollisions() {
    for (let pass = 0; pass < 2; pass += 1) {
        for (let firstIndex = 0; firstIndex < gameState.stones.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < gameState.stones.length; secondIndex += 1) {
                resolveStonePairCollision(
                    gameState.stones[firstIndex],
                    gameState.stones[secondIndex]
                );
            }
        }
    }
}

function resolveStonePairCollision(firstStone, secondStone) {
    let dx = secondStone.x - firstStone.x;
    let dy = secondStone.y - firstStone.y;
    let distance = Math.hypot(dx, dy);
    const minimumDistance = firstStone.radius + secondStone.radius;

    if (distance >= minimumDistance) {
        return;
    }

    if (distance === 0) {
        dx = 1;
        dy = 0;
        distance = 1;
    }

    const normalX = dx / distance;
    const normalY = dy / distance;
    const overlap = minimumDistance - distance;
    const separationX = normalX * (overlap / 2);
    const separationY = normalY * (overlap / 2);

    firstStone.x -= separationX;
    firstStone.y -= separationY;
    secondStone.x += separationX;
    secondStone.y += separationY;

    const relativeVelocityX = secondStone.vx - firstStone.vx;
    const relativeVelocityY = secondStone.vy - firstStone.vy;
    const speedAlongNormal = (relativeVelocityX * normalX) + (relativeVelocityY * normalY);

    if (speedAlongNormal >= 0) {
        return;
    }

    const impulse = -((1 + gameConfig.physics.stoneCollisionDamping) * speedAlongNormal) / 2;

    firstStone.vx -= impulse * normalX;
    firstStone.vy -= impulse * normalY;
    secondStone.vx += impulse * normalX;
    secondStone.vy += impulse * normalY;

    syncStoneMotionState(firstStone);
    syncStoneMotionState(secondStone);
}

function stopStone(stone) {
    stone.vx = 0;
    stone.vy = 0;
    stone.isMoving = false;
}

function syncStoneMotionState(stone) {
    if (getStoneSpeed(stone) <= gameConfig.physics.stopSpeedThreshold) {
        stopStone(stone);
        return;
    }

    stone.isMoving = true;
}

function handleBoardSettled() {
    if (isOnlineGame()) {
        aimState.lastPreview = null;
        aimState.hoveredStoneId = null;
        updateCanvasCursor();
        renderScene();

        if (gameState.stones.every((stone) => !stone.isMoving)) {
            sendSocketMessage({
                type: "board_settled",
                roomCode: networkState.roomCode,
                turnNumber: networkState.currentTurnNumber
            });
        }

        statusText.textContent = "Board settled locally. Waiting for the server to confirm the next turn.";
        return;
    }

    const nextPlayer = getNextPlayerWithAvailableStone(gameState.activePlayer);

    aimState.lastPreview = null;
    aimState.hoveredStoneId = null;

    if (nextPlayer) {
        const previousPlayer = gameState.activePlayer;
        gameState.activePlayer = nextPlayer;

        const nextStone = getActiveStone();
        statusText.textContent = nextPlayer === previousPlayer
            ? `${formatPlayerName(nextPlayer)} continues because the other player has no stones left. ${formatStoneName(nextStone)} is now ready.`
            : `Turn changed to ${formatPlayerName(nextPlayer)}. ${formatStoneName(nextStone)} is now ready.`;
    } else {
        gameState.roundResult = calculateRoundResult();

        statusText.textContent = !gameState.roundResult
            ? "Round finished, but there were no launched stones to evaluate."
            : gameState.roundResult.isTie
                ? `Round finished with a tie. ${formatStoneName(gameState.roundResult.bestStone)} shares the closest distance of ${formatDistance(gameState.roundResult.bestDistance)} px to the target center.`
                : `Round finished. ${formatPlayerName(gameState.roundResult.winnerPlayerKey)} wins because ${formatStoneName(gameState.roundResult.bestStone)} is closest to the target at ${formatDistance(gameState.roundResult.bestDistance)} px.`;
    }

    updateControlButtons();
    updateCanvasCursor();
    renderGameSummary();
    renderScene();
}

function isAnyStoneMoving() {
    return gameState.stones.some((stone) => stone.isMoving);
}

function getFirstMovingStone() {
    return gameState.stones.find((stone) => stone.isMoving) || null;
}

function getStoneSpeed(stone) {
    return Math.hypot(stone.vx, stone.vy);
}

function calculateRoundResult() {
    const launchedStones = gameState.stones.filter((stone) => stone.launched);

    if (launchedStones.length === 0) {
        return null;
    }

    const rankedStones = launchedStones.map((stone) => {
        return {
            stone,
            distance: getDistanceToTarget(stone)
        };
    }).sort((firstItem, secondItem) => {
        return firstItem.distance - secondItem.distance;
    });

    const bestEntry = rankedStones[0];
    const secondEntry = rankedStones[1] || null;
    const isTie = Boolean(secondEntry) && Math.abs(bestEntry.distance - secondEntry.distance) < 0.01;

    return {
        bestStone: bestEntry.stone,
        bestDistance: bestEntry.distance,
        winnerPlayerKey: bestEntry.stone.owner,
        isTie
    };
}

function getDistanceToTarget(stone) {
    return Math.hypot(
        stone.x - gameConfig.target.x,
        stone.y - gameConfig.target.y
    );
}

function getPlayedStoneCount(playerKey) {
    return gameState.stones.filter((stone) => {
        return stone.owner === playerKey && stone.launched;
    }).length;
}

function getRemainingStones(playerKey) {
    return gameState.stones.filter((stone) => {
        return stone.owner === playerKey && !stone.launched;
    }).length;
}

function getNextStoneForPlayer(playerKey) {
    return gameState.stones.find((stone) => {
        return stone.owner === playerKey && !stone.launched;
    }) || null;
}

function getPlayerOrder() {
    return Object.keys(gameConfig.startPositions);
}

function getNextPlayerWithAvailableStone(currentPlayer) {
    const playerOrder = getPlayerOrder();
    const currentIndex = playerOrder.indexOf(currentPlayer);

    if (currentIndex === -1) {
        return null;
    }

    for (let offset = 1; offset <= playerOrder.length; offset += 1) {
        const candidate = playerOrder[(currentIndex + offset) % playerOrder.length];

        if (getRemainingStones(candidate) > 0) {
            return candidate;
        }
    }

    return null;
}

function getActiveStoneId() {
    const activeStone = getActiveStone();
    return activeStone ? activeStone.id : null;
}

function formatStoneName(stone) {
    return `Stone ${stone.number} of ${formatPlayerName(stone.owner)}`;
}

function formatPlayerName(playerKey) {
    const playerEntry = getPlayerEntryByKey(playerKey);

    if (playerEntry) {
        return playerEntry.playerName;
    }

    return playerKey === "player1" ? "Player 1" : "Player 2";
}

function formatPowerPercent(powerRatio) {
    return `${Math.round(powerRatio * 100)}%`;
}

function formatSpeed(speed) {
    return speed.toFixed(2);
}

function formatDistance(distance) {
    return distance.toFixed(2);
}

function formatDirectionLabel(dx, dy) {
    const threshold = 12;
    const horizontal = dx > threshold ? "right" : dx < -threshold ? "left" : "";
    const vertical = dy > threshold ? "down" : dy < -threshold ? "up" : "";

    if (horizontal && vertical) {
        return `${horizontal} and ${vertical}`;
    }

    if (horizontal || vertical) {
        return horizontal || vertical;
    }

    return "straight";
}

init();
