import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import path from 'path';

let tray: Tray | null = null;

export function createTray(window: BrowserWindow): Tray {
  // Create a simple 16x16 tray icon (ghost emoji fallback)
  const iconPath = path.join(__dirname, '../../../assets/tray-icon.png');
  let trayIcon: Electron.NativeImage;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback: create a simple colored icon
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon.isEmpty() ? createDefaultIcon() : trayIcon);
  tray.setToolTip('K.I.R.A. — Knowledge, Insights & Response Assistant');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (window.isVisible()) {
          window.hide();
        } else {
          window.show();
          window.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Start Capture',
      id: 'capture',
      click: () => {
        window.webContents.send('toggle-capture');
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        window.webContents.send('open-settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (window.isVisible()) {
      window.hide();
    } else {
      window.show();
      window.focus();
    }
  });

  return tray;
}

function createDefaultIcon(): Electron.NativeImage {
  // Create a simple 16x16 PNG buffer (teal circle)
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - size / 2;
      const dy = y - size / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < size / 2 - 1) {
        canvas[idx] = 0x16;     // R
        canvas[idx + 1] = 0xdb; // G
        canvas[idx + 2] = 0x93; // B
        canvas[idx + 3] = 0xff; // A
      } else {
        canvas[idx + 3] = 0x00; // transparent
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}
