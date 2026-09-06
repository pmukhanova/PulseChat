import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const password = 'Demo12345';
const canonicalVideoPath = path.resolve(
  import.meta.dirname,
  '../../artifacts/demo/pulse-chat-presentation-demo.webm',
);
const screenshotsDir = path.resolve(import.meta.dirname, '../../artifacts/screenshots');

async function pause(page: Page, milliseconds = 3_500): Promise<void> {
  await page.waitForTimeout(milliseconds);
}

async function typeForViewer(locator: Locator, value: string, delay = 55): Promise<void> {
  await locator.click();
  await locator.fill('');
  await locator.pressSequentially(value, { delay });
}

async function login(page: Page, username: string, slowly = false): Promise<void> {
  await page.goto('/login');
  if (slowly) await pause(page, 2_500);
  if (slowly) {
    await typeForViewer(page.getByTestId('login-username'), username, 95);
  } else {
    await page.getByTestId('login-username').fill(username);
  }
  await page.getByTestId('login-password').fill(password);
  if (slowly) await pause(page, 1_500);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('socket-status')).toContainText('В сети');
}

async function register(page: Page, username: string): Promise<void> {
  await page.goto('/register');
  await pause(page, 2_500);
  await typeForViewer(page.getByTestId('register-username'), username, 85);
  await page.getByTestId('register-password').fill(password);
  await page.getByTestId('register-confirmation').fill(password);
  await pause(page, 1_500);
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('chat-list')).toBeVisible();
}

test('записывает актуальную демонстрацию personal rooms', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);

  const targetUsername = 'demo_user';
  const directMessage = 'Новое сообщение для демонстрации PulseChat';
  const initialGroupTitle = 'Команда проекта';
  const groupTitle = 'Проектная группа';

  await fs.mkdir(screenshotsDir, { recursive: true });

  const viewerContext = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: testInfo.outputPath('presentation-video'),
      size: { width: 1440, height: 900 },
    },
  });
  const viewer = await viewerContext.newPage();
  const video = viewer.video();
  if (!video) throw new Error('Playwright не создал video для основного контекста');

  const actorContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const actor = await actorContext.newPage();
  let completed = false;

  try {
    await register(viewer, targetUsername);
    await pause(viewer, 3_000);

    await viewer.getByTestId('new-direct-chat').click();
    await typeForViewer(viewer.getByTestId('user-search-input'), 'maria', 80);
    await viewer.getByTestId('user-result-maria').click();
    await expect(viewer.locator('.conversation-header h1')).toContainText('maria');
    await pause(viewer, 4_000);

    await login(actor, 'andrey');
    await actor.getByTestId('new-direct-chat').click();
    await actor.getByTestId('user-search-input').fill(targetUsername);
    await actor.getByTestId(`user-result-${targetUsername}`).click();
    await expect(actor.locator('.conversation-header h1')).toContainText(targetUsername);

    const directItem = viewer.locator(
      `[data-testid="chat-list-item"][data-chat-title="andrey"]`,
    );
    await expect(directItem).toBeVisible();
    await expect(viewer.locator('.conversation-header h1')).toContainText('maria');
    await pause(viewer, 10_000);
    await viewer.screenshot({ path: path.join(screenshotsDir, 'realtime-new-direct.png') });

    await actor.getByTestId('message-composer').fill(directMessage);
    await actor.getByTestId('send-message').click();
    await expect(directItem).toContainText(directMessage);
    await expect(directItem.getByTestId('unread-badge')).toHaveText('1');
    await expect(viewer.locator('[data-testid="chat-list-item"]').first()).toHaveAttribute(
      'data-chat-title',
      'andrey',
    );
    await pause(viewer, 10_000);
    await viewer.screenshot({ path: path.join(screenshotsDir, 'realtime-unread.png') });

    await directItem.click();
    await expect(viewer.getByTestId('message-list').getByText(directMessage)).toBeVisible();
    await expect(directItem.getByTestId('unread-badge')).toHaveCount(0);
    await pause(viewer, 5_000);

    await actor.getByTestId('new-group-chat').click();
    await actor.getByTestId('group-title').fill(initialGroupTitle);
    await actor.getByTestId('user-search-input').fill(targetUsername);
    await actor.getByTestId(`user-result-${targetUsername}`).click();
    await actor.getByTestId('create-group-submit').click();
    await expect(actor.locator('.conversation-header h1')).toContainText(initialGroupTitle);
    const createdGroupId = await actor.locator('.chat-list-item--active').getAttribute('data-chat-id');
    if (!createdGroupId) throw new Error('Созданная группа не содержит data-chat-id');

    const viewerGroup = viewer.locator(
      `[data-testid="chat-list-item"][data-chat-title="${initialGroupTitle}"]`,
    );
    await expect(viewerGroup).toBeVisible();
    await viewerGroup.click();
    await expect(viewer.getByTestId('current-chat-role')).toHaveAttribute('data-role', 'MEMBER');
    await expect(viewer.getByTestId('toggle-add-member')).toHaveCount(0);
    await pause(viewer, 9_000);

    await actor.getByRole('button', { name: `Назначить администратором ${targetUsername}` }).click();
    await expect(viewer.getByTestId('current-chat-role')).toHaveAttribute('data-role', 'ADMIN');
    await expect(viewer.getByTestId('toggle-add-member')).toBeVisible();
    await pause(viewer, 9_000);
    await viewer.screenshot({ path: path.join(screenshotsDir, 'realtime-role-change.png') });

    await actor.getByRole('button', { name: 'Переименовать группу' }).click();
    await actor.locator('.inline-edit input').fill(groupTitle);
    await actor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(actor.locator('.conversation-header h1')).toContainText(groupTitle);
    await expect(viewer.locator('.conversation-header h1')).toContainText(groupTitle);
    const renamedViewerGroup = viewer.locator(
      `[data-testid="chat-list-item"][data-chat-id="${createdGroupId}"]`,
    );
    await expect(renamedViewerGroup).toBeVisible();
    await expect(renamedViewerGroup).toHaveAttribute('data-chat-title', groupTitle);
    await pause(viewer, 11_000);

    // demo_user is ADMIN and adds olga; OWNER receives the details invalidation without reload.
    await viewer.getByTestId('toggle-add-member').click();
    await viewer.getByTestId('user-search-input').fill('olga');
    await viewer.getByTestId('user-result-olga').click();
    await expect(viewer.getByTestId('member-olga')).toBeVisible();
    await expect(actor.getByTestId('member-olga')).toBeVisible();
    await pause(viewer, 11_000);

    await actor.locator('[data-testid="chat-list-item"][data-chat-title="Команда Pulse"]').click();
    await expect(actor.locator('.conversation-header h1')).toContainText('Команда Pulse');
    await actor.getByTestId('toggle-add-member').click();
    await actor.getByTestId('user-search-input').fill(targetUsername);
    await actor.getByTestId(`user-result-${targetUsername}`).click();

    const seedGroup = viewer.locator(
      '[data-testid="chat-list-item"][data-chat-title="Команда Pulse"]',
    );
    await expect(seedGroup).toBeVisible();
    await seedGroup.click();
    await expect(viewer.locator('.conversation-header h1')).toContainText('Команда Pulse');
    await pause(viewer, 5_000);

    const countBefore = await viewer.locator('.message-row').count();
    await viewer.getByTestId('load-older-messages').click();
    await expect.poll(() => viewer.locator('.message-row').count()).toBeGreaterThan(countBefore);
    await pause(viewer, 5_000);
    await typeForViewer(viewer.getByTestId('message-search-input'), 'архитектура', 65);
    await viewer.getByTestId('message-search-submit').click();
    await expect(viewer.getByTestId('message-search-results')).toContainText('архитектура');
    await pause(viewer, 10_000);

    // OWNER removes demo_user. The active group closes, disappears from sidebar,
    // and direct REST access is rejected without any page.reload().
    await renamedViewerGroup.click();
    await expect(viewer.locator('.conversation-header h1')).toContainText(groupTitle);
    await pause(viewer, 3_000);
    const revokedChatId = await renamedViewerGroup.getAttribute('data-chat-id');
    if (!revokedChatId) throw new Error('Проектная группа не содержит data-chat-id');
    const viewerAccessToken = await viewer.evaluate(() => {
      const rawSession = window.localStorage.getItem('pulse-chat-session');
      if (!rawSession) throw new Error('Сессия demo_user не найдена');
      return (JSON.parse(rawSession) as { accessToken: string }).accessToken;
    });

    await actor.locator(`[data-testid="chat-list-item"][data-chat-id="${createdGroupId}"]`).click();
    actor.once('dialog', (dialog) => void dialog.accept());
    await actor.getByRole('button', { name: `Удалить ${targetUsername}` }).click();
    await expect(actor.getByTestId(`member-${targetUsername}`)).toHaveCount(0);
    await expect(viewer.locator('.global-notice')).toContainText('Доступ закрыт');
    await expect(renamedViewerGroup).toHaveCount(0);
    await expect(viewer.locator('.conversation-header h1')).not.toContainText(groupTitle);
    const revokedResponse = await viewer.request.get(`/api/chats/${revokedChatId}`, {
      headers: { Authorization: `Bearer ${viewerAccessToken}` },
    });
    expect(revokedResponse.status()).toBe(403);
    await pause(viewer, 16_000);

    completed = true;
  } finally {
    await actorContext.close();
    await viewerContext.close();
    if (completed) {
      await video.saveAs(canonicalVideoPath);
      await testInfo.attach('pulse-chat-presentation-demo', {
        path: canonicalVideoPath,
        contentType: 'video/webm',
      });
    }
  }
});
