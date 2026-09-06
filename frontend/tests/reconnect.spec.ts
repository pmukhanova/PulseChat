import { expect, test, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const password = 'Demo12345';

async function login(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('socket-status')).toContainText('В сети');
}

async function register(page: Page, username: string): Promise<void> {
  await page.goto('/register');
  await page.getByTestId('register-username').fill(username);
  await page.getByTestId('register-password').fill(password);
  await page.getByTestId('register-confirmation').fill(password);
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('chat-list')).toBeVisible();
}

test('refreshes the sidebar preview after Socket.IO reconnect without reload', async ({ browser, page }) => {
  test.setTimeout(60_000);
  const targetUsername = `reconnect_${Date.now()}`;
  const offlineMessage = `Сообщение во время reconnect ${targetUsername}`;
  const targetContext = await browser.newContext({ baseURL });
  const targetPage = await targetContext.newPage();

  try {
    await register(targetPage, targetUsername);

    // Keep another accessible chat selected: refreshChats(true) must preserve it.
    await targetPage.getByTestId('new-direct-chat').click();
    await targetPage.getByTestId('user-search-input').fill('maria');
    await targetPage.getByTestId('user-result-maria').click();
    await expect(targetPage.locator('.conversation-header h1')).toContainText('maria');
    await expect(targetPage.getByTestId('socket-status')).toContainText('В сети');

    await login(page, 'andrey');
    await page.getByTestId('new-direct-chat').click();
    await page.getByTestId('user-search-input').fill(targetUsername);
    await page.getByTestId(`user-result-${targetUsername}`).click();

    const directItem = targetPage.locator(
      '[data-testid="chat-list-item"][data-chat-title="andrey"]',
    );
    await expect(directItem).toBeVisible();

    await targetContext.setOffline(true);
    await expect(targetPage.getByTestId('socket-status')).toContainText('Переподключение');

    await page.getByTestId('message-composer').fill(offlineMessage);
    await page.getByTestId('send-message').click();
    await expect(page.getByTestId('message-list').getByText(offlineMessage)).toBeVisible();

    await targetContext.setOffline(false);
    await expect(targetPage.getByTestId('socket-status')).toContainText('В сети');
    await expect(directItem).toContainText(offlineMessage);
    await expect(targetPage.locator('[data-testid="chat-list-item"]').first()).toHaveAttribute(
      'data-chat-title',
      'andrey',
    );

    // The reconnect refresh is silent and does not disturb the selected accessible chat.
    await expect(targetPage.locator('.conversation-header h1')).toContainText('maria');
    await expect(targetPage.locator('.sidebar-loading')).toHaveCount(0);
  } finally {
    await targetContext.close();
  }
});
