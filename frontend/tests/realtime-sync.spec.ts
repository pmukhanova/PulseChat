import { expect, test, type Page } from '@playwright/test';

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

test('synchronizes unseen chats, unread state and role changes through personal rooms', async ({ browser, page }) => {
  test.setTimeout(60_000);
  const targetUsername = `sync_${Date.now()}`;
  const directMessage = `Unread delivery ${targetUsername}`;
  const groupTitle = `Realtime group ${targetUsername}`;

  const targetContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
  });
  const targetPage = await targetContext.newPage();

  try {
    await register(targetPage, targetUsername);

    // Give the temporary user another active chat, so the new DIRECT is never opened beforehand.
    await targetPage.getByTestId('new-direct-chat').click();
    await targetPage.getByTestId('user-search-input').fill('maria');
    await targetPage.getByTestId('user-result-maria').click();
    await expect(targetPage.locator('.conversation-header h1')).toContainText('maria');

    await login(page, 'andrey');
    await page.getByTestId('new-direct-chat').click();
    await page.getByTestId('user-search-input').fill(targetUsername);
    await page.getByTestId(`user-result-${targetUsername}`).click();
    await expect(page.locator('.conversation-header h1')).toContainText(targetUsername);

    const directItem = targetPage.locator(
      `[data-testid="chat-list-item"][data-chat-title="andrey"]`,
    );
    await expect(directItem).toBeVisible();
    await expect(targetPage.locator('.conversation-header h1')).toContainText('maria');

    await page.getByTestId('message-composer').fill(directMessage);
    await page.getByTestId('send-message').click();
    await expect(directItem).toContainText(directMessage);
    await expect(directItem.getByTestId('unread-badge')).toHaveText('1');
    await expect(targetPage.locator('[data-testid="chat-list-item"]').first()).toHaveAttribute(
      'data-chat-title',
      'andrey',
    );

    await directItem.click();
    await expect(targetPage.getByTestId('message-list').getByText(directMessage)).toBeVisible();
    await expect(directItem.getByTestId('unread-badge')).toHaveCount(0);

    await page.getByTestId('new-group-chat').click();
    await page.getByTestId('group-title').fill(groupTitle);
    await page.getByTestId('user-search-input').fill(targetUsername);
    await page.getByTestId(`user-result-${targetUsername}`).click();
    await page.getByTestId('create-group-submit').click();
    await expect(page.locator('.conversation-header h1')).toContainText(groupTitle);

    const targetGroupItem = targetPage.locator(
      `[data-testid="chat-list-item"][data-chat-title="${groupTitle}"]`,
    );
    await expect(targetGroupItem).toBeVisible();
    await targetGroupItem.click();
    await expect(targetPage.getByTestId('current-chat-role')).toHaveAttribute('data-role', 'MEMBER');
    await expect(targetPage.getByTestId('toggle-add-member')).toHaveCount(0);

    await page.getByRole('button', { name: `Назначить администратором ${targetUsername}` }).click();
    await expect(targetPage.getByTestId('current-chat-role')).toHaveAttribute('data-role', 'ADMIN');
    await expect(targetPage.getByTestId('toggle-add-member')).toBeVisible();
  } finally {
    await targetContext.close();
  }
});
