import { test, expect } from "@playwright/test";
import { home, reportPage } from "../convex/gmailPage";
import { GMAIL_QUERY } from "../convex/gmailClient";

test("live Connect Gmail screen renders and unauthorised ledger stays private", async ({ page }) => {
  const response = await page.goto("https://groovy-gull-418.convex.site/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Know your safe-to-spend number until your next salary." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect Gmail", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/gmail-connect.png", fullPage: true });
  const ledger = await page.goto("https://groovy-gull-418.convex.site/gmail/ledger");
  expect(ledger?.status()).toBe(401);
  await expect(page.getByText("Connect Gmail in this browser to view your saved ledger.")).toBeVisible();
});

test("live callback rejects forged OAuth state", async ({ page }) => {
  const response = await page.goto("https://groovy-gull-418.convex.site/gmail/callback?state=forged&code=invented");
  expect([400, 503]).toContain(response?.status());
  await expect(page.getByRole("heading", { name: "Import stopped" })).toBeVisible();
});

test("import report shows comparison table and JSON with the same exact values", async ({ page }) => {
  const report = {
    query: GMAIL_QUERY, totalEmailsFound: 6, rowsParsed: 5, rowsSkipped: 1,
    rowsInserted: 5, duplicateRowsNotInserted: 0,
    first5ParsedRows: Array.from({ length: 5 }, (_, i) => ({
      emailDate: "Thu, 08 Oct 2026 12:00:00 +0530", snippet: `Invented alert ${i + 1}`,
      row: { date: "2026-10-08", amount: 100 + i, direction: "debit" as const, payee: `Test shop ${i + 1}` },
    })),
  };
  await page.setContent(reportPage(report));
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await expect(page.locator("#import-output")).toHaveText(JSON.stringify(report, null, 2));
  expect(JSON.parse(await page.locator("#import-output").innerText())).toEqual(report);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "First five parsed rows" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("home, salary and ledger screens work at phone and desktop widths", async ({page}) => {
 const {salaryScreen, transactionScreen, dashboard} = await import('../convex/screens');
 for (const width of [390, 1280]) {
  await page.setViewportSize({width,height:844});
  await page.setContent(home(true,false));
  await expect(page.getByRole('link',{name:'Connect Gmail',exact:true})).toBeVisible();
  await page.screenshot({path:`test-results/home-${width}.png`,fullPage:true});
  await page.setContent(salaryScreen('test'));
  await page.getByLabel('Monthly salary').fill('20000');
  await page.getByLabel('Salary date').fill('2026-10-01');
  await page.screenshot({path:`test-results/salary-${width}.png`,fullPage:true});
  await page.setContent(transactionScreen('test'));
  await page.getByRole('radio',{name:'Upcoming',exact:true}).check();
  await page.getByLabel('Paid to').fill('Rent');
  await page.getByLabel('Amount',{exact:true}).fill('2000');
  await page.screenshot({path:`test-results/transaction-${width}.png`,fullPage:true});
  const rows = [{date:'2026-10-10',amount:1000,payee:'Groceries',direction:'debit' as const,sourceKey:'gmail'}, {date:'2026-10-20',amount:2000,payee:'Rent',direction:'debit' as const,sourceKey:'manual:rent',kind:'upcoming' as const}];
  await page.setContent(dashboard({amount:20000,date:'2026-10-01'},rows,new URLSearchParams(),'2026-10-11'));
  await expect(page.getByText('₹17,000',{exact:true})).toBeVisible();
  await page.getByText('What goes into this number').click();
  await expect(page.getByText('Monthly salary',{exact:true})).toBeVisible();
  await page.screenshot({path:`test-results/ledger-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.setContent(dashboard({amount:20000,date:'2026-10-01'},rows,new URLSearchParams('filter=upcoming'),'2026-10-11'));
  await expect(page.getByText('Rent',{exact:true})).toBeVisible();
  await expect(page.getByText('20 Oct · Upcoming · Manual',{exact:true})).toBeVisible();
 }
});
