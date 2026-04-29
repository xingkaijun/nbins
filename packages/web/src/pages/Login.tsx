import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, login, changePasswordPublic } from '../api';
import { useAuth } from '../auth-context';
import { PG_LOGO_B64 } from '../utils/pg-logo-b64';

type PageMode = 'login' | 'change-password';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '8px',
  border: '1px solid var(--nb-border)',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--nb-text)',
  backgroundColor: '#f8fafc',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.2s ease'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 800,
  color: 'var(--nb-text-muted)',
  marginBottom: '6px'
};

export function Login() {
  const [mode, setMode] = useState<PageMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login: storeSession, session } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const redirectTarget = searchParams.get('redirect') || '/';
  const loginNotice =
    searchParams.get('reason') === 'session-expired'
      ? 'Your session expired. Please sign in again.'
      : '';

  React.useEffect(() => {
    if (session) {
      navigate(redirectTarget, { replace: true });
    }
  }, [navigate, redirectTarget, session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const authSession = await login(username, password);
      storeSession(authSession);
      navigate(redirectTarget, { replace: true });
    } catch (loginError) {
      if (loginError instanceof ApiError) {
        setError(loginError.message);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }

    if (!oldPassword) {
      setError('Current password is required.');
      return;
    }

    if (newPassword.length < 4) {
      setError('New password must be at least 4 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (oldPassword === newPassword) {
      setError('New password must be different from current password.');
      return;
    }

    setIsSubmitting(true);

    try {
      await changePasswordPublic(username, oldPassword, newPassword);
      setSuccess('Password changed successfully! Redirecting to login...');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setMode('login');
        setSuccess('');
        setPassword('');
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to change password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (newMode: PageMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
  };

  const focusHandler = (e: React.FocusEvent<HTMLInputElement>) =>
    e.target.style.borderColor = 'var(--nb-primary)';
  const blurHandler = (e: React.FocusEvent<HTMLInputElement>) =>
    e.target.style.borderColor = 'var(--nb-border)';

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      backgroundColor: '#f8fafc',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--nb-font)',
      backgroundImage: 'radial-gradient(at center top, #e2e8f0 0%, #f8fafc 60%)'
    }}>
      <div style={{
        width: '420px',
        padding: '48px',
        background: '#fff',
        borderRadius: '24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{ 
          width: '64px', 
          height: '64px', 
          marginBottom: '24px', 
          background: '#fff', 
          padding: '8px', 
          borderRadius: '16px', 
          border: '1px solid rgba(148, 163, 184, 0.2)', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)' 
        }}>
          <img src={PG_LOGO_B64} alt="PG Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        
        <h1 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800, color: 'var(--nb-text)', letterSpacing: '-0.02em', textAlign: 'center' }}>
          NEW BUILDING INSPECTION
        </h1>
        <p style={{ margin: '0 0 32px 0', fontSize: '13px', fontWeight: 600, color: 'var(--nb-primary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {mode === 'login' ? 'Secure Authentication' : 'Change Password'}
        </p>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>USERNAME / ID</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your inspector ID"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>PASSWORD</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your security phrase"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
                required
              />
            </div>

            {error ? (
              <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                color: '#b91c1c',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {error}
              </div>
            ) : null}

            {!error && loginNotice ? (
              <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
                backgroundColor: '#fffbeb',
                color: '#92400e',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {loginNotice}
              </div>
            ) : null}
            
            <button 
              type="submit"
              disabled={isSubmitting}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '14px',
                backgroundColor: 'var(--nb-text)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'background-color 0.2s ease',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? 'wait' : 'pointer'
              }}
              onMouseOver={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = 'var(--nb-primary)';
                }
              }}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--nb-text)'}
            >
              {isSubmitting ? 'Authenticating...' : 'Authenticate & Proceed'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('change-password')}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: 'transparent',
                color: 'var(--nb-primary)',
                border: '1px solid var(--nb-border)',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--nb-primary)';
                e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.04)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--nb-border)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Change Password
            </button>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>USERNAME / ID</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your inspector ID"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>CURRENT PASSWORD</label>
              <input 
                type="password" 
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your current password"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>NEW PASSWORD</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter new password (min 4 chars)"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>CONFIRM NEW PASSWORD</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Confirm new password"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
                required
              />
            </div>

            {error ? (
              <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                color: '#b91c1c',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {error}
              </div>
            ) : null}

            {success ? (
              <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #86efac',
                backgroundColor: '#f0fdf4',
                color: '#166534',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {success}
              </div>
            ) : null}

            <button 
              type="submit"
              disabled={isSubmitting || !!success}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '14px',
                backgroundColor: 'var(--nb-text)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'background-color 0.2s ease',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                opacity: (isSubmitting || !!success) ? 0.7 : 1,
                cursor: (isSubmitting || !!success) ? 'wait' : 'pointer'
              }}
              onMouseOver={(e) => {
                if (!isSubmitting && !success) {
                  e.currentTarget.style.backgroundColor = 'var(--nb-primary)';
                }
              }}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--nb-text)'}
            >
              {isSubmitting ? 'Updating...' : 'Update Password'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: 'transparent',
                color: '#64748b',
                border: '1px solid var(--nb-border)',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#94a3b8';
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.02)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--nb-border)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              ← Back to Login
            </button>
          </form>
        )}

        <p style={{ marginTop: '32px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textAlign: 'center' }}>
          Authorized classification society personnel only.<br/>
          All system interactions are monitored.
        </p>
      </div>
    </div>
  );
}
