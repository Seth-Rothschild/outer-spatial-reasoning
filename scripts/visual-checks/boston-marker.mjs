export default async function bostonMarker(page, { screenshot }) {
  await page.waitForSelector("#view-earth");
  await page.click("#view-earth");
  await page.waitForTimeout(600);
  await screenshot("earth-near-side");

  const canvasBox = await page.locator("#gl").boundingBox();
  const center = {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(600);
  await screenshot("earth-zoomed-out");

  // Zoom to the max distance, then override the stage's `clamp(300px, 58vh, 680px)`
  // CSS floor (production never lets the canvas get this short) to drive Earth's own
  // pixel radius down past the 24px cutoff -- the "viewed from the Sun" regime where
  // Earth is a tiny, distant speck -- without needing to hunt for it across the
  // solar system. The marker (and its label) should disappear entirely here, rather
  // than staying pinned at its near-view pixel size on a now-tiny Earth.
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, 20000);
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: "#stage { height: 120px !important; }" });
  await page.waitForTimeout(1000);
  await screenshot("earth-tiny");
}
