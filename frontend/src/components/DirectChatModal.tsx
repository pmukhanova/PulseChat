import { useState } from 'react';
import { chatsApi, getErrorMessage } from '../lib/api';
import type { Chat, User } from '../types/api';
import { Modal } from './Modal';
import { StatusNotice } from './StatusNotice';
import { UserSearch } from './UserSearch';

interface DirectChatModalProps {
  currentUserId: string;
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}

export function DirectChatModal({ currentUserId, onClose, onCreated }: DirectChatModalProps) {
  const [error, setError] = useState('');
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);

  async function createChat(user: User) {
    setCreatingUserId(user.id);
    setError('');
    try {
      onCreated(await chatsApi.createDirect(user.id));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось открыть диалог'));
      setCreatingUserId(null);
    }
  }

  return (
    <Modal eyebrow="Новый разговор" title="Личный диалог" onClose={onClose}>
      <p className="modal-description">
        Найдите пользователя по имени. Если у вас уже есть диалог, PulseChat просто откроет его.
      </p>
      {error && <StatusNotice>{error}</StatusNotice>}
      {creatingUserId ? (
        <div className="modal-progress">Открываем диалог…</div>
      ) : (
        <UserSearch excludeIds={[currentUserId]} actionLabel="Написать" onSelect={(user) => void createChat(user)} />
      )}
    </Modal>
  );
}
