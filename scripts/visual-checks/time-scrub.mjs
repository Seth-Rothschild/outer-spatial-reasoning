// Checks that dragging the scrub wheel under the stage moves simulated time forward
// and backward (and that the header date/time readout, now centered and enlarged,
// reflects it), and that arrow keys nudge it by a day when the wheel has focus.
export default async function timeScrub(page, { screenshot }) {
  await page.waitForSelector("#time-scrub");
  await screenshot("initial");

  const before = await page.textContent("#r-time");

  const box = await page.locator("#time-scrub").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 240, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(450); // header readout only refreshes on its ~400ms tick

  const afterDragForward = await page.textContent("#r-time");
  await screenshot("after-drag-forward");
  if (afterDragForward === before) {
    throw new Error("dragging the scrub wheel right did not change the displayed time");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 480, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(450);

  const afterDragBackward = await page.textContent("#r-time");
  await screenshot("after-drag-backward");
  if (afterDragBackward === afterDragForward) {
    throw new Error("dragging the scrub wheel left did not change the displayed time");
  }

  await page.locator("#time-scrub").focus();
  const beforeArrow = await page.textContent("#r-time");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(450);
  const afterArrow = await page.textContent("#r-time");
  await screenshot("after-arrow-key");
  if (afterArrow === beforeArrow) {
    throw new Error("ArrowRight on the focused scrub wheel did not change the displayed time");
  }

  console.log(
    `before=${before} afterDragForward=${afterDragForward} afterDragBackward=${afterDragBackward} afterArrow=${afterArrow}`,
  );
}
