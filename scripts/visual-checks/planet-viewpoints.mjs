export default async function planetViewpoints(page, { screenshot }) {
  await page.waitForSelector("#view-jupiter");
  await page.waitForTimeout(600);
  await screenshot("default-moon-from-earth");

  for (const planet of ["sun", "earth", "moon", "jupiter", "saturn", "neptune"]) {
    await page.click(`#view-${planet}`);
    await page.waitForTimeout(600);
    await screenshot(planet);
  }

  // Saturn specifically, with time sped way up: the ring should travel with the
  // planet but not visibly spin along with its (much faster) axial rotation.
  await page.click("#view-saturn");
  await page.waitForTimeout(600);
  await page.selectOption("#speed", "3600");
  await page.waitForTimeout(4000);
  await screenshot("saturn-after-time-passes");
  await page.selectOption("#speed", "1");
}
