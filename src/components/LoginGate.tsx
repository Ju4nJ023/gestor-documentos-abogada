import React, { useState, useEffect } from 'react';
import { Briefcase, Lock, ArrowRight, ShieldCheck } from 'lucide-react';

interface LoginGateProps {
  children: React.ReactNode;
}

const SESSION_AUTH_KEY = 'lexvault_authenticated_v1';

export const LoginGate: React.FC<LoginGateProps> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const envPassword = (import.meta.env.VITE_APP_PASSWORD || '').trim();

  useEffect(() => {
    const checkPasswordRequirement = async () => {
      // Si ya inició sesión en este navegador/dispositivo
      if (localStorage.getItem(SESSION_AUTH_KEY) === 'true') {
        setIsUnlocked(true);
        setChecking(false);
        return;
      }

      const customPassword = (localStorage.getItem('lexvault_custom_password') || '').trim();
      if (envPassword || customPassword) {
        setIsUnlocked(false);
        setChecking(false);
        return;
      }

      // Consultar al Robot local por si se configuró contraseña en el .env
      try {
        const res = await fetch('http://localhost:3001/api/status');
        if (res.ok) {
          const data = await res.json();
          if (data.cloud?.hasPassword) {
            setIsUnlocked(false);
            setChecking(false);
            return;
          }
        }
      } catch (_) {}

      // Si no hay contraseña configurada, abrir directamente
      setIsUnlocked(true);
      setChecking(false);
    };

    checkPasswordRequirement();
  }, [envPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanInput = passwordInput.trim();

    const customPassword = (localStorage.getItem('lexvault_custom_password') || '').trim();
    if ((envPassword && cleanInput === envPassword) || (customPassword && cleanInput === customPassword)) {
      localStorage.setItem(SESSION_AUTH_KEY, 'true');
      setIsUnlocked(true);
      return;
    }

    // Verificar contra el Robot local si está disponible
    try {
      const res = await fetch('http://localhost:3001/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: cleanInput })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          localStorage.setItem(SESSION_AUTH_KEY, 'true');
          setIsUnlocked(true);
          return;
        }
      }
    } catch (_) {}

    setError('Contraseña incorrecta. Inténtalo de nuevo.');
  };

  if (checking) {
    return null;
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at top, #1e293b 0%, #0f172a 70%)',
        padding: '20px',
        color: '#f8fafc'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          borderRadius: '18px',
          padding: '32px 28px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            background: 'rgba(37, 99, 235, 0.18)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: '#60a5fa'
          }}
        >
          <Briefcase size={30} />
        </div>

        <h1 style={{ margin: '0 0 6px 0', fontSize: '1.6rem', fontWeight: 700 }}>
          Lex<span style={{ color: '#3b82f6' }}>Vault</span>
        </h1>
        <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: '#94a3b8' }}>
          Archivo Jurídico Privado • Acceso Protegido
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <Lock
              size={18}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}
            />
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder="Introduce tu clave de acceso..."
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px 12px 42px',
                borderRadius: '10px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: '1rem',
                outline: 'none'
              }}
            />
          </div>

          {error && (
            <div
              style={{
                color: '#f87171',
                fontSize: '0.85rem',
                marginBottom: '12px'
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff',
              fontSize: '0.98rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <span>Entrar al Despacho</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            color: '#64748b'
          }}
        >
          <ShieldCheck size={14} />
          <span>Sesión cifrada Híbrida (PC Local + Nube)</span>
        </div>
      </div>
    </div>
  );
};
