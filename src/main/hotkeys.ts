import { globalShortcut, BrowserWindow } from 'electron';
import { ConfigStore } from './config';

const config = ConfigStore.getInstance();

export function registerHotkeys(window: BrowserWindow): void {
  const toggleKey = (config.get('hotkeyToggle') as string) || 'CommandOrControl+Shift+G';
  const collapseKey = (config.get('hotkeyCollapse') as string) || 'CommandOrControl+Shift+M';
  const quickAskKey = (config.get('hotkeyQuickAsk') as string) || 'CommandOrControl+Shift+A';
  const captureKey = (config.get('hotkeyCaptureToggle') as string) || 'CommandOrControl+Shift+R';
  const bookmarkKey = (config.get('hotkeyBookmark') as string) || 'CommandOrControl+Shift+B';

  // Toggle visibility
  globalShortcut.register(toggleKey, () => {
    if (window.isDestroyed()) return;
    if (window.isVisible()) {
      window.hide();
    } else {
      window.show();
      window.focus();
    }
  });

  // Toggle collapse
  globalShortcut.register(collapseKey, () => {
    if (window.isDestroyed()) return;
    window.webContents.send('toggle-collapse');
  });

  // Quick ask
  globalShortcut.register(quickAskKey, () => {
    if (window.isDestroyed()) return;
    if (!window.isVisible()) {
      window.show();
    }
    window.webContents.send('quick-ask');
  });

  // Toggle audio capture
  globalShortcut.register(captureKey, () => {
    if (window.isDestroyed()) return;
    window.webContents.send('toggle-capture');
  });

  // Bookmark moment
  globalShortcut.register(bookmarkKey, () => {
    if (window.isDestroyed()) return;
    window.webContents.send('bookmark-moment');
  });
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
