import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { FormError } from '../components/ui';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

    e.preventDefault();
  };

  return (
      </label>
      <label className="f">Пароль
      </label>
    </form>
  );
}
