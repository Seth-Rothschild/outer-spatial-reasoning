export default async function orrery(page, { screenshot }) {
  await page.waitForSelector("#gl");
  await page.waitForTimeout(600); // let textures/build finish

  // Earth/Moon close-up first: confirms their textures still render correctly.
  await page.click("#view-moon");
  await page.waitForTimeout(700);
  await screenshot("moon-view-earth-texture");

  await page.click("#view-orrery");
  await page.waitForTimeout(2000); // let the camera fully ease out before measuring
  await screenshot("overview");

  const gl = await page.$("#gl");
  const box = await gl.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(700);
  await screenshot("zoomed-inner-system");

  // Saturn specifically, with time sped way up: the ring should travel with the
  // planet but not visibly spin along with its (much faster) axial rotation.
  await page.selectOption("#speed", "3600");
  await page.waitForTimeout(4000);
  await screenshot("after-time-passes");

  await page.click("#view-moon");
  await page.waitForTimeout(700);
  await screenshot("back-to-moon-view");

  await page.click("#view-sun");
  await page.waitForTimeout(700);
  await screenshot("back-to-sun-view");
}
