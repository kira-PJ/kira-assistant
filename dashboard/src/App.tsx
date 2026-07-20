import React, { useState, useEffect, useCallback } from 'react';

// === Theme support ===
const themes = {
  dark: {
    bg: '#0a0a1a',
    surface: '#111827',
    border: '#1e293b',
    text: '#e2e8f0',
    textDim: '#64748b',
    textMuted: '#94a3b8',
    accent: '#16db93',
    accentHover: '#059669',
    speakerYou: '#60a5fa',
    speakerOther: '#16db93',
    warning: '#f59e0b',
    danger: '#ef4444',
    barBg: '#1e293b',
  },
  light: {
    bg: '#f8fafc',
    surface: '#ffffff',
    border: '#e2e8f0',
    text: '#1e293b',
    textDim: '#64748b',
    textMuted: '#475569',
    accent: '#059669',
    accentHover: '#047857',
    speakerYou: '#2563eb',
    speakerOther: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    barBg: '#e2e8f0',
  },
};

type ThemeMode = 'dark' | 'light';

// === API Config ===
const API_URL = 'https://jp6ir67fxb.execute-api.us-east-1.amazonaws.com/prod';
const COGNITO_CLIENT_ID = '6utrgprn6cvng5cr4ei93okv5s';
const COGNITO_REGION = 'us-east-1';
const COGNITO_USER_POOL_ID = 'us-east-1_WPUraFlI4';

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
  summary?: any;
  actionItems?: any[];
}

// === Auth helpers ===
async function cognitoSignIn(email: string, password: string): Promise<{ idToken: string; refreshToken: string } | null> {
  const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      ClientId: COGNITO_CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  });
  const data = await res.json();
  if (data.AuthenticationResult) {
    return {
      idToken: data.AuthenticationResult.IdToken,
      refreshToken: data.AuthenticationResult.RefreshToken,
    };
  }
  return null;
}

async function cognitoRefresh(refreshToken: string): Promise<string | null> {
  const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      ClientId: COGNITO_CLIENT_ID,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
  });
  const data = await res.json();
  return data.AuthenticationResult?.IdToken ?? null;
}

// === API client ===
async function apiGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// === App ===
type View = 'login' | 'list' | 'detail';

const App: React.FC = () => {
  const [view, setView] = useState<View>('login');
  const [calls, setCalls] = useState<CallMeta[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
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

  // Check for stored session
  useEffect(() => {
    try {
      const stored = localStorage.getItem('kira-session');
      if (stored) {
        const session = JSON.parse(stored);
        if (session.token && session.refreshToken) {
          setToken(session.token);
          setRefreshToken(session.refreshToken);
          setEmail(session.email ?? '');
          setView('list');
        }
      }
    } catch {}
  }, []);

  // Load calls when authenticated
  useEffect(() => {
    if (token && view === 'list') {
      loadCalls();
    }
  }, [token, view]);

  const loadCalls = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet('/calls', token);
      setCalls(data.calls ?? []);
    } catch (err: any) {
      // Try refreshing token
      if (refreshToken) {
        const newToken = await cognitoRefresh(refreshToken);
        if (newToken) {
          setToken(newToken);
          localStorage.setItem('kira-session', JSON.stringify({ token: newToken, refreshToken, email }));
          try {
            const data = await apiGet('/calls', newToken);
            setCalls(data.calls ?? []);
          } catch (e2: any) {
            setError(e2.message);
          }
        } else {
          setView('login');
        }
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [token, refreshToken, email]);

  const openCall = async (callId: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiGet(`/calls/${callId}`, token);
      setSelectedCall(data as CallFull);
      setView('detail');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (loginEmail: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await cognitoSignIn(loginEmail, password);
      if (result) {
        setToken(result.idToken);
        setRefreshToken(result.refreshToken);
        setEmail(loginEmail);
        localStorage.setItem('kira-session', JSON.stringify({ token: result.idToken, refreshToken: result.refreshToken, email: loginEmail }));
        setView('list');
      } else {
        setError('Sign in failed. Check your credentials.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setRefreshToken(null);
    setCalls([]);
    setSelectedCall(null);
    localStorage.removeItem('kira-session');
    setView('login');
  };

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, transition: 'background 0.2s, color 0.2s' }}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${t.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: t.accent, fontSize: '20px', fontWeight: 'bold' }}>✦</span>
          <h1 style={{ fontSize: '18px', fontWeight: 600 }}>K.I.R.A.</h1>
          <span style={{ fontSize: '12px', color: t.textDim }}>Knowledge, Insights & Response Assistant</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {view === 'detail' && (
            <button onClick={() => { setSelectedCall(null); setView('list'); }} style={{ fontSize: '13px', color: t.accent, background: 'none', border: 'none', cursor: 'pointer' }}>
              ← All Calls
            </button>
          )}
          {token && (
            <>
              <span style={{ fontSize: '11px', color: t.textDim }}>{email}</span>
              <button onClick={handleLogout} style={{ fontSize: '11px', color: t.textDim, background: 'none', border: `1px solid ${t.border}`, borderRadius: '4px', padding: '3px 8px', cursor: 'pointer' }}>
                Logout
              </button>
            </>
          )}
          <button
            onClick={toggleTheme}
            style={{ fontSize: '16px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}
            title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
          >
            {themeMode === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {error && (
          <div style={{ marginBottom: '16px', padding: '12px', background: `${t.danger}15`, border: `1px solid ${t.danger}40`, borderRadius: '8px', fontSize: '13px', color: t.danger }}>
            {error}
          </div>
        )}

        {view === 'login' && <LoginForm onLogin={handleLogin} loading={loading} theme={t} />}
        {view === 'list' && <CallList calls={calls} loading={loading} onOpen={openCall} onRefresh={loadCalls} theme={t} />}
        {view === 'detail' && selectedCall && <CallDetail call={selectedCall} theme={t} />}
      </main>
    </div>
  );
};

// === Login Form ===
const LoginForm: React.FC<{ onLogin: (email: string, password: string) => void; loading: boolean; theme: typeof themes.dark }> = ({ onLogin, loading, theme: t }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div style={{ maxWidth: '320px', margin: '80px auto', textAlign: 'center' }}>
      <div style={{ marginBottom: '32px' }}>
        <span style={{ color: t.accent, fontSize: '36px', fontWeight: 'bold' }}>✦</span>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginTop: '12px' }}>Sign In to K.I.R.A.</h2>
        <p style={{ fontSize: '12px', color: t.textDim, marginTop: '8px' }}>View your call history and analytics</p>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={{ padding: '10px 14px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: '8px', color: t.text, fontSize: '13px', outline: 'none' }}
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          required
          style={{ padding: '10px 14px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: '8px', color: t.text, fontSize: '13px', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '12px', background: t.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
};

// === Call List ===
const CallList: React.FC<{ calls: CallMeta[]; loading: boolean; onOpen: (id: string) => void; onRefresh: () => void; theme: typeof themes.dark }> = ({ calls, loading, onOpen, onRefresh, theme: t }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Your Calls</h2>
      <button onClick={onRefresh} style={{ fontSize: '12px', color: t.textDim, background: 'none', border: `1px solid ${t.border}`, borderRadius: '6px', padding: '6px 12px', cursor: 'pointer' }}>
        {loading ? 'Loading...' : 'Refresh'}
      </button>
    </div>

    {calls.length === 0 && !loading && (
      <div style={{ textAlign: 'center', padding: '60px 0', color: t.textDim }}>
        <p style={{ fontSize: '32px', marginBottom: '12px' }}>📂</p>
        <p style={{ fontSize: '14px' }}>No calls synced yet</p>
        <p style={{ fontSize: '12px', marginTop: '8px' }}>Start a capture in the K.I.R.A. app and your calls will appear here</p>
      </div>
    )}

    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {calls.map((call) => (
        <div
          key={call.callId}
          onClick={() => onOpen(call.callId)}
          style={{ padding: '20px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: '12px', cursor: 'pointer', transition: 'border-color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = t.accent)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 500, marginBottom: '6px' }}>{call.callName}</h3>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: t.textDim }}>
                <span>{new Date(call.callDate).toLocaleDateString()}</span>
                <span>{Math.round(call.durationMs / 60000)} min</span>
                <span style={{ textTransform: 'capitalize' }}>{call.callType}</span>
                {call.participants && <span>{call.participants}</span>}
                <span>{call.segmentCount} segments</span>
              </div>
            </div>
            {call.score > 0 && (
              <div style={{ fontSize: '28px', fontWeight: 700, color: call.score >= 80 ? t.accent : call.score >= 60 ? t.warning : t.danger, minWidth: '40px', textAlign: 'right' }}>
                {call.score}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// === Call Detail ===
const CallDetail: React.FC<{ call: CallFull; theme: typeof themes.dark }> = ({ call, theme: t }) => {
  const finals = call.transcript?.filter(s => !s.isPartial) ?? [];

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>{call.callName}</h2>
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: t.textDim }}>
          <span>{new Date(call.callDate).toLocaleDateString()}</span>
          <span>{Math.round(call.durationMs / 60000)} min</span>
          <span style={{ textTransform: 'capitalize' }}>{call.callType}</span>
          {call.participants && <span>{call.participants}</span>}
        </div>
      </div>

      {/* Talk Ratio */}
      {call.talkRatio && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: t.textDim, marginBottom: '10px' }}>Talk Ratio</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: t.speakerYou, width: '40px' }}>You {call.talkRatio.you}%</span>
            <div style={{ flex: 1, height: '8px', background: t.barBg, borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${call.talkRatio.you}%`, background: t.speakerYou, borderRadius: '4px 0 0 4px' }} />
              <div style={{ width: `${call.talkRatio.other}%`, background: t.speakerOther, borderRadius: '0 4px 4px 0' }} />
            </div>
            <span style={{ fontSize: '12px', color: t.speakerOther, width: '50px', textAlign: 'right' }}>Other {call.talkRatio.other}%</span>
          </div>
        </div>
      )}

      {/* Context */}
      {call.context && (
        <div style={{ marginBottom: '24px', background: t.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: t.textDim, marginBottom: '8px' }}>Meeting Context</h4>
          <p style={{ fontSize: '13px', color: t.textMuted, lineHeight: '1.6' }}>{call.context}</p>
        </div>
      )}

      {/* Transcript */}
      {finals.length > 0 && (
        <div style={{ background: t.surface, padding: '20px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: t.textDim, marginBottom: '16px' }}>
            Transcript ({finals.length} segments)
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '500px', overflowY: 'auto' }}>
            {finals.map((seg, i) => (
              <div key={i}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: seg.speaker === 'you' ? t.speakerYou : t.speakerOther }}>
                  {seg.speakerName}
                </span>
                <p style={{ fontSize: '13px', color: t.textMuted, lineHeight: '1.6', marginTop: '2px' }}>{seg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {finals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: t.textDim }}>
          <p style={{ fontSize: '13px' }}>No transcript data available for this call</p>
        </div>
      )}
    </div>
  );
};

export default App;
