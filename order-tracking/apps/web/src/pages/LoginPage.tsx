import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { FormError } from '../components/ui';

/** Лише шлях цього ж сайту — інакше на головну. */
const safeReturnTo = (raw: string | null) =>
  raw?.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : '/contracts';

/**
 * Вхід обліковкою Keycloak (як у litopys): власна форма застосунку (password grant) або,
 * запасним шляхом, сторінка Keycloak.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.login(username, password);
      // повне перезавантаження: увесь кеш запитів — уже від імені цього користувача
      window.location.replace(returnTo);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form className="panel panel-b login" onSubmit={submit}>
      <h1>Вхід</h1>
      <p className="muted small">Обліковий запис Keycloak.</p>
      <FormError error={error} />
      <label className="f">Ім’я користувача
        <input autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label className="f">Пароль
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Вхід…' : 'Увійти'}</button>
      <a className="small" href={api.ssoLoginUrl(returnTo)}>Увійти через сторінку Keycloak</a>
    </form>
  );
}
