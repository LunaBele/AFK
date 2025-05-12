// Suppress punycode deprecation warning
process.emitWarning = (warning, type, code, ctor) => {
  if (code === 'DEP0040') return;
  console.warn(`${type} (${code}): ${warning}`);
};

const mineflayer = require('mineflayer');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const express = require('express');
const app = express();

// Configuration
const botConfig = {
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
const maxReconnectAttempts = 5;
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

// Function to reconnect with exponential backoff
function reconnect() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    logMessage('Max reconnect attempts reached. Stopping bot.', 'error');
    return;
  }
  const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
  logMessage(`Reconnecting in ${delay / 1000} seconds... (Attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`, 'warning');
  setTimeout(() => {
    bot.end();
    bot = mineflayer.createBot(botConfig);
    reconnectAttempts++;
  }, delay);
}

// Create the bot
let bot = mineflayer.createBot(botConfig);

// Serve static files and HTML
app.use(express.static('public'));

// API endpoints
app.get('/logs', (req, res) => res.json(consoleLogs));
app.get('/status', (req, res) => res.json({ status: serverStatus, players: playerCount, uptime: startTime ? formatUptime(Date.now() - startTime) : '00:00:00' }));

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/viewer', (req, res) => {
  mineflayerViewer(bot, { port: 3007, firstPerson: true });
  res.send('Viewer started on port 3007');
});

app.listen(process.env.PORT || 3000, () => logMessage('Web server started on port ' + (process.env.PORT || 3000), 'info'));

// Event: When the bot spawns in the server
bot.on('spawn', () => {
  logMessage(`Bot joined the server as ${botConfig.username}`, 'success');
  reconnectAttempts = 0;
  serverStatus = 'Online';
  startTime = Date.now();
  logMessage('Uptime counter started', 'info');

  uptimeInterval = setInterval(() => {
    if (startTime) {
      logMessage(`Uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
    }
  }, 10000);

  // Periodically move to avoid AFK detection
  setInterval(() => {
    bot.look(Math.random() * Math.PI * 2, 0);
    if (Math.random() > 0.7) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 300);
    }
  }, 5000);

  // Send chat message every 2 minutes
  setInterval(() => {
    const message = messages[Math.floor(Math.random() * messages.length)];
    bot.chat(message);
    logMessage(`Sent chat message: ${message}`, 'info');
  }, 2 * 60 * 1000); // 2 minutes

  // Update player count
  bot.on('playerJoined', () => (playerCount = bot.players.length));
  bot.on('playerLeft', () => (playerCount = bot.players.length));
  playerCount = bot.players.length;
});

// Event: Handle errors
bot.on('error', (err) => {
  logMessage(`Bot error: ${err.message}`, 'error');
  if (err.code === 'ECONNRESET') {
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