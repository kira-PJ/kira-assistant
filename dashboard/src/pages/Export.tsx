import React, { useState } from 'react';

const Export: React.FC = () => {
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    // In production this would call the API to get all calls data
    const mockData = {
      exportDate: new Date().toISOString(),
      totalCalls: 7,
      calls: [
        { id: '1', title: 'Discovery: Cloud Migration', date: '2026-07-17', score: 78 },
        { id: '2', title: 'Demo: Container Services', date: '2026-07-16', score: 85 },
      ],
    };

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'csv') {
      const header = 'id,title,date,score\n';
      const rows = mockData.calls
        .map(c => `"${c.id}","${c.title}","${c.date}",${c.score}`)
        .join('\n');
      content = header + rows;
      filename = `kira-export-${Date.now()}.csv`;
      mimeType = 'text/csv';
    } else {
      content = JSON.stringify(mockData, null, 2);
      filename = `kira-export-${Date.now()}.json`;
      mimeType = 'application/json';
    }

    // Trigger download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Export Data</h2>
      <p className="text-sm text-gray-400 mb-6">
        Download all your call data for backup or analysis. Your data is always yours.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Export Format</h3>
        <div className="space-y-3 mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="format"
              checked={format === 'json'}
              onChange={() => setFormat('json')}
              className="accent-emerald-400"
            />
            <div>
              <p className="text-sm text-gray-200">JSON</p>
              <p className="text-xs text-gray-500">Full structured data, ideal for import/migration</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="format"
              checked={format === 'csv'}
              onChange={() => setFormat('csv')}
              className="accent-emerald-400"
            />
            <div>
              <p className="text-sm text-gray-200">CSV</p>
              <p className="text-xs text-gray-500">Spreadsheet-friendly, for analysis in Excel/Sheets</p>
            </div>
          </label>
        </div>

        <button
          onClick={handleExport}
          className="px-4 py-2 bg-emerald-500 text-gray-950 text-sm font-medium rounded hover:bg-emerald-400 transition-colors"
        >
          {exported ? '✓ Downloaded!' : 'Download Export'}
        </button>
      </div>
    </div>
  );
};

export default Export;
