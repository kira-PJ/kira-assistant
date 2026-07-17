import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';
import { Logger } from '../services/Logger';

const log = Logger.getInstance().child('updater');

/**
 * Auto-updater using electron-updater with S3 backend
 *
 * Checks for updates on startup and every 4 hours.
 * Shows a dialog when an update is available and prompts to restart.
 */
export function initAutoUpdater(window: BrowserWindow): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available', { version: info.version });
    window.webContents.send('update-available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    log.debug('No update available');
  });

  autoUpdater.on('download-progress', (progress) => {
    window.webContents.send('update-progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', { version: info.version });

    dialog
      .showMessageBox(window, {
        type: 'info',
        title: 'K.I.R.A. Update',
        message: `Version ${info.version} is ready to install.`,
        detail: 'The update will be applied when you restart the app.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  autoUpdater.on('error', (err) => {
    log.warn('Auto-update error', { error: err.message });
  });

  // Check on startup (delay 10s to not slow down launch)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10000);

  // Check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}
