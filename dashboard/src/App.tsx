import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import CallList from './pages/CallList';
import CallDetail from './pages/CallDetail';
import Trends from './pages/Trends';
import Export from './pages/Export';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Header */}
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 font-bold text-lg">✦</span>
            <h1 className="text-lg font-semibold">K.I.R.A. Dashboard</h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className="text-gray-400 hover:text-gray-100 transition-colors">Calls</Link>
            <Link to="/trends" className="text-gray-400 hover:text-gray-100 transition-colors">Trends</Link>
            <Link to="/export" className="text-gray-400 hover:text-gray-100 transition-colors">Export</Link>
          </nav>
        </header>

        {/* Content */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<CallList />} />
            <Route path="/call/:id" element={<CallDetail />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/export" element={<Export />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
