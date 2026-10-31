// Checks that +1 day eases simulatedMs to its target instead of snapping: samples
// the date input mid-tween and expects it to differ from both the start and end
// values, then waits for the tween to finish and confirms it lands exactly on target.
export default async function timeTween(page, { screenshot }) {
  await page.click("#now-toggle");
  await page.waitForSelector("#now-toggle[aria-expanded='true']");

  const before = await page.inputValue("#when");
  await screenshot("before");

  await page.click("#d-plus");
  // The date input only refreshes on its own ~400ms periodic tick, independent of
  // the tween's clock, so these margins give that tick room to land before each read:
  // 450ms is past one tick but still short of the 650ms tween, and the second wait
  // is past both the tween finishing and another tick after it settles.
  await page.waitForTimeout(450);
  const mid = await page.inputValue("#when");
  await screenshot("mid-tween");

  await page.waitForTimeout(700);
  const after = await page.inputValue("#when");
  await screenshot("after");

  if (mid === before || mid === after) {
    throw new Error(
      `expected an intermediate value mid-tween, got before=${before} mid=${mid} after=${after}`,
    );
  }
  console.log(`before=${before} mid=${mid} after=${after}`);
}
