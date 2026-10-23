// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example' | 'navigate-to';

export type DiscordChannel = {
  id: string;
  name: string;
  category: string;
  fileName: string;
  messageCount: number;
};

export type DiscordMessageResult = {
  id: string;
  channelId: string;
  channelName: string;
  category: string;
  author: string;
  content: string;
  timestamp: number;
};

export type DiscordSearchRequest = {
  query: string;
  authors: string[];
  channelIds: string[];
  after: number | null;
  before: number | null;
  limit: number;
};

export type DiscordSearchResponse = {
  results: DiscordMessageResult[];
  total: number;
};

const electronHandler = {
  discord: {
    getIndex(): Promise<{ channels: DiscordChannel[]; authors: string[] }> {
      return ipcRenderer.invoke('discord:get-index');
    },
    getChannel(channelId: string): Promise<string> {
      return ipcRenderer.invoke('discord:get-channel', channelId);
    },
    search(request: DiscordSearchRequest): Promise<DiscordSearchResponse> {
      return ipcRenderer.invoke('discord:search', request);
    },
  },
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
