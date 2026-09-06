import { useEffect, useState, type FormEvent } from 'react';
import { chatsApi, getErrorMessage } from '../lib/api';
import type { Chat, ChatMember, ChatRole, User } from '../types/api';
import { Avatar } from './Avatar';
import { CloseIcon, EditIcon, ShieldIcon, TrashIcon, UserPlusIcon, UsersIcon } from './Icons';
import { StatusNotice } from './StatusNotice';
import { UserSearch } from './UserSearch';

const roleLabels: Record<ChatRole, string> = {
  OWNER: 'Владелец',
  ADMIN: 'Администратор',
  MEMBER: 'Участник',
};

interface MembersPanelProps {
  chat: Chat;
  currentUser: User;
  open: boolean;
  onClose: () => void;
  onChatUpdated: (chat: Chat) => void;
}

export function MembersPanel({ chat, currentUser, open, onClose, onChatUpdated }: MembersPanelProps) {
  const [members, setMembers] = useState<ChatMember[]>(chat.members);
  const [adding, setAdding] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(chat.title ?? '');
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const canManageMembers = chat.currentUserRole === 'OWNER' || chat.currentUserRole === 'ADMIN';
  const canManageRoles = chat.currentUserRole === 'OWNER';

  useEffect(() => {
    setMembers(chat.members);
    setTitle(chat.title ?? '');
    setError('');
    setAdding(false);
    setEditingTitle(false);
  }, [chat.id, chat.members, chat.title]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void chatsApi.members(chat.id)
      .then((loadedMembers) => {
        if (active) setMembers(loadedMembers);
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError, 'Не удалось обновить состав группы'));
      });
    return () => {
      active = false;
    };
  }, [chat.id, open]);

  async function refreshChat() {
    const updated = await chatsApi.get(chat.id);
    setMembers(updated.members);
    onChatUpdated(updated);
  }

  async function handleAdd(user: User) {
    setBusyKey(`add:${user.id}`);
    setError('');
    try {
      await chatsApi.addMember(chat.id, user.id);
      await refreshChat();
      setAdding(false);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось добавить участника'));
    } finally {
      setBusyKey('');
    }
  }

  function canRemove(member: ChatMember): boolean {
    if (member.role === 'OWNER' || member.user.id === currentUser.id) return false;
    if (chat.currentUserRole === 'OWNER') return true;
    return chat.currentUserRole === 'ADMIN' && member.role === 'MEMBER';
  }

  async function handleRemove(member: ChatMember) {
    if (!window.confirm(`Удалить ${member.user.username} из группы?`)) return;
    setBusyKey(`remove:${member.user.id}`);
    setError('');
    try {
      await chatsApi.removeMember(chat.id, member.user.id);
      await refreshChat();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось удалить участника'));
    } finally {
      setBusyKey('');
    }
  }

  async function handleRoleChange(member: ChatMember) {
    const nextRole = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    setBusyKey(`role:${member.user.id}`);
    setError('');
    try {
      await chatsApi.changeRole(chat.id, member.user.id, nextRole);
      await refreshChat();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось изменить роль'));
    } finally {
      setBusyKey('');
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized || normalized.length > 100) {
      setError('Название должно содержать от 1 до 100 символов.');
      return;
    }

    setBusyKey('rename');
    setError('');
    try {
      await chatsApi.rename(chat.id, normalized);
      await refreshChat();
      setEditingTitle(false);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось переименовать группу'));
    } finally {
      setBusyKey('');
    }
  }

  return (
    <aside className={`members-panel ${open ? 'members-panel--open' : ''}`} aria-label="Участники группы">
      <header className="members-panel__header">
        <div>
          <p className="eyebrow">Группа</p>
          <h2>Участники</h2>
        </div>
        <button className="icon-button members-panel__close" type="button" onClick={onClose} aria-label="Закрыть панель">
          <CloseIcon />
        </button>
      </header>

      <div className="group-summary">
        <span className="group-summary__icon"><UsersIcon /></span>
        <div>
          <strong>{chat.title}</strong>
          <span>{members.length} {members.length === 1 ? 'участник' : 'участников'}</span>
        </div>
        {canManageMembers && !editingTitle && (
          <button className="icon-button icon-button--small" type="button" onClick={() => setEditingTitle(true)} aria-label="Переименовать группу">
            <EditIcon />
          </button>
        )}
      </div>

      {editingTitle && (
        <form className="inline-edit" onSubmit={(event) => void handleRename(event)}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} autoFocus />
          <button className="button button--primary button--small" type="submit" disabled={busyKey === 'rename'}>Сохранить</button>
          <button className="button button--ghost button--small" type="button" onClick={() => setEditingTitle(false)}>Отмена</button>
        </form>
      )}

      {error && <StatusNotice>{error}</StatusNotice>}

      <div className="permission-note" data-testid="current-chat-role" data-role={chat.currentUserRole}>
        <ShieldIcon />
        <span>Ваша роль: <strong>{roleLabels[chat.currentUserRole]}</strong></span>
      </div>

      {canManageMembers && (
        <div className="members-add">
          <button className="button button--soft button--full" type="button" onClick={() => setAdding((value) => !value)} data-testid="toggle-add-member">
            {adding ? <CloseIcon /> : <UserPlusIcon />}
            {adding ? 'Закрыть поиск' : 'Добавить участника'}
          </button>
          {adding && busyKey === '' && (
            <UserSearch excludeIds={members.map((member) => member.user.id)} actionLabel="Добавить" onSelect={(user) => void handleAdd(user)} />
          )}
          {busyKey.startsWith('add:') && <p className="panel-progress">Добавляем участника…</p>}
        </div>
      )}

      <div className="members-list" data-testid="members-list">
        <div className="members-list__heading"><span>Состав группы</span><span>{members.length}</span></div>
        {members.map((member) => (
          <article className="member-row" key={member.user.id} data-testid={`member-${member.user.username}`}>
            <Avatar username={member.user.username} size="small" />
            <div className="member-row__identity">
              <strong>{member.user.username}{member.user.id === currentUser.id ? ' · вы' : ''}</strong>
              <span className={`role-badge role-badge--${member.role.toLowerCase()}`}>{roleLabels[member.role]}</span>
            </div>
            <div className="member-row__actions">
              {canManageRoles && member.role !== 'OWNER' && member.user.id !== currentUser.id && (
                <button
                  className="icon-button icon-button--small"
                  type="button"
                  onClick={() => void handleRoleChange(member)}
                  disabled={busyKey === `role:${member.user.id}`}
                  aria-label={member.role === 'ADMIN' ? `Снять администратора ${member.user.username}` : `Назначить администратором ${member.user.username}`}
                  title={member.role === 'ADMIN' ? 'Снять роль администратора' : 'Назначить администратором'}
                >
                  <ShieldIcon />
                </button>
              )}
              {canRemove(member) && (
                <button
                  className="icon-button icon-button--small icon-button--danger"
                  type="button"
                  onClick={() => void handleRemove(member)}
                  disabled={busyKey === `remove:${member.user.id}`}
                  aria-label={`Удалить ${member.user.username}`}
                  title="Удалить из группы"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
