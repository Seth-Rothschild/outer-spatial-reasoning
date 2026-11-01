export default async function sunDefaultView(page, { screenshot }) {
  await page.waitForSelector("#view-sun");
  await page.click("#view-sun");
  await page.waitForTimeout(800);
  await screenshot("default");
}
