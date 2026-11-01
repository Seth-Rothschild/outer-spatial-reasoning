export default async function speedSelector(page, { screenshot }) {
  await page.waitForSelector("#speed");
  const optionLabels = await page.$$eval("#speed option", (options) =>
    options.map((option) => option.textContent.trim()),
  );
  console.log("speed options:", optionLabels);
  await screenshot("controls-bar");
}
