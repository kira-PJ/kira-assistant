import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { ConfigStore } from './config';

export function createOverlayWindow(): BrowserWindow {
  const config = ConfigStore.getInstance();
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;

  // Default position: right side of screen
  const defaultWidth = 420;
  const defaultHeight = 600;
  const defaultX = screenWidth - defaultWidth - 20;
  const defaultY = Math.round((screenHeight - defaultHeight) / 2);

  const savedBounds = config.get('windowBounds') as {
    x: number;
    y: number;
    width: number;
    height: number;
  } | undefined;

  const window = new BrowserWindow({
    width: savedBounds?.width || defaultWidth,
    height: savedBounds?.height || defaultHeight,
    x: savedBounds?.x || defaultX,
    y: savedBounds?.y || defaultY,
    minWidth: 300,
    maxWidth: 600,
    minHeight: 40,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    movable: true,
    hasShadow: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Screen-share invisibility
  window.setContentProtection(true);

  // Keep always on top with highest level
  window.setAlwaysOnTop(true, 'screen-saver');

  // Visible in taskbar (skipTaskbar: false above)
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Set initial opacity
  const savedOpacity = (config.get('windowOpacity') as number) || 0.95;
  window.setOpacity(savedOpacity);

  // Save window position on move/resize
  const saveBounds = () => {
    if (!window.isDestroyed()) {
      const bounds = window.getBounds();
      if (bounds.height > 40) {
        config.set('windowBounds', bounds);
      }
    }
  };

  window.on('moved', saveBounds);
  window.on('resized', saveBounds);

  return window;
}
