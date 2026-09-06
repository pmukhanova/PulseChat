import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { StatusNotice } from '../components/StatusNotice';
import { useAuth } from '../auth/useAuth';
import { getErrorMessage } from '../lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Введите имя пользователя и пароль.');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось войти'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Войти в аккаунт" subtitle="Продолжите разговор с того места, где остановились.">
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {error && <StatusNotice>{error}</StatusNotice>}

        <label className="field">
          <span>Имя пользователя</span>
          <input
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={3}
            maxLength={32}
            autoComplete="username"
            autoFocus
            placeholder="Например, andrey"
            data-testid="login-username"
          />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={72}
            autoComplete="current-password"
            placeholder="Не менее 8 символов"
            data-testid="login-password"
          />
        </label>

        <button className="button button--primary button--large" type="submit" disabled={submitting} data-testid="login-submit">
          {submitting ? 'Входим…' : 'Войти'}
        </button>

        <p className="auth-switch">
          Впервые в PulseChat? <Link to="/register">Создать аккаунт</Link>
        </p>
      </form>
    </AuthShell>
  );
}
