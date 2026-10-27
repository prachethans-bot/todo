import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle", timeout: 30000 });

  const portrait = page.locator(".hero-portrait");
  await portrait.waitFor({ state: "visible", timeout: 10000 });
  const imageState = await portrait.evaluate((img) => ({
    src: img.getAttribute("src"),
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    width: img.clientWidth,
    height: img.clientHeight,
  }));
  if (!imageState.complete || imageState.naturalWidth < 100 || imageState.naturalHeight < 100) {
    throw new Error(`Hero image did not load correctly: ${JSON.stringify(imageState)}`);
  }
  if (imageState.width < 100 || imageState.height < 100) {
    throw new Error(`Hero image has invalid rendered size: ${JSON.stringify(imageState)}`);
  }
  if (await page.locator('#account').count()) throw new Error("Removed account-creation section is still present");
  await page.screenshot({ path: "todo-mobile-browser-check.png", fullPage: true });
  if (errors.length) throw new Error(`Browser page errors: ${errors.join(" | ")}`);
  console.log(`Mobile browser smoke test passed. Image: ${imageState.naturalWidth}x${imageState.naturalHeight}, rendered: ${imageState.width}x${imageState.height}; screenshot: todo-mobile-browser-check.png`);
} finally {
  await browser.close();
}
