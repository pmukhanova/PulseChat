import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const demoPassword = 'Demo12345';

async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(demoPassword);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('chat-list')).toBeVisible();
  await expect(page.getByTestId('socket-status')).toContainText('В сети');
}

test('запись ключевых сценариев PulseChat', async ({ browser, page }) => {
  const timestamp = Date.now().toString();
  const marker = timestamp.slice(-6);
  const registeredUsername = `demo_${timestamp}`;
  const directMessage = `Демо real-time ${marker}`;
  const groupTitle = `Команда демо ${marker}`;
  const groupMessage = `Обсуждаем релиз PulseChat ${marker}`;

  // Регистрация создаёт пользователя и сразу открывает защищённый маршрут.
  await page.goto('/register');
  await page.getByTestId('register-username').fill(registeredUsername);
  await page.getByTestId('register-password').fill(demoPassword);
  await page.getByTestId('register-confirmation').fill(demoPassword);
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.current-user')).toContainText(registeredUsername);
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, 'andrey');

  // Повторное создание direct-чата должно открыть существующий диалог.
  await page.getByTestId('new-direct-chat').click();
  await page.getByTestId('user-search-input').fill('maria');
  await page.getByTestId('user-result-maria').click();
  await expect(page.locator('.conversation-header h1')).toContainText('maria');

  const mariaContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.resolve(process.cwd(), '../artifacts/demo'), size: { width: 1440, height: 900 } },
  });
  const mariaPage = await mariaContext.newPage();
  await login(mariaPage, 'maria');
  await mariaPage.locator('[data-testid="chat-list-item"][data-chat-title="andrey"]').click();

  // Сообщение появляется у второго участника без перезагрузки страницы.
  await page.getByTestId('message-composer').fill(directMessage);
  await page.getByTestId('send-message').click();
  await expect(page.getByTestId('message-list').getByText(directMessage)).toBeVisible();
  await expect(mariaPage.getByTestId('message-list').getByText(directMessage)).toBeVisible();

  // Поиск выполняется только внутри открытого диалога.
  await page.getByTestId('message-search-input').fill(directMessage);
  await page.getByTestId('message-search-submit').click();
  await expect(
    page.getByTestId('message-search-results').getByText(directMessage, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Очистить поиск' }).click();

  // Создание группы и выбор нескольких участников через UI.
  await page.getByTestId('new-group-chat').click();
  await page.getByTestId('group-title').fill(groupTitle);
  await page.getByTestId('user-search-input').fill('maria');
  await page.getByTestId('user-result-maria').click();
  await page.getByTestId('user-search-input').fill('ivan');
  await page.getByTestId('user-result-ivan').click();
  await expect(page.getByTestId('selected-group-users')).toContainText('maria');
  await expect(page.getByTestId('selected-group-users')).toContainText('ivan');
  await page.getByTestId('create-group-submit').click();
  await expect(page.locator('.conversation-header h1')).toContainText(groupTitle);

  // OWNER добавляет и удаляет участников, затем назначает ADMIN.
  await expect(page.getByTestId('members-list')).toContainText('maria');
  await page.getByTestId('toggle-add-member').click();
  await page.getByTestId('user-search-input').fill('olga');
  await page.getByTestId('user-result-olga').click();
  await expect(page.getByTestId('member-olga')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Удалить ivan' }).click();
  await expect(page.getByTestId('member-ivan')).toHaveCount(0);

  await page.getByRole('button', { name: 'Назначить администратором maria' }).click();
  await expect(page.getByTestId('member-maria')).toContainText('Администратор');

  await page.getByTestId('message-composer').fill(groupMessage);
  await page.getByTestId('send-message').click();
  await expect(page.getByTestId('message-list').getByText(groupMessage)).toBeVisible();

  // В seed-группе 45 сообщений: загружаем предыдущую страницу именно вверх.
  await page.locator('[data-testid="chat-list-item"][data-chat-title="Команда Pulse"]').click();
  const messagesBeforePagination = await page.locator('.message-row').count();
  await page.getByTestId('load-older-messages').click();
  await expect.poll(() => page.locator('.message-row').count()).toBeGreaterThan(messagesBeforePagination);

  await page.getByTestId('message-search-input').fill('архитектура');
  await page.getByTestId('message-search-submit').click();
  await expect(page.getByTestId('message-search-results')).toContainText('архитектура');

  // MEMBER видит переписку, но не получает элементов администрирования.
  const ivanContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.resolve(process.cwd(), '../artifacts/demo'), size: { width: 1440, height: 900 } },
  });
  const ivanPage = await ivanContext.newPage();
  await login(ivanPage, 'ivan');
  const seedGroupItem = ivanPage.locator('[data-testid="chat-list-item"][data-chat-title="Команда Pulse"]');
  const seedGroupId = await seedGroupItem.getAttribute('data-chat-id');
  if (!seedGroupId) throw new Error('Seed-группа не содержит data-chat-id');
  await seedGroupItem.click();
  await expect(ivanPage.getByTestId('current-chat-role')).toHaveAttribute('data-role', 'MEMBER');
  await expect(ivanPage.getByTestId('current-chat-role')).toContainText('Участник');
  await expect(ivanPage.getByTestId('message-composer')).toBeEnabled();
  await expect(ivanPage.getByTestId('toggle-add-member')).toHaveCount(0);
  await expect(ivanPage.getByRole('button', { name: 'Переименовать группу' })).toHaveCount(0);
  await expect(ivanPage.locator('.member-row__actions button')).toHaveCount(0);

  // UI скрывает управление, а backend независимо подтверждает запрет ответом 403.
  const ivanAccessToken = await ivanPage.evaluate(() => {
    const rawSession = window.localStorage.getItem('pulse-chat-session');
    if (!rawSession) throw new Error('Сессия ivan не найдена');
    return (JSON.parse(rawSession) as { accessToken: string }).accessToken;
  });
  const forbiddenResponse = await ivanPage.request.post(`/api/chats/${seedGroupId}/members`, {
    headers: { Authorization: `Bearer ${ivanAccessToken}` },
    data: { userId: '00000000-0000-4000-8000-000000000999' },
  });
  expect(forbiddenResponse.status()).toBe(403);

  await ivanContext.close();
  await mariaContext.close();
});
