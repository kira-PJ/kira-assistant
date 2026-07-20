import React, { useState, useEffect } from 'react';

/**
 * UpdateBanner — Shows at the top of the app when an update is available.
 * Displays version + changelog, with Download and Install buttons.
 */
const UpdateBanner: React.FC = () => {
  const [update, setUpdate] = useState<{ version: string; releaseNotes: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.ghostAPI as any;
    if (!api) return;

    const cleanupAvailable = api.onUpdateAvailable?.((info: any) => {
      setUpdate(info);
      setDismissed(false);
    });
    const cleanupProgress = api.onUpdateProgress?.((p: any) => {
      setProgress(p.percent);
    });
    const cleanupDownloaded = api.onUpdateDownloaded?.(() => {
      setDownloaded(true);
      setDownloading(false);
    });

    return () => { cleanupAvailable?.(); cleanupProgress?.(); cleanupDownloaded?.(); };
  }, []);

  const handleDownload = () => {
    setDownloading(true);
    (window.ghostAPI as any).downloadUpdate?.();
  };

  const handleInstall = () => {
    (window.ghostAPI as any).installUpdate?.();
  };

  if (!update || dismissed) return null;

  return (
    <div className="px-3 py-2 bg-ghost-accent/10 border-b border-ghost-accent/30 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-semibold text-ghost-accent">Update available: v{update.version}</span>
        {update.releaseNotes && (
          <span className="text-[11px] text-ghost-text-dim truncate max-w-[200px]">
            {update.releaseNotes.split('\n')[0]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {downloading && !downloaded && (
          <span className="text-[11px] text-ghost-text-dim">{progress}%</span>
        )}
        {!downloading && !downloaded && (
          <button
            onClick={handleDownload}
            className="text-[11px] px-3 py-1 rounded bg-ghost-accent text-ghost-bg font-medium"
          >
            Download
          </button>
        )}
        {downloaded && (
          <button
            onClick={handleInstall}
            className="text-[11px] px-3 py-1 rounded bg-ghost-accent text-ghost-bg font-medium"
          >
            Restart to Update
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-[11px] text-ghost-text-dim hover:text-ghost-text px-1"
        >
          Later
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
