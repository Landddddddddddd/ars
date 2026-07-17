import { useState } from 'react';
import { useAuth } from '../auth.js';
import { ApiError } from '../api.js';

type Mode = 'login' | 'signup';

export function AuthGate() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') await signup(email.trim(), password);
      else await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '请求失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header>
        <h1>
          ARS <span className="sub">Academic-Research-Skills</span>
        </h1>
        <p className="tagline">多 Agent 驱动的学术研究流程 · 从课题到成稿</p>
      </header>

      <div className="authgate">
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            登录
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setError('');
            }}
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            邮箱
            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signup' ? '至少 8 位' : '密码'}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '请稍候…' : mode === 'signup' ? '注册并开始' : '登录'}
          </button>
        </form>

        <p className="auth-hint">
          {mode === 'signup'
            ? '注册即赠送体验积分，可直接开始一次研究。'
            : '还没有账号？点上方「注册」，注册即送体验积分。'}
        </p>
      </div>
    </div>
  );
}
