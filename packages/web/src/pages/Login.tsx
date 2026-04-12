import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, login } from '../api';
import { useAuth } from '../auth-context';
import { PG_LOGO_B64 } from '../utils/pg-logo-b64';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
          Secure Authentication
        </p>

        <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--nb-text-muted)', marginBottom: '6px' }}>USERNAME / ID</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) {
                  setError('');
                }
              }}
              placeholder="Enter your inspector ID"
              style={{
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
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--nb-primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--nb-border)'}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--nb-text-muted)', marginBottom: '6px' }}>PASSWORD</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) {
                  setError('');
                }
              }}
              placeholder="Enter your security phrase"
              style={{
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
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--nb-primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--nb-border)'}
              required
            />
          </div>

          {error ? (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                color: '#b91c1c',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              {error}
            </div>
          ) : null}

          {!error && loginNotice ? (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
                backgroundColor: '#fffbeb',
                color: '#92400e',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
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
        </form>

        <p style={{ marginTop: '32px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textAlign: 'center' }}>
          Authorized classification society personnel only.<br/>
          All system interactions are monitored.
        </p>
      </div>
    </div>
  );
}
