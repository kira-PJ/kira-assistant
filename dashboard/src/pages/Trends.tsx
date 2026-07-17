import React from 'react';

const mockScores = [
  { date: '07/10', score: 65 },
  { date: '07/11', score: 70 },
  { date: '07/12', score: 68 },
  { date: '07/14', score: 75 },
  { date: '07/15', score: 82 },
  { date: '07/16', score: 85 },
  { date: '07/17', score: 78 },
];

const Trends: React.FC = () => {
  const maxScore = Math.max(...mockScores.map(s => s.score));
  const minScore = Math.min(...mockScores.map(s => s.score));
  const range = maxScore - minScore || 1;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Score Trends</h2>

      {/* Simple bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
        <h3 className="text-sm text-gray-400 mb-4">Overall Score (Last 7 Calls)</h3>
        <div className="flex items-end gap-3 h-40">
          {mockScores.map((entry) => {
            const height = ((entry.score - minScore + 10) / (range + 20)) * 100;
            return (
              <div key={entry.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-400">{entry.score}</span>
                <div
                  className="w-full bg-emerald-400/80 rounded-t transition-all"
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] text-gray-500 mt-1">{entry.date}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg text-center">
          <p className="text-2xl font-bold text-emerald-400">7</p>
          <p className="text-xs text-gray-500 mt-1">Total Calls</p>
        </div>
        <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg text-center">
          <p className="text-2xl font-bold text-emerald-400">74.7</p>
          <p className="text-xs text-gray-500 mt-1">Avg Score</p>
        </div>
        <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg text-center">
          <p className="text-2xl font-bold text-emerald-400">+13</p>
          <p className="text-xs text-gray-500 mt-1">Score Improvement</p>
        </div>
      </div>

      {/* Dimension breakdown */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Average by Dimension</h3>
        <div className="space-y-3">
          {[
            { name: 'Discovery Depth', avg: 79 },
            { name: 'Question Quality', avg: 76 },
            { name: 'Technical Accuracy', avg: 88 },
            { name: 'Engagement', avg: 72 },
            { name: 'Next Steps', avg: 81 },
            { name: 'Talk Ratio', avg: 64 },
            { name: 'Objection Handling', avg: 69 },
          ].map((dim) => (
            <div key={dim.name} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-36 shrink-0">{dim.name}</span>
              <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${dim.avg}%` }}
                />
              </div>
              <span className="text-xs text-gray-300 w-8 text-right">{dim.avg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Trends;
