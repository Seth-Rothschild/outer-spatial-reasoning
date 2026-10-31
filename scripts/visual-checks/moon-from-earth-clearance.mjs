export default async function moonFromEarthClearance(page, { screenshot }) {
  await page.waitForSelector("#view-moonFromEarth");
  await page.waitForTimeout(600);
  await screenshot("default");

  await page.click("#now-toggle");
  const when = page.locator("#when");

  // Step through roughly a third of a lunar orbit at a time, sampling several
  // points around the Moon's cycle to check it stays clear of Earth's silhouette.
  const sampleDates = [
    "2026-11-07T12:00",
    "2026-11-14T12:00",
    "2026-11-21T12:00",
    "2026-11-28T12:00",
  ];
  for (const date of sampleDates) {
    await when.fill(date);
    await when.dispatchEvent("change");
    await page.waitForTimeout(800);
    await screenshot(`date-${date}`);
  }
}
