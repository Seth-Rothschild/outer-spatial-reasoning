// Checks that clicking the header date/phase readout reveals the date bar
// (the +1 day / -1 day / date-picker controls) and clicking it again hides it.
export default async function dateToggle(page, { screenshot }) {
  await page.waitForSelector("#now-toggle[aria-expanded='false']");
  const datebar = page.locator("#datebar");
  await screenshot("collapsed");

  await page.click("#now-toggle");
  await page.waitForSelector("#now-toggle[aria-expanded='true']");
  if (await datebar.isHidden())
    throw new Error("datebar should be visible after clicking now-toggle");
  await screenshot("expanded");

  const before = await page.inputValue("#when");
  await page.click("#d-plus");
  const after = await page.inputValue("#when");
  if (before === after) throw new Error("+1 day did not change the date input");
  await screenshot("after-plus-one-day");

  await page.click("#now-toggle");
  await page.waitForSelector("#now-toggle[aria-expanded='false']");
  if (await datebar.isVisible()) throw new Error("datebar should be hidden after collapsing");
  await screenshot("collapsed-again");
}
