import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage, usersApi } from '../lib/api';
import type { User } from '../types/api';
import { Avatar } from './Avatar';
import { SearchIcon } from './Icons';
import { Spinner } from './Spinner';

interface UserSearchProps {
  excludeIds?: string[];
  selectedIds?: string[];
  actionLabel?: string;
  onSelect: (user: User) => void;
}

export function UserSearch({
  excludeIds = [],
  selectedIds = [],
  actionLabel = 'Выбрать',
  onSelect,
}: UserSearchProps) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const excludedKey = [...excludeIds, ...selectedIds].sort().join('|');
  const excluded = useMemo(() => new Set(excludedKey ? excludedKey.split('|') : []), [excludedKey]);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setUsers([]);
      setLoading(false);
      setError('');
      return;
    }

    let active = true;
    async function runSearch() {
      setLoading(true);
      setError('');
      try {
        const result = await usersApi.search(normalized);
        if (active) setUsers(result.filter((user) => !excluded.has(user.id)));
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError, 'Не удалось найти пользователей'));
      } finally {
        if (active) setLoading(false);
      }
    }
    const timer = window.setTimeout(() => void runSearch(), 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [excluded, query]);

  return (
    <div className="user-search">
      <label className="search-input search-input--large">
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Введите имя пользователя"
          maxLength={32}
          autoComplete="off"
          data-testid="user-search-input"
        />
        {loading && <Spinner label="Поиск пользователей" />}
      </label>

      {error && <p className="field-error">{error}</p>}

      <div className="user-results" data-testid="user-search-results">
        {!loading && query.trim() && users.length === 0 && !error && (
          <div className="compact-empty">Никого не нашли. Проверьте написание имени.</div>
        )}
        {users.map((user) => (
          <button
            className="user-result"
            type="button"
            key={user.id}
            onClick={() => onSelect(user)}
            data-testid={`user-result-${user.username}`}
          >
            <Avatar username={user.username} size="small" />
            <span className="user-result__name">{user.username}</span>
            <span className="user-result__action">{actionLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
