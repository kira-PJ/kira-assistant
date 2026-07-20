import React, { useState } from 'react';

type AuthMode = 'login' | 'signup' | 'confirm';

interface LoginScreenProps {
  onAuthenticated: () => void;
}

/**
 * LoginScreen — Sign in / Sign up flow for K.I.R.A.
 * Handles email+password auth via Cognito IPC.
 */
const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await window.ghostAPI?.authSignIn?.(email, password);
      if (result?.success) {
        onAuthenticated();
      } else {
        setError(result?.error ?? 'Sign in failed');
      }
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await window.ghostAPI?.authSignUp?.(email, password);
      if (result?.success) {
        if (result.needsConfirmation) {
          setPendingEmail(email);
          setMode('confirm');
        } else {
          // Auto-confirmed, sign in
          const loginResult = await window.ghostAPI?.authSignIn?.(email, password);
          if (loginResult?.success) onAuthenticated();
        }
      } else {
        setError(result?.error ?? 'Sign up failed');
      }
    } catch (err: any) {
      setError(err.message ?? 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await window.ghostAPI?.authConfirmSignUp?.(pendingEmail, confirmCode);
      if (result?.success) {
        // Now sign in
        const loginResult = await window.ghostAPI?.authSignIn?.(pendingEmail, password);
        if (loginResult?.success) onAuthenticated();
        else setError('Account confirmed! Please sign in.');
      } else {
        setError(result?.error ?? 'Confirmation failed');
      }
    } catch (err: any) {
      setError(err.message ?? 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-ghost-bg items-center justify-center p-6">
      <div className="w-full max-w-xs">
        {/* Logo */}
        <div className="text-center mb-6">
          <span className="text-ghost-accent text-3xl font-bold">✦</span>
          <h1 className="text-lg font-semibold text-ghost-text mt-2">K.I.R.A.</h1>
          <p className="text-[10px] text-ghost-text-dim mt-1">Knowledge, Insights & Response Assistant</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-3 px-3 py-2 bg-ghost-danger/10 border border-ghost-danger/30 rounded text-xs text-ghost-danger">
            {error}
          </div>
        )}

        {/* Login form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-[10px] text-ghost-text-dim block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50 outline-none focus:border-ghost-accent"
              />
            </div>
            <div>
              <label className="text-[10px] text-ghost-text-dim block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2 bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50 outline-none focus:border-ghost-accent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-ghost-accent text-ghost-bg text-xs font-semibold rounded hover:bg-ghost-accent-dim disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <p className="text-center text-[10px] text-ghost-text-dim">
              No account?{' '}
              <button type="button" onClick={() => { setMode('signup'); setError(null); }} className="text-ghost-accent hover:underline">
                Sign up
              </button>
            </p>
          </form>
        )}

        {/* Signup form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3">
            <div>
              <label className="text-[10px] text-ghost-text-dim block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50 outline-none focus:border-ghost-accent"
              />
            </div>
            <div>
              <label className="text-[10px] text-ghost-text-dim block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars, upper+lower+digit"
                required
                minLength={8}
                className="w-full px-3 py-2 bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50 outline-none focus:border-ghost-accent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-ghost-accent text-ghost-bg text-xs font-semibold rounded hover:bg-ghost-accent-dim disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
            <p className="text-center text-[10px] text-ghost-text-dim">
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(null); }} className="text-ghost-accent hover:underline">
                Sign in
              </button>
            </p>
          </form>
        )}

        {/* Confirmation code form */}
        {mode === 'confirm' && (
          <form onSubmit={handleConfirm} className="space-y-3">
            <p className="text-xs text-ghost-text-dim text-center mb-2">
              We sent a verification code to <span className="text-ghost-text">{pendingEmail}</span>
            </p>
            <div>
              <label className="text-[10px] text-ghost-text-dim block mb-1">Verification Code</label>
              <input
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="123456"
                required
                className="w-full px-3 py-2 bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50 outline-none focus:border-ghost-accent text-center tracking-widest"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-ghost-accent text-ghost-bg text-xs font-semibold rounded hover:bg-ghost-accent-dim disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <p className="text-center text-[10px] text-ghost-text-dim">
              <button type="button" onClick={() => { setMode('login'); setError(null); }} className="text-ghost-accent hover:underline">
                Back to sign in
              </button>
            </p>
          </form>
        )}

        {/* Skip for now */}
        <div className="mt-4 text-center">
          <button
            onClick={onAuthenticated}
            className="text-[10px] text-ghost-text-dim/60 hover:text-ghost-text-dim"
          >
            Skip for now (offline mode)
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
