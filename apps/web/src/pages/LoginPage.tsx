import { Link, useSearchParams } from 'react-router';
import { api } from '../api';

/** Лише шлях цього ж сайту — інакше на головну. */
const safeReturnTo = (raw: string | null) =>
  raw?.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : '/contracts';

/**
 * Вхід обліковкою Keycloak — лише через його сторінку (Code + PKCE). Власної форми з паролем немає:
 * пароль вводиться тільки на сторінці Keycloak.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));

  return (
    <div className="panel panel-b login">
      <h1>Вхід</h1>
      <p className="muted small">Обліковий запис Keycloak — вхід на його сторінці.</p>
      <a className="btn primary" href={api.ssoLoginUrl(returnTo)}>Увійти</a>
      <Link className="small" to={returnTo}>← Переглядати без входу</Link>
    </div>
  );
}
