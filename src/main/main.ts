/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build`, this file is compiled to
 * `./release/app/dist/main/main.js` using electron-vite.
 */
import path from 'path';
import fs from 'node:fs/promises';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import startAutoUpdates from './updates';
import type {
  DiscordChannel,
  DiscordMessageResult,
  DiscordSearchRequest,
} from './preload';

let mainWindow: BrowserWindow | null = null;

type IndexedDiscordMessage = DiscordMessageResult & { searchText: string };

type DiscordIndex = {
  channels: DiscordChannel[];
  authors: string[];
  messages: IndexedDiscordMessage[];
};

let discordIndexPromise: Promise<DiscordIndex> | undefined;

function discordLogsPath() {
  const assetsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(app.getAppPath(), 'assets');
  return path.join(assetsPath, 'discord-logs');
}

function decodeHtmlText(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/[^>]+>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
      if (code[0] === '#') {
        const point = code[1].toLowerCase() === 'x'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
        try {
          return String.fromCodePoint(point);
        } catch {
          return entity;
        }
      }
      return {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
      }[code.toLowerCase()] || entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAttribute(tag: string, attribute: string) {
  const match = tag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, 'i'));
  return match?.[1];
}

function buildDiscordIndex(): Promise<DiscordIndex> {
  if (!discordIndexPromise) {
    discordIndexPromise = (async () => {
      const directory = discordLogsPath();
      const fileNames = (await fs.readdir(directory))
        .filter((fileName) => fileName.toLowerCase().endsWith('.html'));
      const channels: DiscordChannel[] = [];
      const messages: IndexedDiscordMessage[] = [];
      const authors = new Set<string>();

      for (const fileName of fileNames) {
        const match = fileName.match(/^The Broken Islands - (.+?) - (.+?) \[(\d+)\]\.html$/i);
        if (!match) continue;

        const [, category, name, id] = match;
        const html = await fs.readFile(path.join(directory, fileName), 'utf8');
        const starts = [...html.matchAll(/\bid=["']?chatlog__message-container-(\d+)/gi)];
        const channelMessages: IndexedDiscordMessage[] = [];
        let currentAuthor = '';

        starts.forEach((start, index) => {
          const messageId = start[1];
          const begin = start.index ?? 0;
          const end = starts[index + 1]?.index ?? html.length;
          const fragment = html.slice(begin, end);
          const authorTag = fragment.match(/<span\b[^>]*class=["']?chatlog__author\b[^>]*>[\s\S]*?<\/span>/i)?.[0];
          if (authorTag) {
            currentAuthor = decodeHtmlText(authorTag.replace(/^[\s\S]*?>/, '').replace(/<\/span>$/i, ''));
          }

          const timeTag = fragment.match(/<span\b[^>]*class=["']?chatlog__(?:short-)?timestamp\b[^>]*>/i)?.[0];
          const timeText = timeTag ? extractAttribute(timeTag, 'title') : undefined;
          const parsedTime = timeText ? new Date(timeText).getTime() : 0;
          const contentHtml = fragment.match(/<div\b[^>]*class=["']?chatlog__content\b[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
          const content = decodeHtmlText(contentHtml);
          if (!content && !currentAuthor) return;

          const result: IndexedDiscordMessage = {
            id: messageId,
            channelId: id,
            channelName: name,
            category,
            author: currentAuthor || 'Unknown',
            content,
            timestamp: Number.isFinite(parsedTime) ? parsedTime : 0,
            searchText: `${currentAuthor} ${name} ${category} ${content}`.toLowerCase(),
          };
          channelMessages.push(result);
          messages.push(result);
          if (currentAuthor) authors.add(currentAuthor);
        });

        channels.push({ id, name, category, fileName, messageCount: channelMessages.length });
      }

      messages.sort((left, right) => right.timestamp - left.timestamp);
      channels.sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
      return { channels, authors: [...authors].sort((left, right) => left.localeCompare(right)), messages };
    })();
  }
  return discordIndexPromise;
}

ipcMain.handle('discord:get-index', async () => {
  const { channels, authors } = await buildDiscordIndex();
  return { channels, authors };
});

ipcMain.handle('discord:get-channel', async (_event, channelId: string) => {
  const { channels } = await buildDiscordIndex();
  const channel = channels.find(({ id }) => id === channelId);
  if (!channel) throw new Error('Unknown Discord channel');
  return fs.readFile(path.join(discordLogsPath(), channel.fileName), 'utf8');
});

ipcMain.handle('discord:search', async (_event, request: DiscordSearchRequest) => {
  const { messages } = await buildDiscordIndex();
  const terms = request.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const authors = new Set(request.authors.map((author) => author.toLowerCase()));
  const channelIds = new Set(request.channelIds);
  const limit = Math.min(Math.max(request.limit || 50, 1), 100);
  const results: DiscordMessageResult[] = [];
  let total = 0;

  for (const message of messages) {
    if (terms.some((term) => !message.searchText.includes(term))) continue;
    if (authors.size && !authors.has(message.author.toLowerCase())) continue;
    if (channelIds.size && !channelIds.has(message.channelId)) continue;
    if (request.after && message.timestamp < request.after) continue;
    if (request.before && message.timestamp > request.before) continue;
    total += 1;
    if (results.length < limit) {
      const { searchText: _searchText, ...result } = message;
      results.push(result);
    }
  }

  return { results, total };
});

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  process.setSourceMapsEnabled(true);
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  void import('electron-debug')
    .then(({ default: debug }) => debug())
    .catch(console.error);
}

const installExtensions = async () => {
  const { installExtension, REACT_DEVELOPER_TOOLS } =
    await import('electron-devtools-installer');
  return installExtension(REACT_DEVELOPER_TOOLS, {
    forceDownload: !!process.env.UPGRADE_EXTENSIONS,
  }).catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(app.getAppPath(), 'assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(resolveHtmlPath('index.html'));
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function reportWindowError(error: unknown) {
  log.error('Failed to create the application window', error);
  mainWindow?.destroy();
  mainWindow = null;
}

function onActivate() {
  // Reopening a macOS window must not initialize another updater.
  if (mainWindow === null) {
    void createWindow().catch(reportWindowError);
  }
}

app
  .whenReady()
  .then(async () => {
    await createWindow();
    startAutoUpdates();
    app.on('activate', onActivate);
  })
  .catch((error: unknown) => {
    reportWindowError(error);
    app.quit();
  });
