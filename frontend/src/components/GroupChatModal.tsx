import { useState, type FormEvent } from 'react';
import { chatsApi, getErrorMessage } from '../lib/api';
import type { Chat, User } from '../types/api';
import { Avatar } from './Avatar';
import { CloseIcon } from './Icons';
import { Modal } from './Modal';
import { StatusNotice } from './StatusNotice';
import { UserSearch } from './UserSearch';

interface GroupChatModalProps {
  currentUserId: string;
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}

export function GroupChatModal({ currentUserId, onClose, onCreated }: GroupChatModalProps) {
  const [title, setTitle] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function selectUser(user: User) {
    setSelectedUsers((current) => current.some((item) => item.id === user.id) ? current : [...current, user]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || normalizedTitle.length > 100) {
      setError('Название группы должно содержать от 1 до 100 символов.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      onCreated(await chatsApi.createGroup(normalizedTitle, selectedUsers.map((user) => user.id)));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось создать группу'));
      setSubmitting(false);
    }
  }

  return (
    <Modal eyebrow="Новый разговор" title="Групповой чат" onClose={onClose} wide>
      <form className="group-form" onSubmit={(event) => void handleSubmit(event)}>
        {error && <StatusNotice>{error}</StatusNotice>}
        <label className="field">
          <span>Название группы</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            placeholder="Например, Команда проекта"
            autoFocus
            data-testid="group-title"
          />
          <small>{title.length}/100</small>
        </label>

        <div className="form-section-heading">
          <div>
            <strong>Участники</strong>
            <span>Вы станете владельцем группы</span>
          </div>
          <span className="count-badge">{selectedUsers.length}</span>
        </div>

        {selectedUsers.length > 0 && (
          <div className="selected-users" data-testid="selected-group-users">
            {selectedUsers.map((user) => (
              <span className="selected-user" key={user.id}>
                <Avatar username={user.username} size="small" />
                {user.username}
                <button type="button" aria-label={`Убрать ${user.username}`} onClick={() => setSelectedUsers((current) => current.filter((item) => item.id !== user.id))}>
                  <CloseIcon />
                </button>
              </span>
            ))}
          </div>
        )}

        <UserSearch
          excludeIds={[currentUserId]}
          selectedIds={selectedUsers.map((user) => user.id)}
          actionLabel="Добавить"
          onSelect={selectUser}
        />

        <div className="modal-actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Отмена</button>
          <button className="button button--primary" type="submit" disabled={submitting} data-testid="create-group-submit">
            {submitting ? 'Создаём…' : 'Создать группу'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
