// Suppress punycode deprecation warning
process.emitWarning = (warning, type, code, ctor) => {
  if (code === 'DEP0040') return;
  console.warn(`${type} (${code}): ${warning}`);
};

const mineflayer = require('mineflayer');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const express = require('express');
const app = express();

// Middleware to parse JSON requests
app.use(express.json());

// Configuration (initial values)
let botConfig = {
  host: 'MoonLightServerS1.aternos.me',
  port: 32033,
  username: 'AFKBot',
  version: '1.16.5' // Match your server version
};

// State storage
let consoleLogs = [];
let startTime = null;
let uptimeInterval = null;
let reconnectAttempts = 0;
let playerCount = 0;
let serverStatus = 'Offline';
const baseReconnectDelay = 10000;

// Messages to send every 2 minutes
const messages = [
  "Hey! I'm AFK.",
  "Hey! The owner recommends putting me in Creative or Spectator mode so you don’t see me.",
  "Made by Mart John Labaco.",
  "Report issues here: mart1john2labaco3@gmail.com",
  "Hey! What if…?"
];

// Function to log messages
function logMessage(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const log = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  consoleLogs.push(log);
  if (consoleLogs.length > 100) consoleLogs.shift();
  console.log(log);
}

// Function to format uptime
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// Function to reconnect with exponential backoff (force join)
function reconnect() {
  const delay = baseReconnectDelay * Math.pow(2, Math.min(reconnectAttempts, 5)); // Cap exponential backoff at 5 attempts to avoid overly long delays
  logMessage(`Force join: Reconnecting in ${delay / 1000} seconds... (Attempt ${reconnectAttempts + 1})`, 'warning');
  setTimeout(() => {
    bot.end();
    bot = mineflayer.createBot(botConfig);
    reconnectAttempts++;
  }, delay);
}

// Function to perform scheduled reconnect every 5 minutes
function scheduledReconnect() {
  logMessage('Scheduled reconnect: Disconnecting bot...', 'info');
  bot.end();
  setTimeout(() => {
    logMessage('Scheduled reconnect: Reconnecting bot...', 'info');
    bot = mineflayer.createBot(botConfig);
  }, 5000);
}

// Enhanced movement function
function performAntiAFKMovement() {
  if (!bot.player) return;

  bot.look(Math.random() * Math.PI * 2, Math.random() * (Math.PI / 4) - Math.PI / 8);
  const distance = Math.floor(Math.random() * 3) + 1;
  const angle = Math.random() * 2 * Math.PI;
  const x = distance * Math.cos(angle);
  const z = distance * Math.sin(angle);
  bot.setControlState('forward', true);
  setTimeout(() => {
    bot.setControlState('forward', false);
    bot.entity.position.x += x;
    bot.entity.position.z += z;
  }, 1000);

  if (Math.random() > 0.5) {
    bot.setControlState('sneak', true);
    setTimeout(() => bot.setControlState('sneak', false), 2000);
  }
  if (Math.random() > 0.7) {
    bot.swingArm();
    logMessage('Performed arm swing to simulate activity', 'info');
  }
  if (Math.random() > 0.6) {
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 300);
  }
}

// Create the bot
let bot = mineflayer.createBot(botConfig);

// Serve static files and HTML
app.use(express.static('public'));

// API endpoints
app.get('/logs', (req, res) => res.json(consoleLogs));
app.get('/status', (req, res) => res.json({ status: serverStatus, players: playerCount, uptime: startTime ? formatUptime(Date.now() - startTime) : '00:00:00' }));
app.get('/config', (req, res) => res.json({ host: botConfig.host, port: botConfig.port, username: botConfig.username }));

app.post('/rejoin', (req, res) => {
  logMessage('Rejoin button clicked. Attempting to reconnect bot...', 'info');
  bot.end();
  setTimeout(() => {
    bot = mineflayer.createBot(botConfig);
    res.json({ message: 'Rejoin attempt initiated' });
  }, 2000);
});

app.post('/update-config', (req, res) => {
  const { host, port, username } = req.body;
  if (!host || !port || !username) {
    logMessage('Failed to update config: Missing fields', 'error');
    return res.status(400).json({ message: 'Missing required fields' });
  }

  botConfig.host = host;
  botConfig.port = parseInt(port);
  botConfig.username = username;
  logMessage(`Updated bot config - Host: ${host}, Port: ${port}, Username: ${username}`, 'info');

  // Reconnect with new config
  bot.end();
  setTimeout(() => {
    bot = mineflayer.createBot(botConfig);
    res.json({ message: 'Configuration updated and bot reconnected' });
  }, 2000);
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/viewer', (req, res) => {
  mineflayerViewer(bot, { port: 3007, firstPerson: true });
  res.send('Viewer started on port 3007');
});

app.listen(process.env.PORT || 3000, () => logMessage('Web server started on port ' + (process.env.PORT || 3000), 'info'));

// Event: When the bot spawns in the server
bot.on('spawn', () => {
  logMessage(`Bot joined the server as ${botConfig.username}`, 'success');
  reconnectAttempts = 0; // Reset attempts on successful join
  serverStatus = 'Online';
  startTime = Date.now();
  logMessage('Uptime counter started', 'info');

  uptimeInterval = setInterval(() => {
    if (startTime) {
      logMessage(`Uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
    }
  }, 10000);

  setInterval(() => {
    performAntiAFKMovement();
  }, Math.random() * 4000 + 3000);

  setInterval(() => {
    const message = messages[Math.floor(Math.random() * messages.length)];
    bot.chat(message);
    logMessage(`Sent chat message: ${message}`, 'info');
  }, 2 * 60 * 1000);

  setInterval(() => {
    scheduledReconnect();
  }, 5 * 60 * 1000);

  bot.on('playerJoined', () => (playerCount = bot.players.length));
  bot.on('playerLeft', () => (playerCount = bot.players.length));
  playerCount = bot.players.length;
});

// Event: Handle errors
bot.on('error', (err) => {
  logMessage(`Bot error: ${err.message}`, 'error');
  if (err.code === 'ECONNRESET' || err.code === 'EHOSTUNREACH' || err.code === 'ENOTFOUND' || !bot.player) {
    logMessage("Bot can't join. This could be due to the server being offline, incorrect server IP/port, version mismatch, or anti-bot protection.", 'error');
    if (startTime) {
      logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
      startTime = null;
      clearInterval(uptimeInterval);
    }
    serverStatus = 'Offline';
    reconnect();
  }
});

// Event: Handle being kicked
bot.on('kicked', (reason) => {
  logMessage(`Bot was kicked: ${reason}`, 'warning');
  if (startTime) {
    logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
    startTime = null;
    clearInterval(uptimeInterval);
  }
  serverStatus = 'Offline';
  reconnect();
});

// Event: Handle server stopping
bot.on('end', () => {
  logMessage('Bot disconnected.', 'warning');
  if (startTime) {
    logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
    startTime = null;
    clearInterval(uptimeInterval);
  }
  serverStatus = 'Offline';
  reconnect();
});