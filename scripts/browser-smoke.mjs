import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".hero3d", { timeout: 10000 });
  await page.waitForTimeout(1800);
  const canvas = page.locator(".hero3d canvas");
  await canvas.waitFor({ state: "attached", timeout: 10000 });
  const size = await canvas.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
  if (size.width < 10 || size.height < 10) throw new Error(`3D canvas has invalid size: ${JSON.stringify(size)}`);
  await page.screenshot({ path: "hero3d-browser-check.png", fullPage: true });
  if (errors.length) throw new Error(`Browser page errors: ${errors.join(" | ")}`);
  console.log(`Browser smoke test passed. 3D canvas: ${size.width}x${size.height}; screenshot: hero3d-browser-check.png`);
} finally {
  await browser.close();
}
