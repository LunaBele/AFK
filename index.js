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
  username1: 'AFKBot',
  username2: 'AFKBot2',
  currentUsername: 'AFKBot',
  version: '1.20.5'
};

// State storage
let consoleLogs = [];
let startTime = null;
let uptimeInterval = null;
let reconnectAttempts = 0;
let playerCount = 0;
let serverStatus = 'Offline';
const baseReconnectDelay = 10000;
let bot = null;
let lastMessage = null;

// Messages to send every 2 minutes (randomly selected, no immediate repeats)
const messages = [
  "Hey! I'm just chilling here, AFK.",
  "Anyone around? I'm in AFK mode!",
  "Hey! The owner recommends putting me in Creative or Spectator mode.",
  "Made by Mart John Labaco. Say hi!",
  "Report issues here: mart1john2labaco3@gmail.com",
  "What if… we all went AFK together?",
  "Just keeping the server alive for you guys!",
  "AFKBot here, doing my thing.",
  "Feel free to ignore me, I'm just AFK!",
  "Hmm, I wonder what's happening in the server..."
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

// Function to switch username
function switchUsername() {
  botConfig.currentUsername = botConfig.currentUsername === botConfig.username1 ? botConfig.username2 : botConfig.username1;
  logMessage(`Switched username to ${botConfig.currentUsername} for next attempt`, 'info');
}

// Function to clean up bot instance
function cleanupBot() {
  if (bot) {
    bot.removeAllListeners();
    clearInterval(uptimeInterval);
    bot.end();
    bot = null;
  }
}

// Function to restart the project (exit to trigger Render's auto-restart)
function restartProject() {
  logMessage('Initiating project restart due to join failure...', 'warning');
  cleanupBot();
  process.exit(1); // Exit with code 1 to trigger Render restart
}

// Function to reconnect with exponential backoff (force login)
function reconnect() {
  if (reconnectAttempts === 0) {
    cleanupBot();
  }
  const delay = baseReconnectDelay * Math.pow(2, Math.min(reconnectAttempts, 5));
  logMessage(`Force login: Reconnecting in ${delay / 1000} seconds... (Attempt ${reconnectAttempts + 1})`, 'warning');
  setTimeout(() => {
    createBotInstance();
    reconnectAttempts++;
  }, delay);
}

// Function to create a new bot instance
function createBotInstance() {
  cleanupBot();
  bot = mineflayer.createBot({
    host: botConfig.host,
    port: botConfig.port,
    username: botConfig.currentUsername,
    version: botConfig.version
  });
  setupBotEvents();
}

// Function to perform scheduled reconnect every 5 minutes
function scheduledReconnect() {
  logMessage('Scheduled reconnect: Disconnecting bot...', 'info');
  if (bot) bot.chat('Reconnecting Guys! 10s');
  setTimeout(() => {
    cleanupBot();
    setTimeout(() => {
      logMessage('Scheduled reconnect: Reconnecting bot...', 'info');
      createBotInstance();
    }, 5000);
  }, 5000);
}

// Enhanced movement function
function performAntiAFKMovement() {
  if (!bot || !bot.entity) return;

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

// Function to pick a random message, avoiding immediate repeats
function getRandomMessage() {
  let message;
  do {
    message = messages[Math.floor(Math.random() * messages.length)];
  } while (message === lastMessage && messages.length > 1);
  lastMessage = message;
  return message;
}

// Function to set up bot event listeners
function setupBotEvents() {
  bot.on('spawn', () => {
    logMessage(`Bot joined the server as ${botConfig.currentUsername}`, 'success');
    bot.chat('Ahh! Good to be back!');
    reconnectAttempts = 0;
    serverStatus = 'Online';
    startTime = Date.now();
    logMessage('Uptime counter started', 'info');

    if (uptimeInterval) clearInterval(uptimeInterval);
    uptimeInterval = setInterval(() => {
      if (startTime) {
        logMessage(`Uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
      }
    }, 10000);

    if (!bot.listeners('playerJoined').length) {
      bot.on('playerJoined', () => (playerCount = bot.players ? Object.keys(bot.players).length : 0));
      bot.on('playerLeft', () => (playerCount = bot.players ? Object.keys(bot.players).length : 0));
      playerCount = bot.players ? Object.keys(bot.players).length : 0;
    }

    setInterval(() => {
      performAntiAFKMovement();
    }, Math.random() * 4000 + 3000);

    setInterval(() => {
      const message = getRandomMessage();
      bot.chat(message);
      logMessage(`Sent chat message: ${message}`, 'info');
    }, 2 * 60 * 1000);

    setInterval(() => {
      scheduledReconnect();
    }, 5 * 60 * 1000);
  });

  bot.on('error', (err) => {
    logMessage(`Bot error: ${err.message}`, 'error');
    const joinFailureErrors = ['ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'ETIMEDOUT'];
    if (joinFailureErrors.includes(err.code) || !bot?.entity) {
      logMessage("Bot can't join. This could be due to the server being offline, incorrect server IP/port, version mismatch, or anti-bot protection.", 'error');
      if (startTime) {
        logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
        startTime = null;
      }
      serverStatus = 'Offline';
      switchUsername();
      restartProject(); // Restart project on join failure
    } else if (err.code) {
      if (startTime) {
        logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
        startTime = null;
      }
      serverStatus = 'Offline';
      switchUsername();
      reconnect();
    }
  });

  bot.on('kicked', (reason) => {
    logMessage(`Bot was kicked: ${reason}`, 'warning');
    if (startTime) {
      logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
      startTime = null;
      clearInterval(uptimeInterval);
    }
    serverStatus = 'Offline';
    switchUsername();
    reconnect();
  });

  bot.on('end', () => {
    logMessage('Bot disconnected.', 'warning');
    if (startTime) {
      logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - startTime)}`, 'info');
      startTime = null;
      clearInterval(uptimeInterval);
    }
    serverStatus = 'Offline';
    switchUsername();
    reconnect();
  });
}

// Serve static files and HTML
app.use(express.static('public'));

// API endpoints
app.get('/logs', (req, res) => res.json(consoleLogs));
app.get('/status', (req, res) => res.json({ status: serverStatus, players: playerCount, uptime: startTime ? formatUptime(Date.now() - startTime) : '00:00:00' }));
app.get('/config', (req, res) => res.json({ host: botConfig.host, port: botConfig.port, username1: botConfig.username1, username2: botConfig.username2, currentUsername: botConfig.currentUsername }));

app.post('/rejoin', (req, res) => {
  logMessage('Rejoin button clicked. Attempting to reconnect bot...', 'info');
  cleanupBot();
  setTimeout(() => {
    createBotInstance();
    res.json({ message: 'Rejoin attempt initiated' });
  }, 2000);
});

app.post('/update-config', (req, res) => {
  const { host, port, username1, username2 } = req.body;
  if (!host || !port || !username1 || !username2) {
    logMessage('Failed to update config: Missing fields', 'error');
    return res.status(400).json({ message: 'Missing required fields' });
  }

  botConfig.host = host;
  botConfig.port = parseInt(port);
  botConfig.username1 = username1;
  botConfig.username2 = username2;
  logMessage(`Updated bot config - Host: ${host}, Port: ${port}, Username1: ${username1}, Username2: ${username2}`, 'info');

  cleanupBot();
  setTimeout(() => {
    createBotInstance();
    res.json({ message: 'Configuration updated and bot reconnected' });
  }, 2000);
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/viewer', (req, res) => {
  if (bot) mineflayerViewer(bot, { port: 3007, firstPerson: true });
  res.send('Viewer started on port 3007');
});

app.listen(process.env.PORT || 3000, () => logMessage('Web server started on port ' + (process.env.PORT || 3000), 'info'));

// Initialize bot on startup
createBotInstance();