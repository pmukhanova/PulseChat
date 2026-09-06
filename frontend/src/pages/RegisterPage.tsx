import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { AuthShell } from '../components/AuthShell';
import { StatusNotice } from '../components/StatusNotice';
import { getErrorMessage } from '../lib/api';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const normalizedUsername = username.trim();

    if (normalizedUsername.length < 3 || normalizedUsername.length > 32) {
      setError('Имя пользователя должно содержать от 3 до 32 символов.');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен содержать не менее 8 символов.');
      return;
    }
    if (password !== confirmation) {
      setError('Пароли не совпадают.');
      return;
    }

    setSubmitting(true);
    try {
      await register(normalizedUsername, password);
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось создать аккаунт'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Создать аккаунт" subtitle="Придумайте имя и начните общение за пару шагов.">
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
            placeholder="От 3 до 32 символов"
            data-testid="register-username"
          />
          <small>{username.trim().length}/32</small>
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            placeholder="Не менее 8 символов"
            data-testid="register-password"
          />
        </label>

        <label className="field">
          <span>Повторите пароль</span>
          <input
            name="passwordConfirmation"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            placeholder="Ещё раз для проверки"
            data-testid="register-confirmation"
          />
        </label>

        <button className="button button--primary button--large" type="submit" disabled={submitting} data-testid="register-submit">
          {submitting ? 'Создаём…' : 'Создать аккаунт'}
        </button>

        <p className="auth-switch">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </form>
    </AuthShell>
  );
}
