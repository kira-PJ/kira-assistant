import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import { Logger } from '../services/Logger';

const log = Logger.getInstance().child('updater');

/**
 * Auto-updater with in-app notification
 *
 * Checks GitHub Releases for new versions.
 * Sends update info to renderer so the app can show a nice UI notification
 * with changelog and "Update Now" button.
 *
 * For private repos: set GH_TOKEN env variable or make repo public.
 */
export function initAutoUpdater(window: BrowserWindow): void {
  autoUpdater.autoDownload = false; // Don't download until user clicks "Update Now"
  autoUpdater.autoInstallOnAppQuit = true;

  // For private repos, set the GitHub token
  if (process.env.GH_TOKEN) {
    (autoUpdater as any).requestHeaders = { Authorization: `token ${process.env.GH_TOKEN}` };
  }

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('Update available', { version: info.version });
    // Send to renderer for in-app notification
    window.webContents.send('update-available', {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n: any) => n.note || n).join('\n')
          : '',
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    window.webContents.send('update-progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('Update downloaded', { version: info.version });
    window.webContents.send('update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.warn('Auto-update error', { error: err.message?.slice(0, 100) });
    // Don't crash the app on update errors — just log and continue
  });

  // IPC handlers for renderer to control updates
  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: !!result?.updateInfo, version: result?.updateInfo?.version };
    } catch {
      return { available: false };
    }
  });

  ipcMain.handle('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Check on startup (delay 15s)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 15000);

  // Check every 2 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 2 * 60 * 60 * 1000);
}
