// Checks the Moon's near-side ("phases") view: anchored close to the Moon itself,
// with the phase-info panel showing the current phase name and illuminated
// percentage.
export default async function moonPhasesView(page, { screenshot }) {
  await page.waitForSelector("#view-moonFromEarth[aria-pressed='true']");
  await screenshot("before");

  await page.click("#view-moon");
  await page.waitForSelector("#view-moon[aria-pressed='true']");
  await page.waitForTimeout(600); // let the camera ease toward the new viewpoint
  await screenshot("moon-view");

  const panel = page.locator("#phase-info");
  if (await panel.isHidden()) throw new Error("phase-info panel should be visible in Moon view");

  const name = await page.locator("#phase-name").textContent();
  const percent = await page.locator("#phase-percent").textContent();
  if (!name) throw new Error("phase name should not be empty");
  if (!/^\d+% lit$/.test(percent)) throw new Error(`unexpected phase-percent text: "${percent}"`);
  console.log(`phase name="${name}" percent="${percent}"`);

  await page.click("#view-moonFromEarth");
  await page.waitForSelector("#view-moonFromEarth[aria-pressed='true']");
  if (await panel.isVisible()) throw new Error("phase-info panel should hide outside Moon view");
  await screenshot("back-to-moon-from-earth");
}
