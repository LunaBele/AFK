// Suppress punycode deprecation warning
process.emitWarning = (warning, type, code, ctor) => {
  if (code === 'DEP0040') return;
  console.warn(`${type} (${code}): ${warning}`);
};

const express = require('express');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const botModule = require('./bot.js');
const config = require('./config.json');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

// Convert exec to a promise-based function for easier async/await usage
const execPromise = util.promisify(exec);

const app = express();

// Middleware to parse JSON requests
app.use(express.json());

// Centralized state management
const botState = {
  consoleLogs: [],
  startTime: null,
  uptimeInterval: null,
  reconnectAttempts: 0,
  playerCount: 0,
  serverStatus: 'Offline',
  isConnecting: false,
  bot: null,
  lastMessage: null,
  leaveTimer: null,
  scheduledReconnectTimer: null,
  movementInterval: null,
  messageInterval: null,
  serverStatusInterval: null,
  logMessage,
  cleanupBot,
  restartBotLogic,
  reconnect
};

// Constants
const MAX_LOG_ENTRIES = 100;
const BASE_RECONNECT_DELAY = 10000;

// Remove browser.js if it exists
const browserJsPath = path.join(__dirname, 'browser.js');
try {
  if (fs.existsSync(browserJsPath)) {
    fs.unlinkSync(browserJsPath);
    console.log('[2025-05-14T06:16:00.000Z] [INFO] Successfully removed browser.js from project.');
  } else {
    console.log('[2025-05-14T06:16:00.000Z] [INFO] browser.js does not exist in project directory. No action taken.');
  }
} catch (err) {
  console.error('[2025-05-14T06:16:00.000Z] [ERROR] Failed to remove browser.js:', err.message);
}

// Function to detect unused packages (Disabled due to disk quota issue)
async function detectAndUninstallUnusedPackages() {
  try {
    // Read package.json to get dependencies
    const packageJsonPath = path.join(__dirname, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = Object.keys(packageJson.dependencies || {});
    const devDependencies = Object.keys(packageJson.devDependencies || {});

    // List of all dependencies (we'll focus on regular dependencies for uninstall)
    const allDependencies = [...dependencies]; // Exclude devDependencies for uninstall

    // Read the source files to check for imports
    const filesToCheck = ['index.js', 'bot.js'].map(file => path.join(__dirname, file));
    const importedModules = new Set();

    for (const file of filesToCheck) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        // Look for require statements (e.g., require('package-name'))
        const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
        for (const match of requireMatches) {
          const moduleName = match.replace(/require\(['"]([^'"]+)['"]\)/, '$1').split('/')[0];
          importedModules.add(moduleName);
        }
      }
    }

    // Find unused dependencies
    const unusedPackages = allDependencies.filter(dep => !importedModules.has(dep));

    if (unusedPackages.length === 0) {
      console.log('[2025-05-14T06:16:00.000Z] [INFO] No unused packages found.');
      return;
    }

    console.log('[2025-05-14T06:16:00.000Z] [INFO] Found unused packages:', unusedPackages);

    // Uninstall unused packages
    for (const pkg of unusedPackages) {
      try {
        console.log(`[2025-05-14T06:16:00.000Z] [INFO] Uninstalling unused package: ${pkg}`);
        await execPromise(`npm uninstall ${pkg}`);
        console.log(`[2025-05-14T06:16:00.000Z] [SUCCESS] Successfully uninstalled ${pkg}`);
      } catch (err) {
        console.error(`[2025-05-14T06:16:00.000Z] [ERROR] Failed to uninstall ${pkg}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('[2025-05-14T06:16:00.000Z] [ERROR] Error detecting unused packages:', err.message);
  }
}

// Log that the feature is disabled due to disk quota issue
console.log('[2025-05-14T06:16:00.000Z] [WARNING] Disk quota exceeded. Disabling detectAndUninstallUnusedPackages feature to prevent further issues.');
// Temporarily disable the feature
// detectAndUninstallUnusedPackages().then(() => {
// Proceed with the rest of the application
import('chalk').then((chalk) => {
  const { yellow, green, cyan, magenta, bgGreen, bgRed } = chalk.default;

  // Beautiful Console Header with ASCII Art and Colors
  console.log('');
  console.log(yellow('╔════════════════════════════════════╗'));
  console.log(yellow('║                                    ║'));
  console.log(yellow('║       ' + bgGreen.black.bold('  AFK BOTv2  ') + '       ║'));
  console.log(yellow('║                                    ║'));
  console.log(yellow('╠════════════════════════════════════╣'));
  console.log(yellow('║   ' + cyan.bold('Created with ♥ by JmLabaco') + '   ║'));
  console.log(yellow('║                                    ║'));
  console.log(yellow('╚════════════════════════════════════╝'));
  console.log(magenta('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'));
  console.log('');

  // Add a startup message
  console.log(green.bold('Bot is starting...') + ' ' + cyan('Check logs below for updates!'));
  console.log('');
}).catch((err) => {
  console.error('Failed to load chalk:', err.message);
  // Fallback to plain text with basic design
  console.log('');
  console.log('╔════════════════════════════════════╗');
  console.log('║       AFK BOTv2                    ║');
  console.log('╠════════════════════════════════════╣');
  console.log('║   Created with ♥ by JmLabaco       ║');
  console.log('╚════════════════════════════════════╝');
  console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
  console.log('');
  console.log('Bot is starting... Check logs below for updates!');
  console.log('');
});

/**
 * Logs a message with timestamp and type, maintaining a limited log history.
 * @param {string} message - The message to log.
 * @param {string} [type='info'] - The type of log (info, warning, error, success).
 */
function logMessage(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  botState.consoleLogs.push(logEntry);
  if (botState.consoleLogs.length > MAX_LOG_ENTRIES) botState.consoleLogs.shift();
  console.log(logEntry);
}

/**
 * Cleans up the bot instance, clearing all timers and listeners.
 */
function cleanupBot() {
  if (botState.bot) {
    botState.bot.removeAllListeners();
    const timers = [
      { timer: botState.uptimeInterval, clear: clearInterval },
      { timer: botState.leaveTimer, clear: clearTimeout },
      { timer: botState.scheduledReconnectTimer, clear: clearInterval },
      { timer: botState.movementInterval, clear: clearInterval },
      { timer: botState.messageInterval, clear: clearInterval },
      { timer: botState.serverStatusInterval, clear: clearInterval }
    ];
    timers.forEach(({ timer, clear }) => {
      if (timer) {
        clear(timer);
        timer = null;
      }
    });
    try {
      botState.bot.end();
    } catch (err) {
      logMessage(`Error ending bot connection: ${err.message}`, 'error');
    }
    botState.bot = null;
  }
  botState.isConnecting = false;
  botState.uptimeInterval = null;
  botState.leaveTimer = null;
  botState.scheduledReconnectTimer = null;
  botState.movementInterval = null;
  botState.messageInterval = null;
  botState.serverStatusInterval = null;
}

/**
 * Restarts the bot logic without exiting the process.
 */
function restartBotLogic() {
  logMessage('Restarting bot logic due to join failure...', 'warning');
  cleanupBot();
  botState.reconnectAttempts = 0;
  botState.serverStatus = 'Offline';
  botState.startTime = null;
  botState.playerCount = 0;
  botModule.createBotInstance();
}

/**
 * Reconnects the bot with exponential backoff.
 */
function reconnect() {
  if (botState.isConnecting) {
    logMessage('Already attempting to connect, skipping reconnect...', 'warning');
    return;
  }
  if (botState.reconnectAttempts === 0) {
    cleanupBot();
  }
  const delay = BASE_RECONNECT_DELAY * Math.pow(2, Math.min(botState.reconnectAttempts, 5));
  logMessage(`Force login: Reconnecting in ${delay / 1000} seconds... (Attempt ${botState.reconnectAttempts + 1})`, 'warning');
  setTimeout(() => {
    botModule.createBotInstance();
    botState.reconnectAttempts++;
  }, delay);
}

// Express Routes

app.use(express.static('public'));

app.get('/logs', (req, res) => res.json(botState.consoleLogs));
app.get('/status', (req, res) => res.json({
  status: botState.serverStatus,
  players: botState.playerCount,
  uptime: botState.startTime ? botModule.formatUptime(Date.now() - botState.startTime) : '00:00:00'
}));
app.get('/config', (req, res) => res.json({
  host: config.host,
  port: config.port,
  username1: config.username1,
  username2: config.username2,
  currentUsername: config.currentUsername
}));

app.post('/rejoin', (req, res) => {
  logMessage('Rejoin button clicked. Attempting to reconnect bot...', 'info');
  cleanupBot();
  setTimeout(() => {
    botModule.createBotInstance();
    res.json({ message: 'Rejoin attempt initiated' });
  }, 2000);
});

app.post('/update-config', (req, res) => {
  const { host, port, username1, username2 } = req.body;
  if (!host || !port || !username1 || !username2) {
    logMessage('Failed to update config: Missing fields', 'error');
    return res.status(400).json({ message: 'Missing required fields' });
  }

  config.host = host;
  config.port = parseInt(port);
  config.username1 = username1;
  config.username2 = username2;
  logMessage(`Updated bot config - Host: ${host}, Port: ${port}, Username1: ${username1}, Username2: ${username2}`, 'info');

  cleanupBot();
  setTimeout(() => {
    botModule.createBotInstance();
    res.json({ message: 'Configuration updated and bot reconnected' });
  }, 2000);
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/viewer', (req, res) => {
  if (botState.bot) mineflayerViewer(botState.bot, { port: 3007, firstPerson: true });
  res.send('Viewer started on port 3007');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logMessage(`Web server started on port ${PORT}`, 'info'));

// Initialize bot
botModule.initializeBot(botState);
// });