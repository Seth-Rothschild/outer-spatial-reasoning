export default async function infoPanel(page, { screenshot }) {
  await page.waitForSelector("#gl");
  await page.waitForTimeout(600);
  await screenshot("before");

  await page.click("#info-toggle");
  await page.waitForTimeout(200);
  await screenshot("open");
}
