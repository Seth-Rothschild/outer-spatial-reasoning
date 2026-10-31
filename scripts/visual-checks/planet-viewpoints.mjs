export default async function planetViewpoints(page, { screenshot }) {
  await page.waitForSelector("#view-jupiter");
  await page.waitForTimeout(600);
  await screenshot("default-moon-from-earth");

  for (const planet of ["sun", "earth", "moon", "jupiter", "saturn", "neptune"]) {
    await page.click(`#view-${planet}`);
    await page.waitForTimeout(600);
    await screenshot(planet);
  }
}
