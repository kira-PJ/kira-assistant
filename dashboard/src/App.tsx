import React, { useState, useEffect, useCallback } from 'react';

// === Config ===
const API_URL = 'https://jp6ir67fxb.execute-api.us-east-1.amazonaws.com/prod';
const COGNITO_CLIENT_ID = '6utrgprn6cvng5cr4ei93okv5s';
const COGNITO_REGION = 'us-east-1';

// === Types ===
interface CallMeta {
  callId: string;
  callName: string;
  callDate: string;
  durationMs: number;
  callType: string;
  participants: string;
  segmentCount: number;
  myRole: string;
  score: number;
  context?: string;
  talkRatio?: { you: number; other: number };
}

interface CallFull extends CallMeta {
  transcript: { speaker: string; speakerName: string; text: string; timestamp: number; isPartial?: boolean }[];
  cleanTranscript?: { speaker: string; speakerName: string; text: string; timestamp: number }[];
  summary?: any;
  actionItems?: any[];
  processed?: {
    title: string;
    summary: string;
    topics: { name: string; description: string }[];
    actionItems: { text: string; owner: string; dueDate?: string }[];
    keyTakeaways: string[];
    cleanTranscript: { speaker: string; speakerName: string; text: string; timestamp: number }[];
    nextSteps: string[];
  };
}

// === Auth ===
async function cognitoAuth(action: 'sign-in' | 'sign-up', email: string, password: string): Promise<{ idToken?: string; refreshToken?: string; error?: string; needsConfirmation?: boolean }> {
  const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
  
  if (action === 'sign-up') {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp' },
      body: JSON.stringify({ ClientId: COGNITO_CLIENT_ID, Username: email, Password: password, UserAttributes: [{ Name: 'email', Value: email }] }),
    });
    const data = await res.json();
    if (data.__type) return { error: data.message || 'Sign up failed' };
    return { needsConfirmation: !data.UserConfirmed };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({ ClientId: COGNITO_CLIENT_ID, AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: email, PASSWORD: password } }),
  });
  const data = await res.json();
  if (data.AuthenticationResult) {
    return { idToken: data.AuthenticationResult.IdToken, refreshToken: data.AuthenticationResult.RefreshToken };
  }
  return { error: data.message || 'Authentication failed' };
}

async function cognitoConfirm(email: string, code: string): Promise<{ success: boolean; error?: string }> {
  const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp' },
    body: JSON.stringify({ ClientId: COGNITO_CLIENT_ID, Username: email, ConfirmationCode: code }),
  });
  const data = await res.json();
  if (data.__type) return { success: false, error: data.message };
  return { success: true };
}

async function cognitoRefresh(refreshToken: string): Promise<string | null> {
  const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({ ClientId: COGNITO_CLIENT_ID, AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: refreshToken } }),
  });
  const data = await res.json();
  return data.AuthenticationResult?.IdToken ?? null;
}

async function apiGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiDelete(path: string, token: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiSearch(query: string, token: string): Promise<{ results: CallMeta[]; total: number }> {
  const res = await fetch(`${API_URL}/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Search API error: ${res.status}`);
  return res.json();
}

// === Theme ===
const themes = {
  dark: { bg: '#0f0f1a', surface: '#1a1a2e', surfaceAlt: '#16213e', border: '#2a2a4a', text: '#f1f5f9', textSecondary: '#94a3b8', textMuted: '#64748b', accent: '#16db93', accentHover: '#12b87a', speakerYou: '#60a5fa', speakerOther: '#16db93', warning: '#f59e0b', danger: '#ef4444', barBg: '#2a2a4a', inputBg: '#0f0f1a' },
  light: { bg: '#f8fafc', surface: '#ffffff', surfaceAlt: '#f1f5f9', border: '#e2e8f0', text: '#0f172a', textSecondary: '#475569', textMuted: '#64748b', accent: '#059669', accentHover: '#047857', speakerYou: '#2563eb', speakerOther: '#059669', warning: '#d97706', danger: '#dc2626', barBg: '#e2e8f0', inputBg: '#f8fafc' },
};
type ThemeMode = 'dark' | 'light';

// === App ===
type View = 'login' | 'list' | 'detail';

const App: React.FC = () => {
  const [view, setView] = useState<View>('login');
  const [calls, setCalls] = useState<CallMeta[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshTokenStr, setRefreshTokenStr] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try { return (localStorage.getItem('kira-theme') as ThemeMode) ?? 'dark'; } catch { return 'dark'; }
  });

  const t = themes[themeMode];

  const toggleTheme = () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    try { localStorage.setItem('kira-theme', next); } catch {}
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('kira-session');
      if (stored) {
        const s = JSON.parse(stored);
        if (s.token && s.refreshToken) {
          setToken(s.token); setRefreshTokenStr(s.refreshToken); setEmail(s.email ?? '');
          setView('list');
        }
      }
    } catch {}
  }, []);

  useEffect(() => { if (token && view === 'list') loadCalls(); }, [token, view]);

  const loadCalls = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiGet('/calls', token);
      setCalls(data.calls ?? []);
    } catch {
      if (refreshTokenStr) {
        const newToken = await cognitoRefresh(refreshTokenStr);
        if (newToken) {
          setToken(newToken);
          localStorage.setItem('kira-session', JSON.stringify({ token: newToken, refreshToken: refreshTokenStr, email }));
          try { const data = await apiGet('/calls', newToken); setCalls(data.calls ?? []); } catch (e2: any) { setError(e2.message); }
        } else { setView('login'); }
      }
    } finally { setLoading(false); }
  }, [token, refreshTokenStr, email]);

  const openCall = async (callId: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiGet(`/calls/${callId}`, token);
      setSelectedCall(data as CallFull); setView('detail');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleAuth = async (authEmail: string, password: string, isSignUp: boolean) => {
    setError(null); setLoading(true);
    try {
      if (isSignUp) {
        const result = await cognitoAuth('sign-up', authEmail, password);
        if (result.error) { setError(result.error); return result; }
        return result;
      }
      const result = await cognitoAuth('sign-in', authEmail, password);
      if (result.error) { setError(result.error); return result; }
      if (result.idToken) {
        setToken(result.idToken); setRefreshTokenStr(result.refreshToken!); setEmail(authEmail);
        localStorage.setItem('kira-session', JSON.stringify({ token: result.idToken, refreshToken: result.refreshToken, email: authEmail }));
        setView('list');
      }
      return result;
    } catch (err: any) { setError(err.message); return { error: err.message }; }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    setToken(null); setRefreshTokenStr(null); setCalls([]); setSelectedCall(null);
    localStorage.removeItem('kira-session'); setView('login');
  };

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: 'background 0.2s' }}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${t.border}`, padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ color: t.accent, fontSize: '22px', fontWeight: 700 }}>K.I.R.A.</span>
          <span style={{ fontSize: '13px', color: t.textMuted, fontWeight: 400 }}>Call Intelligence Platform</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {view === 'detail' && (
            <button onClick={() => { setSelectedCall(null); setView('list'); }} style={{ fontSize: '14px', color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              ← All Calls
            </button>
          )}
          {token && (
            <>
              <span style={{ fontSize: '13px', color: t.textMuted }}>{email}</span>
              <button onClick={handleLogout} style={{ fontSize: '13px', color: t.textSecondary, background: 'none', border: `1px solid ${t.border}`, borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}>
                Sign Out
              </button>
            </>
          )}
          <button onClick={toggleTheme} style={{ fontSize: '14px', background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: t.textSecondary }}>
            {themeMode === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 32px' }}>
        {error && (
          <div style={{ marginBottom: '20px', padding: '14px 18px', background: `${t.danger}12`, border: `1px solid ${t.danger}30`, borderRadius: '8px', fontSize: '14px', color: t.danger }}>
            {error}
          </div>
        )}
        {view === 'login' && <AuthForm onAuth={handleAuth} onConfirm={cognitoConfirm} loading={loading} theme={t} />}
        {view === 'list' && <CallList calls={calls} loading={loading} onOpen={openCall} onRefresh={loadCalls} theme={t} token={token} />}
        {view === 'detail' && selectedCall && <CallDetail call={selectedCall} theme={t} />}
      </main>
    </div>
  );
};

// === Auth Form (Sign In + Sign Up + Confirm) ===
const AuthForm: React.FC<{
  onAuth: (email: string, password: string, isSignUp: boolean) => Promise<any>;
  onConfirm: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  loading: boolean;
  theme: typeof themes.dark;
}> = ({ onAuth, onConfirm, loading, theme: t }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'confirm'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLocalError('');
    if (mode === 'confirm') {
      const result = await onConfirm(email, code);
      if (result.success) {
        await onAuth(email, password, false);
      } else { setLocalError(result.error ?? 'Confirmation failed'); }
      return;
    }
    const result = await onAuth(email, password, mode === 'signup');
    if (result?.needsConfirmation) { setMode('confirm'); }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '14px 16px', background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: '8px', color: t.text, fontSize: '15px', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: '380px', margin: '60px auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: t.accent, marginBottom: '8px' }}>K.I.R.A.</h1>
        <p style={{ fontSize: '16px', color: t.textSecondary }}>
          {mode === 'signin' ? 'Sign in to your account' : mode === 'signup' ? 'Create your account' : 'Verify your email'}
        </p>
      </div>

      {localError && <div style={{ marginBottom: '16px', padding: '12px', background: `${t.danger}12`, borderRadius: '8px', fontSize: '14px', color: t.danger }}>{localError}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {mode !== 'confirm' ? (
          <>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: t.textSecondary, marginBottom: '6px', fontWeight: 500 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: t.textSecondary, marginBottom: '6px', fontWeight: 500 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} style={inputStyle} />
            </div>
          </>
        ) : (
          <div>
            <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '16px' }}>A verification code was sent to <strong>{email}</strong></p>
            <label style={{ display: 'block', fontSize: '14px', color: t.textSecondary, marginBottom: '6px', fontWeight: 500 }}>Verification Code</label>
            <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="123456" required style={{ ...inputStyle, textAlign: 'center', letterSpacing: '4px', fontSize: '20px' }} />
          </div>
        )}
        <button type="submit" disabled={loading} style={{ padding: '14px', background: t.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, marginTop: '8px' }}>
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Verify'}
        </button>
      </form>

      {mode !== 'confirm' && (
        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: t.textMuted }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setLocalError(''); }} style={{ color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '14px' }}>
            {mode === 'signin' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      )}
    </div>
  );
};

// === Call List with Search & Insights ===
type ListTab = 'calls' | 'insights';

const CallList: React.FC<{ calls: CallMeta[]; loading: boolean; onOpen: (id: string) => void; onRefresh: () => void; theme: typeof themes.dark; token: string | null }> = ({ calls, loading, onOpen, onRefresh, theme: t, token }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CallMeta[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<ListTab>('calls');

  const handleDelete = async (callId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    if (!confirm('Delete this call permanently?')) return;
    try {
      await apiDelete(`/calls/${callId}`, token);
      onRefresh();
    } catch { /* silently fail */ }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    // Local filter for instant results
    const localFiltered = calls.filter(c =>
      c.callName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.participants?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.callType.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSearchResults(localFiltered);
    // Also call API for cross-transcript search
    if (token) {
      setSearching(true);
      try {
        const data = await apiSearch(searchQuery, token);
        if (data.results && data.results.length > 0) {
          // Merge API results with local, dedup by callId
          const merged = [...localFiltered];
          data.results.forEach(r => {
            if (!merged.find(m => m.callId === r.callId)) merged.push(r);
          });
          setSearchResults(merged);
        }
      } catch { /* keep local results */ }
      finally { setSearching(false); }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearSearch = () => { setSearchQuery(''); setSearchResults(null); };

  const displayCalls = searchResults ?? calls;

  // Insights calculations
  const totalCalls = calls.length;
  const totalHours = calls.reduce((acc, c) => acc + c.durationMs, 0) / 3600000;
  const avgTalkRatio = calls.filter(c => c.talkRatio).reduce((acc, c, _, arr) => acc + (c.talkRatio!.you / arr.length), 0);
  const allTopics: Record<string, number> = {};
  calls.forEach(c => {
    if (c.callType) allTopics[c.callType] = (allTopics[c.callType] || 0) + 1;
  });
  const topTopics = Object.entries(allTopics).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const trainingCalls = calls.filter(c => c.callType === 'training');

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: '14px', fontWeight: 500, padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', border: 'none',
    background: active ? t.accent : t.surfaceAlt, color: active ? '#fff' : t.textSecondary, transition: 'all 0.15s',
  });

  if (activeTab === 'insights') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Insights</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setActiveTab('calls')} style={tabBtnStyle(false)}>Calls</button>
            <button onClick={() => setActiveTab('insights')} style={tabBtnStyle(true)}>Insights</button>
          </div>
        </div>

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: t.accent }}>{totalCalls}</div>
            <div style={{ fontSize: '13px', color: t.textMuted, marginTop: '4px' }}>Total Calls</div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: t.accent }}>{totalHours.toFixed(1)}</div>
            <div style={{ fontSize: '13px', color: t.textMuted, marginTop: '4px' }}>Hours Transcribed</div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: t.accent }}>{Math.round(avgTalkRatio)}%</div>
            <div style={{ fontSize: '13px', color: t.textMuted, marginTop: '4px' }}>Avg Talk Ratio (You)</div>
          </div>
        </div>

        {/* Top Topics */}
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Most Discussed Topics</h4>
          {topTopics.length === 0 ? (
            <p style={{ fontSize: '14px', color: t.textMuted }}>No topic data yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topTopics.map(([topic, count]) => (
                <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: t.text, textTransform: 'capitalize', minWidth: '120px' }}>{topic}</span>
                  <div style={{ flex: 1, height: '8px', background: t.barBg, borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(count / totalCalls) * 100}%`, height: '100%', background: t.accent, borderRadius: '4px' }} />
                  </div>
                  <span style={{ fontSize: '13px', color: t.textMuted, minWidth: '30px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Action Items */}
        <div style={{ background: t.surface, border: `1px solid ${t.accent}30`, borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.accent, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action Items (All Calls)</h4>
          <p style={{ fontSize: '14px', color: t.textMuted }}>Open call details to view action items per call. Aggregate tracking available when call data includes processed action items.</p>
        </div>

        {/* Training Progress (Task 4) */}
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px 24px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Training Progress</h4>
          {trainingCalls.length === 0 ? (
            <p style={{ fontSize: '14px', color: t.textMuted }}>No training sessions recorded yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {trainingCalls.map((tc) => (
                <div key={tc.callId} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', background: t.surfaceAlt, borderRadius: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.accent, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: t.text }}>{tc.callName}</span>
                    <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '2px' }}>
                      {new Date(tc.callDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      {' · '}{Math.round(tc.durationMs / 60000)} min
                      {tc.participants && ` · ${tc.participants}`}
                    </div>
                  </div>
                </div>
              ))}
              {/* Timeline visualization */}
              <div style={{ marginTop: '12px', padding: '12px', background: t.surfaceAlt, borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '8px' }}>Timeline ({trainingCalls.length} sessions)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {trainingCalls.map((tc, i) => (
                    <div key={tc.callId} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.accent }} />
                      {i < trainingCalls.length - 1 && <div style={{ width: '100%', height: '2px', background: t.accent, marginTop: '-5px' }} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Your Calls</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setActiveTab('calls')} style={tabBtnStyle(true)}>Calls</button>
          <button onClick={() => setActiveTab('insights')} style={tabBtnStyle(false)}>Insights</button>
          <button onClick={onRefresh} style={{ fontSize: '14px', color: t.textSecondary, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontWeight: 500 }}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search calls by name, participant, or transcript..."
          style={{ flex: 1, padding: '12px 16px', background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: '8px', color: t.text, fontSize: '14px', outline: 'none' }}
        />
        <button onClick={handleSearch} style={{ padding: '12px 20px', background: t.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
          {searching ? 'Searching...' : 'Search'}
        </button>
        {searchResults && (
          <button onClick={clearSearch} style={{ padding: '12px 16px', background: t.surfaceAlt, color: t.textSecondary, border: `1px solid ${t.border}`, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {searchResults && (
        <div style={{ marginBottom: '16px', fontSize: '14px', color: t.textMuted }}>
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
        </div>
      )}

      {displayCalls.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: t.textMuted }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>{searchResults ? 'No matching calls found' : 'No calls synced yet'}</p>
          <p style={{ fontSize: '14px' }}>{searchResults ? 'Try a different search term' : 'Start a capture in the K.I.R.A. desktop app — your calls will appear here automatically'}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {displayCalls.map((call) => (
          <div
            key={call.callId}
            onClick={() => onOpen(call.callId)}
            style={{ padding: '24px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: '12px', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.boxShadow = `0 0 0 1px ${t.accent}30`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '8px' }}>{call.callName}</h3>
                <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: t.textMuted, flexWrap: 'wrap' }}>
                  <span>{new Date(call.callDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  <span>{Math.round(call.durationMs / 60000)} min</span>
                  <span style={{ textTransform: 'capitalize', background: t.surfaceAlt, padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500 }}>{call.callType}</span>
                  {call.participants && <span>{call.participants}</span>}
                </div>
              </div>
              {call.score > 0 && (
                <div style={{ fontSize: '24px', fontWeight: 700, color: call.score >= 80 ? t.accent : call.score >= 60 ? t.warning : t.danger }}>
                  {call.score}
                </div>
              )}
              <button
                onClick={(e) => handleDelete(call.callId, e)}
                style={{ fontSize: '12px', color: t.textMuted, background: 'none', border: `1px solid ${t.border}`, borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', marginLeft: '12px', flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.danger; e.currentTarget.style.color = t.danger; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// === Call Detail ===
const CallDetail: React.FC<{ call: CallFull; theme: typeof themes.dark }> = ({ call, theme: t }) => {
  const processed = call.processed;
  const cleanTranscript = processed?.cleanTranscript || call.cleanTranscript || [];
  const rawTranscript = call.transcript?.filter(s => !s.isPartial) ?? [];
  const [showRaw, setShowRaw] = useState(false);

  const displayTranscript = showRaw ? rawTranscript : (cleanTranscript.length > 0 ? cleanTranscript : rawTranscript);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '10px' }}>{processed?.title || call.callName}</h2>
        <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: t.textMuted, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{new Date(call.callDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span>{Math.round(call.durationMs / 60000)} min</span>
          <span style={{ textTransform: 'capitalize', background: t.surfaceAlt, padding: '3px 12px', borderRadius: '12px', fontSize: '13px', fontWeight: 500 }}>{call.callType}</span>
          {call.participants && <span>{call.participants}</span>}
        </div>
      </div>

      {/* Summary */}
      {processed?.summary && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '20px 24px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Summary</h4>
          <p style={{ fontSize: '15px', color: t.text, lineHeight: '1.8' }}>{processed.summary}</p>
        </div>
      )}

      {/* Key Takeaways */}
      {processed?.keyTakeaways && processed.keyTakeaways.length > 0 && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '20px 24px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Key Takeaways</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {processed.keyTakeaways.map((item, i) => (
              <li key={i} style={{ fontSize: '15px', color: t.text, lineHeight: '1.7', marginBottom: '8px', paddingLeft: '16px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: t.accent }}>•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Topics */}
      {processed?.topics && processed.topics.length > 0 && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '20px 24px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Topics Covered</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {processed.topics.map((topic, i) => (
              <div key={i}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: t.text }}>{topic.name}</span>
                <p style={{ fontSize: '14px', color: t.textSecondary, margin: '4px 0 0', lineHeight: '1.6' }}>{topic.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Items */}
      {processed?.actionItems && processed.actionItems.length > 0 && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '20px 24px', borderRadius: '12px', border: `1px solid ${t.accent}30` }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.accent, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action Items</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {processed.actionItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ width: '20px', height: '20px', borderRadius: '4px', border: `2px solid ${t.border}`, flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontSize: '15px', color: t.text, margin: 0, lineHeight: '1.6' }}>{item.text}</p>
                  <span style={{ fontSize: '12px', color: t.textMuted }}>
                    Owner: {item.owner}{item.dueDate ? ` · Due: ${item.dueDate}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Steps */}
      {processed?.nextSteps && processed.nextSteps.length > 0 && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '20px 24px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Next Steps</h4>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {processed.nextSteps.map((step, i) => (
              <li key={i} style={{ fontSize: '15px', color: t.text, lineHeight: '1.7', marginBottom: '8px', paddingLeft: '28px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: t.accent, fontWeight: 700, fontSize: '13px' }}>{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Recommendations */}
      {(processed as any)?.recommendations && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '20px 24px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Meeting Recommendations</h4>
            {(processed as any).recommendations.overallScore && (
              <span style={{ fontSize: '20px', fontWeight: 700, color: (processed as any).recommendations.overallScore >= 7 ? t.accent : (processed as any).recommendations.overallScore >= 5 ? t.warning : t.danger }}>
                {(processed as any).recommendations.overallScore}/10
              </span>
            )}
          </div>

          {(processed as any).recommendations.strengths?.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: t.accent, display: 'block', marginBottom: '8px' }}>What went well</span>
              {(processed as any).recommendations.strengths.map((s: string, i: number) => (
                <p key={i} style={{ fontSize: '14px', color: t.text, margin: '0 0 6px', paddingLeft: '14px', position: 'relative', lineHeight: '1.6' }}>
                  <span style={{ position: 'absolute', left: 0, color: t.accent }}>+</span>{s}
                </p>
              ))}
            </div>
          )}

          {(processed as any).recommendations.improvements?.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: t.warning, display: 'block', marginBottom: '8px' }}>What could improve</span>
              {(processed as any).recommendations.improvements.map((s: string, i: number) => (
                <p key={i} style={{ fontSize: '14px', color: t.text, margin: '0 0 6px', paddingLeft: '14px', position: 'relative', lineHeight: '1.6' }}>
                  <span style={{ position: 'absolute', left: 0, color: t.warning }}>-</span>{s}
                </p>
              ))}
            </div>
          )}

          {(processed as any).recommendations.suggestions?.length > 0 && (
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: t.speakerYou, display: 'block', marginBottom: '8px' }}>For next time</span>
              {(processed as any).recommendations.suggestions.map((s: string, i: number) => (
                <p key={i} style={{ fontSize: '14px', color: t.text, margin: '0 0 6px', paddingLeft: '14px', position: 'relative', lineHeight: '1.6' }}>
                  <span style={{ position: 'absolute', left: 0, color: t.speakerYou, fontSize: '12px', fontWeight: 700 }}>{i + 1}.</span>{s}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Talk Ratio */}
      {call.talkRatio && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '20px 24px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Talk Ratio</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '14px', color: t.speakerYou, fontWeight: 600, minWidth: '60px' }}>You {call.talkRatio.you}%</span>
            <div style={{ flex: 1, height: '10px', background: t.barBg, borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${call.talkRatio.you}%`, background: t.speakerYou, borderRadius: '5px 0 0 5px' }} />
              <div style={{ width: `${call.talkRatio.other}%`, background: t.speakerOther, borderRadius: '0 5px 5px 0' }} />
            </div>
            <span style={{ fontSize: '14px', color: t.speakerOther, fontWeight: 600, minWidth: '70px', textAlign: 'right' }}>Other {call.talkRatio.other}%</span>
          </div>
        </div>
      )}

      {/* Transcript */}
      {displayTranscript.length > 0 && (
        <div style={{ background: t.surface, padding: '24px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
              {showRaw ? 'Full Transcript' : 'Transcript'} ({displayTranscript.length} segments)
            </h4>
            {cleanTranscript.length > 0 && rawTranscript.length > 0 && (
              <button
                onClick={() => setShowRaw(!showRaw)}
                style={{ fontSize: '13px', color: t.textMuted, background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: '6px', padding: '4px 12px', cursor: 'pointer' }}
              >
                {showRaw ? 'Show Clean' : 'Show Full'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '600px', overflowY: 'auto' }}>
            {displayTranscript.map((seg, i) => (
              <div key={i} style={{ paddingBottom: '12px', borderBottom: i < displayTranscript.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: seg.speaker === 'you' ? t.speakerYou : t.speakerOther, display: 'block', marginBottom: '4px' }}>
                  {seg.speakerName}
                </span>
                <p style={{ fontSize: '15px', color: t.text, lineHeight: '1.7', margin: 0 }}>{seg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {displayTranscript.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: t.textMuted, background: t.surface, borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <p style={{ fontSize: '16px' }}>No transcript data synced for this call yet</p>
        </div>
      )}
    </div>
  );
};

export default App;
