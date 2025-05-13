const mineflayer = require('mineflayer');
const { ping } = require('minecraft-protocol');
const config = require('./config.json');

// Centralized state (passed from index.js)
let botState = null;

// Messages to send every 1 minute 50 seconds (randomly selected, no immediate repeats)
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
  "Hmm, I wonder what's happening in the server...",
  "Big thanks to Mart John Labaco for creating me!",
  "Just hanging out, keeping things running smoothly.",
  "Credit to Mart John Labaco for this awesome bot!",
  "If you see me moving, I'm just avoiding AFK kicks!",
  "Hey, let's all thank Mart John Labaco for this bot!",
  "I'm here to help—built by Mart John Labaco."
];

// Constants
const MOVEMENT_INTERVAL = 50 * 1000; // 50 seconds
const MESSAGE_INTERVAL = 110 * 1000; // 1 minute 50 seconds
const RECONNECT_INTERVAL = 10 * 60 * 1000; // 10 minutes
const LEAVE_INTERVAL = 60 * 60 * 1000; // 1 hour (commented out for testing)
const INITIAL_DELAY = 30000; // 30 seconds delay for timers
const PING_INTERVAL = 30000; // 30 seconds for server ping

/**
 * Logs a message using the logMessage function from index.js.
 * @param {string} message - The message to log.
 * @param {string} [type='info'] - The type of log.
 */
function logMessage(message, type = 'info') {
  if (botState.logMessage) botState.logMessage(message, type);
}

/**
 * Switches the bot's username between username1 and username2.
 */
function switchUsername() {
  config.currentUsername = config.currentUsername === config.username1 ? config.username2 : config.username1;
  logMessage(`Switched username to ${config.currentUsername} for next attempt`, 'info');
}

/**
 * Formats a duration in milliseconds into HH:MM:SS format.
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted duration.
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Performs anti-AFK movements every 50 seconds.
 */
function performAntiAFKMovement() {
  if (!botState.bot || !botState.bot.entity) return;
  try {
    botState.bot.look(Math.random() * Math.PI * 2, Math.random() * (Math.PI / 4) - Math.PI / 8);
    const distance = Math.floor(Math.random() * 3) + 1;
    const angle = Math.random() * 2 * Math.PI;
    const x = distance * Math.cos(angle);
    const z = distance * Math.sin(angle);
    botState.bot.setControlState('forward', true);
    setTimeout(() => {
      botState.bot.setControlState('forward', false);
      if (botState.bot && botState.bot.entity) {
        botState.bot.entity.position.x += x;
        botState.bot.entity.position.z += z;
      }
    }, 1000);

    if (Math.random() > 0.5) {
      botState.bot.setControlState('sneak', true);
      setTimeout(() => botState.bot.setControlState('sneak', false), 2000);
    }
    if (Math.random() > 0.7) {
      botState.bot.swingArm();
      logMessage('Performed arm swing to simulate activity', 'info');
    }
  } catch (err) {
    logMessage(`Error in anti-AFK movement: ${err.message}`, 'error');
  }
}

/**
 * Picks a random message, avoiding immediate repeats.
 * @returns {string} A random message.
 */
function getRandomMessage() {
  if (messages.length === 0) return "No messages available.";
  let message;
  do {
    message = messages[Math.floor(Math.random() * messages.length)];
  } while (message === botState.lastMessage && messages.length > 1);
  botState.lastMessage = message;
  return message;
}

/**
 * Performs a scheduled reconnect every 10 minutes.
 */
function scheduledReconnect() {
  if (!botState.bot || !botState.startTime) return;
  const elapsedTime = Date.now() - botState.startTime;
  if (elapsedTime < RECONNECT_INTERVAL) {
    logMessage(`Not reconnecting yet. Elapsed time: ${formatUptime(elapsedTime)}, waiting for ${formatUptime(RECONNECT_INTERVAL - elapsedTime)}`, 'info');
    return;
  }
  logMessage('Scheduled reconnect: Disconnecting bot after 10 minutes...', 'info');
  botState.bot.chat('Reconnecting Guys! 10s');
  setTimeout(() => {
    botState.cleanupBot();
    setTimeout(() => {
      logMessage('Scheduled reconnect: Reconnecting bot...', 'info');
      createBotInstance();
    }, 5000);
  }, 5000);
}

/**
 * Schedules the bot to leave after 1 hour with a 10-second rejoin delay (commented out for testing).
 */
function scheduleBotLeave() {
  if (!botState.bot || botState.leaveTimer) return;
  // botState.leaveTimer = setTimeout(() => {
  //   logMessage('Bot has been active for 1 hour, leaving now...', 'info');
  //   if (botState.bot) botState.bot.chat('Reconnecting Guys! 10s');
  //   setTimeout(() => {
  //     botState.cleanupBot();
  //     logMessage('Rejoining after 10 seconds...', 'info');
  //     setTimeout(() => {
  //       createBotInstance();
  //     }, 10000);
  //   }, 5000);
  // }, LEAVE_INTERVAL);
}

/**
 * Pings the server to check its online status using minecraft-protocol.
 * @returns {Promise<boolean>} True if online, false if offline.
 */
async function pingServer() {
  try {
    await ping({
      host: config.host,
      port: config.port,
      version: config.version
    });
    return true;
  } catch (err) {
    logMessage(`Server ping failed: ${err.message}`, 'warning');
    return false;
  }
}

/**
 * Starts a periodic server status check.
 */
function startServerStatusCheck() {
  if (botState.serverStatusInterval) clearInterval(botState.serverStatusInterval);
  botState.serverStatusInterval = setInterval(async () => {
    const isOnline = await pingServer();
    if (isOnline && botState.serverStatus !== 'Online') {
      logMessage('Server is online, attempting to connect...', 'info');
      botState.serverStatus = 'Online';
      createBotInstance();
    } else if (!isOnline && botState.serverStatus === 'Online') {
      logMessage('Server is offline, disconnecting bot...', 'warning');
      botState.serverStatus = 'Offline';
      botState.cleanupBot();
    }
  }, PING_INTERVAL);
}

/**
 * Sets up bot event listeners and intervals.
 */
function setupBotEvents() {
  if (!botState.bot) return;

  botState.bot.on('spawn', () => {
    logMessage(`Bot joined the server as ${config.currentUsername}`, 'success');
    botState.serverStatus = 'Online';
    botState.startTime = Date.now();
    logMessage('Uptime counter started', 'info');
    botState.reconnectAttempts = 0;
    botState.isConnecting = false;

    setTimeout(() => {
      if (botState.bot) botState.bot.chat('Ahh! Good to be back!');
    }, 2000);

    if (botState.uptimeInterval) clearInterval(botState.uptimeInterval);
    botState.uptimeInterval = setInterval(() => {
      if (botState.startTime && botState.bot) {
        logMessage(`Uptime: ${formatUptime(Date.now() - botState.startTime)}`, 'info');
      }
    }, 10000);

    if (botState.movementInterval) clearInterval(botState.movementInterval);
    botState.movementInterval = setInterval(() => {
      if (botState.bot) performAntiAFKMovement();
    }, MOVEMENT_INTERVAL);

    if (botState.messageInterval) clearInterval(botState.messageInterval);
    botState.messageInterval = setInterval(() => {
      if (botState.bot) {
        const message = getRandomMessage();
        botState.bot.chat(message);
        logMessage(`Sent chat message: ${message}`, 'info');
      }
    }, MESSAGE_INTERVAL);

    if (botState.scheduledReconnectTimer) clearInterval(botState.scheduledReconnectTimer);
    botState.scheduledReconnectTimer = setInterval(() => {
      if (botState.bot) scheduledReconnect();
    }, RECONNECT_INTERVAL);

    if (!botState.bot.listeners('playerJoined').length) {
      botState.bot.on('playerJoined', () => {
        if (botState.bot.players) botState.playerCount = Object.keys(botState.bot.players).length;
      });
      botState.bot.on('playerLeft', () => {
        if (botState.bot.players) botState.playerCount = Object.keys(botState.bot.players).length;
      });
      botState.playerCount = botState.bot.players ? Object.keys(botState.bot.players).length : 0;
    }

    // if (botState.leaveTimer) clearTimeout(botState.leaveTimer);
    // setTimeout(() => {
    //   scheduleBotLeave();
    // }, INITIAL_DELAY);
  });

  botState.bot.on('error', (err) => {
    logMessage(`Bot error: ${err.message}`, 'error');
    const joinFailureErrors = ['ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'ETIMEDOUT'];
    if (joinFailureErrors.includes(err.code) || !botState.bot?.entity) {
      logMessage("Bot can't join. This could be due to the server being offline, incorrect server IP/port, version mismatch, or anti-bot protection.", 'error');
      if (botState.startTime) {
        logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - botState.startTime)}`, 'info');
        botState.startTime = null;
      }
      botState.serverStatus = 'Offline';
      switchUsername();
      botState.restartBotLogic();
    } else if (err.code) {
      if (botState.startTime) {
        logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - botState.startTime)}`, 'info');
        botState.startTime = null;
      }
      botState.serverStatus = 'Offline';
      switchUsername();
      botState.reconnect();
    }
  });

  botState.bot.on('kicked', (reason) => {
    logMessage(`Bot was kicked: ${reason}`, 'warning');
    if (botState.startTime) {
      logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - botState.startTime)}`, 'info');
      botState.startTime = null;
      clearInterval(botState.uptimeInterval);
    }
    botState.serverStatus = 'Offline';
    switchUsername();
    botState.reconnect();
  });

  botState.bot.on('end', (reason) => {
    logMessage(`Bot disconnected. Reason: ${reason}`, 'warning');
    if (botState.startTime) {
      logMessage(`Uptime counter stopped. Total uptime: ${formatUptime(Date.now() - botState.startTime)}`, 'info');
      botState.startTime = null;
      clearInterval(botState.uptimeInterval);
    }
    botState.serverStatus = 'Offline';
    switchUsername();
    botState.reconnect();
  });
}

/**
 * Creates a new bot instance with retry logic.
 */
async function createBotInstance() {
  if (botState.isConnecting) {
    logMessage('Already connecting, skipping new instance creation...', 'warning');
    return;
  }

  const isOnline = await pingServer();
  if (!isOnline) {
    logMessage('Server is offline, cannot connect.', 'warning');
    botState.serverStatus = 'Offline';
    botState.isConnecting = false;
    return;
  }

  botState.isConnecting = true;
  botState.cleanupBot();
  try {
    botState.bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.currentUsername,
      version: config.version
    });
    setupBotEvents();
  } catch (err) {
    logMessage(`Failed to create bot instance: ${err.message}`, 'error');
    botState.isConnecting = false;
    setTimeout(() => {
      switchUsername();
      createBotInstance();
    }, 5000);
  }
}

/**
 * Initializes the bot with the provided state.
 * @param {Object} state - The bot state object from index.js.
 */
function initializeBot(state) {
  botState = state;
  startServerStatusCheck();
  createBotInstance();
}

module.exports = {
  initializeBot,
  createBotInstance,
  setupBotEvents,
  switchUsername,
  scheduledReconnect,
  scheduleBotLeave,
  formatUptime
};