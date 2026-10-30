import { test, expect } from '@playwright/test';
const year = new Date().getFullYear() + 1;
const monday = (() => {
  const day = new Date(Date.UTC(year, 6, 12));
  while (day.getUTCDay() !== 1) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
})();
const friday = new Date(Date.parse(`${monday}T12:00:00Z`) + 4 * 86400000)
  .toISOString()
  .slice(0, 10);
async function login(page) {
  await page.goto('/');
  await page.getByLabel('E-Mail-Adresse', { exact: true }).fill('mia@example.test');
  await page.getByLabel('Passwort', { exact: true }).fill('E2E-only-passphrase-2026');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hallo Test/ })).toBeVisible();
  await page.getByLabel('Jahr', { exact: true }).selectOption(String(year));
}
test('Mitarbeiter bucht fünf Tage und storniert mit vollständiger Erstattung', async ({ page }) => {
  await login(page);
  await expect(page.locator('.calendar-period h3')).toContainText(String(year));
  await page.getByRole('button', { name: 'Nächster Zeitraum' }).click();
  const selectedMonth = await page.locator('.calendar-period h3').innerText();
  await page.getByRole('button', { name: 'Urlaub buchen', exact: true }).click();
  await page.getByLabel('Erster Urlaubstag', { exact: true }).fill(monday);
  await page.getByLabel('Letzter Urlaubstag (inklusive)', { exact: true }).fill(friday);
  await page.getByRole('button', { name: 'Urlaubstage berechnen' }).click();
  await expect(page.getByRole('dialog')).toContainText('5 Urlaubstage');
  await page.getByRole('button', { name: 'Urlaub verbindlich buchen' }).click();
  await expect(page.locator('.toast')).toContainText('verbindlich gebucht');
  // Wait for the dashboard refresh before checking that the calendar stayed in place.
  await expect(page.locator('.stat-card').first()).toContainText('25');
  await expect(page.locator('.calendar-period h3')).toHaveText(selectedMonth);
  await page.getByRole('button', { name: 'Mein Urlaub', exact: true }).click();
  await expect(page.locator('.stat-card').first()).toContainText('25');
  await page.getByRole('button', { name: /Buchung ab/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Stornieren', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Guthaben wurde freigegeben');
  await expect(page.locator('.stat-card').first()).toContainText('30');
  await expect(page.locator('.status-pill.cancelled')).toHaveText('Storniert');
});
test('Mitarbeiter sieht weder Adminnavigation noch fremde Abteilungsereignisse', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole('navigation', { name: 'Verwaltung' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Teamkalender', exact: true }).click();
  await page.getByRole('button', { name: 'Jahr', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Januar', exact: true })).toBeVisible();
  await expect(page.getByText('Private Kollegin', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Nur deine Abteilung', { exact: false })).toBeVisible();
});
test('Buchung ist bei 360 Pixeln ohne horizontales Scrollen bedienbar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page);
  await expect(page.getByRole('button', { name: 'Navigation öffnen' })).toBeVisible();
  await page.getByRole('button', { name: 'Urlaub buchen', exact: true }).click();
  await page.getByLabel('Erster Urlaubstag', { exact: true }).fill(monday);
  await page.getByLabel('Letzter Urlaubstag (inklusive)', { exact: true }).fill(friday);
  await page.getByRole('button', { name: 'Urlaubstage berechnen' }).click();
  await expect(page.getByRole('dialog')).toContainText('5 Urlaubstage');
  expect(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Urlaub verbindlich buchen' })).toBeVisible();
});

test('Kalenderdruck zeigt nur den gewählten Kalender und stellt die Ansicht wieder her', async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    window.print = () => {
      window.dispatchEvent(new Event('beforeprint'));
    };
  });
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  expect(
    await page
      .locator('.fc-day-sat')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(244, 244, 244)');
  expect(
    await page
      .locator('.fc')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--fc-today-bg-color').trim()),
  ).toBe('#f3f3f3');
  await expect(page.locator('.calendar-panel')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.stat-card').first()).toBeHidden();
  await expect(page.locator('.right-column')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Drucken', exact: true })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.getByRole('button', { name: 'Drucken', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Teamkalender', exact: true }).click();
  for (const view of ['Monat', 'Jahr']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    if (view === 'Jahr') await expect(page.locator('.annual-calendar')).toBeVisible();
    await page.getByRole('button', { name: 'Drucken', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    const calendar = page.locator('.calendar-panel');
    await expect(calendar).toBeVisible();
    expect(await calendar.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  }
});

test('Jahreskalender übernimmt markierte Bereiche und einzelne Tage in die Buchung', async ({
  page,
}) => {
  // Keep both drag endpoints visible, including the end of January.
  await page.setViewportSize({ width: 1800, height: 1600 });
  await login(page);
  await page.getByRole('button', { name: 'Teamkalender', exact: true }).click();
  await page.getByRole('button', { name: 'Jahr', exact: true }).click();
  const drag = async (from, to) => {
    const start = await page.locator(`.annual-day[data-date="${from}"]`).boundingBox();
    const end = await page.locator(`.annual-day[data-date="${to}"]`).boundingBox();
    await page.mouse.move(start.x + 10, start.y + 10);
    await page.mouse.down();
    await page.mouse.move(end.x + 10, end.y + 10, { steps: 10 });
    await expect(page.locator(`.annual-day[data-date="${to}"]`)).toHaveClass(/annual-selected/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.mouse.up();
  };
  for (const [from, to] of [
    [monday, friday],
    [`${year}-02-03`, `${year}-01-29`],
  ]) {
    await drag(from, to);
    const [start, end] = [from, to].sort();
    await expect(page.getByLabel('Erster Urlaubstag', { exact: true })).toHaveValue(start);
    await expect(page.getByLabel('Letzter Urlaubstag (inklusive)', { exact: true })).toHaveValue(
      end,
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.annual-selected')).toHaveCount(0);
  }
  await page.locator(`.annual-day[data-date="${monday}"]`).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Erster Urlaubstag', { exact: true })).toHaveValue(monday);
  await expect(page.getByLabel('Letzter Urlaubstag (inklusive)', { exact: true })).toHaveValue(
    monday,
  );
});

test('Jahreskalender behält nach einer Buchung Tabelle, Scrollposition und Fokus', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Teamkalender', exact: true }).click();
  await page.getByRole('button', { name: 'Jahr', exact: true }).click();
  const day = page.locator(`.annual-day[data-date="${monday}"]`);
  await day.scrollIntoViewIfNeeded();
  await day.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => {
    window.savedAnnualTable = document.querySelector('.annual-calendar');
    window.savedAnnualScroll = document.querySelector('.annual-calendar-scroll').scrollLeft;
    window.savedPageScroll = window.scrollY;
  });
  await page.getByRole('button', { name: 'Urlaubstage berechnen' }).click();
  await page.getByRole('button', { name: 'Urlaub verbindlich buchen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(day.locator('.annual-markers i')).toHaveCount(1);
  await expect(day).toBeFocused();
  expect(
    await page.evaluate(() => ({
      sameTable: window.savedAnnualTable === document.querySelector('.annual-calendar'),
      horizontal:
        document.querySelector('.annual-calendar-scroll').scrollLeft === window.savedAnnualScroll,
      vertical: window.scrollY === window.savedPageScroll,
    })),
  ).toEqual({ sameTable: true, horizontal: true, vertical: true });
});
