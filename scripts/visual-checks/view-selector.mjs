// Checks the view selector: the Sun should actually be visible on screen in the Sun
// view (regression check for Earth's bulk eclipsing it at close range, back when Sun
// view was framed from Earth), and dragging the canvas should mark the selector
// "Custom" until a preset button is clicked again.
export default async function viewSelector(page, { screenshot }) {
  await page.waitForSelector("#view-moonFromEarth[aria-pressed='true']");
  await screenshot("moon-from-earth-default");

  await page.click("#view-sun");
  await page.waitForSelector("#view-sun[aria-pressed='true']");
  await page.waitForTimeout(600); // let the camera ease toward the new viewpoint
  await screenshot("sun-view");

  const canvas = page.locator("#gl");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForSelector("#view-custom[aria-pressed='true']");
  await screenshot("custom-after-drag");

  await page.click("#view-moonFromEarth");
  await page.waitForSelector("#view-moonFromEarth[aria-pressed='true']");
  await screenshot("moon-from-earth-again");
}
