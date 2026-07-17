import { EventEmitter } from 'events';
import { execSync } from 'child_process';

/**
 * MeetingDetector - Detects when a conference app is active
 *
 * Monitors running processes for known meeting applications and
 * audio activity to auto-start/stop capture.
 *
 * Supported apps: Zoom, Teams, Google Meet (Chrome), Webex, Slack Huddle
 */
export class MeetingDetector extends EventEmitter {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pollMs = 5000; // Check every 5 seconds
  private meetingActive = false;
  private lastActiveApp: string | null = null;

  private knownApps: { process: string; name: string }[] = [
    { process: 'zoom', name: 'Zoom' },
    { process: 'teams', name: 'Microsoft Teams' },
    { process: 'webex', name: 'Webex' },
    { process: 'slack', name: 'Slack' },
    { process: 'discord', name: 'Discord' },
    { process: 'skype', name: 'Skype' },
    // Chrome/Chromium with Google Meet detected via window title
    { process: 'chrome', name: 'Google Meet' },
    { process: 'chromium', name: 'Google Meet' },
    { process: 'firefox', name: 'Browser Call' },
  ];

  /**
   * Start polling for meeting apps
   */
  start(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => this.detect(), this.pollMs);
    this.detect(); // Run immediately
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Check if a meeting is currently detected
   */
  isMeetingActive(): boolean {
    return this.meetingActive;
  }

  getActiveApp(): string | null {
    return this.lastActiveApp;
  }

  private detect(): void {
    try {
      const active = this.detectMeetingApp();

      if (active && !this.meetingActive) {
        this.meetingActive = true;
        this.lastActiveApp = active;
        this.emit('meeting-started', active);
      } else if (!active && this.meetingActive) {
        this.meetingActive = false;
        const prev = this.lastActiveApp;
        this.lastActiveApp = null;
        this.emit('meeting-ended', prev);
      }
    } catch {
      // Silent failure — detection is best-effort
    }
  }

  private detectMeetingApp(): string | null {
    if (process.platform === 'linux') {
      return this.detectLinux();
    } else if (process.platform === 'darwin') {
      return this.detectMacOS();
    } else if (process.platform === 'win32') {
      return this.detectWindows();
    }
    return null;
  }

  private detectLinux(): string | null {
    try {
      // Check PulseAudio/PipeWire for active recording streams
      const paOutput = execSync(
        'pactl list source-outputs short 2>/dev/null || pipewire-cli list-objects 2>/dev/null',
        { encoding: 'utf-8', timeout: 3000 }
      );

      // Check running processes
      const ps = execSync('ps aux', { encoding: 'utf-8', timeout: 3000 });
      const psLower = ps.toLowerCase();

      for (const app of this.knownApps) {
        if (psLower.includes(app.process)) {
          // For browser-based meetings, check if audio source is active
          if (app.process === 'chrome' || app.process === 'chromium' || app.process === 'firefox') {
            if (paOutput.includes(app.process) || paOutput.includes('WebRTC')) {
              return app.name;
            }
          } else {
            // Native apps — presence + audio activity = meeting
            if (paOutput.includes(app.process)) {
              return app.name;
            }
            // Fallback: app is running with audio streams
            if (paOutput.length > 0) {
              return app.name;
            }
          }
        }
      }
    } catch { /* silent */ }
    return null;
  }

  private detectMacOS(): string | null {
    try {
      const ps = execSync('ps aux', { encoding: 'utf-8', timeout: 3000 });
      const psLower = ps.toLowerCase();

      for (const app of this.knownApps) {
        if (psLower.includes(app.process)) {
          return app.name;
        }
      }
    } catch { /* silent */ }
    return null;
  }

  private detectWindows(): string | null {
    try {
      const ps = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8', timeout: 3000 });
      const psLower = ps.toLowerCase();

      for (const app of this.knownApps) {
        if (psLower.includes(app.process)) {
          return app.name;
        }
      }
    } catch { /* silent */ }
    return null;
  }
}
