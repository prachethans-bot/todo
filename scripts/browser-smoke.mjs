import { chromium } from "playwright";
import { preview } from "vite";

let server;
const targetUrl = "http://127.0.0.1:4173";

// Start vite preview server if not already running
try {
  const ping = await fetch(targetUrl);
  if (!ping.ok) throw new Error("not ready");
} catch {
  server = await preview({ preview: { port: 4173, host: "127.0.0.1" } });
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });

  // 1. Check hero image and badge at 360px, 390px, and 430px widths
  const viewports = [360, 390, 430];
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 844 });
    const portrait = page.locator(".hero-portrait");
    await portrait.waitFor({ state: "visible", timeout: 10000 });

    const imageState = await portrait.evaluate((img) => {
      const style = window.getComputedStyle(img);
      return {
        src: img.getAttribute("src"),
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        width: img.clientWidth,
        height: img.clientHeight,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
      };
    });

    if (!imageState.complete || imageState.naturalWidth < 100 || imageState.naturalHeight < 100) {
      throw new Error(`Hero image did not load at ${width}px: ${JSON.stringify(imageState)}`);
    }
    if (imageState.width < 100 || imageState.height < 100) {
      throw new Error(`Hero image has invalid rendered size at ${width}px: ${JSON.stringify(imageState)}`);
    }

    const badge = page.locator(".hero-badge");
    await badge.waitFor({ state: "visible", timeout: 5000 });
    const badgeText = await badge.innerText();
    if (!badgeText.includes("left today")) {
      throw new Error(`Hero badge missing "left today" text at ${width}px: ${badgeText}`);
    }
    console.log(`Checked hero image & badge at ${width}px: visible, ${imageState.width}x${imageState.height}, badge: "${badgeText}"`);
  }

  // Restore 390px viewport
  await page.setViewportSize({ width: 390, height: 844 });

  // 2. Verify datetime-local / date inputs are completely removed
  const dateInputCount = await page.locator('input[type="datetime-local"], input[type="date"]').count();
  if (dateInputCount > 0) {
    throw new Error(`Expected no datetime-local/date inputs, but found ${dateInputCount}`);
  }

  // 3. Generate a micro-step
  await page.locator("#task").fill("Study for my biology exam");
  await page.locator('button[type="submit"]').click();
  await page.locator(".time-chip-btn").waitFor({ state: "visible", timeout: 10000 });

  // 4. Test Round Clock Picker
  await page.locator(".time-chip-btn").click();
  const sheet = page.locator(".sheet-content");
  await sheet.waitFor({ state: "visible", timeout: 5000 });

  // Verify big digital time in center
  const digitalTime = page.locator(".digital-time-display");
  await digitalTime.waitFor({ state: "visible" });

  // Verify dial tap targets >= 56px
  const firstDialNode = page.locator(".clock-dial-node").first();
  await firstDialNode.waitFor({ state: "visible" });
  const nodeBox = await firstDialNode.boundingBox();
  if (!nodeBox || nodeBox.width < 56 || nodeBox.height < 56) {
    throw new Error(`Clock dial tap target is smaller than 56px: ${JSON.stringify(nodeBox)}`);
  }

  // Verify AM/PM toggle
  const ampmToggle = page.locator(".ampm-toggle");
  await ampmToggle.waitFor({ state: "visible" });

  // Pick hour 10 (tap)
  const hour10Node = page.locator('.clock-dial-node[aria-label="Hour 10"]');
  await hour10Node.click();

  // Dial switches to minutes (Step 2)
  const minute30Node = page.locator('.clock-dial-node[aria-label="30 minutes"]');
  await minute30Node.waitFor({ state: "visible", timeout: 5000 });
  await minute30Node.click();

  // Tap "Set" button
  await page.locator(".sheet-set").click();
  await sheet.waitFor({ state: "hidden", timeout: 5000 });

  // Verify time chip shows updated time
  const chipText = await page.locator(".time-chip-btn").innerText();
  if (!chipText.includes("10:30")) {
    throw new Error(`Time chip did not update with selected time: ${chipText}`);
  }

  // 5. Save the step and verify Countdown Rings
  await page.locator('button:has-text("Save this step")').click();

  // Verify Right now card with big countdown ring
  const rightNowCard = page.locator(".right-now-card");
  await rightNowCard.waitFor({ state: "visible", timeout: 5000 });
  const bigCountdown = page.locator(".countdown-ring-big-container");
  await bigCountdown.waitFor({ state: "visible", timeout: 5000 });

  // Verify small countdown ring on task list row
  const smallCountdown = page.locator(".countdown-ring-small-row");
  await smallCountdown.waitFor({ state: "visible", timeout: 5000 });

  if (await page.locator("#account").count()) {
    throw new Error("Removed account-creation section is still present");
  }

  await page.screenshot({ path: "todo-mobile-browser-check.png", fullPage: true });
  await page.screenshot({ path: "hero3d-browser-check.png", fullPage: true });
  if (errors.length) {
    throw new Error(`Browser page errors: ${errors.join(" | ")}`);
  }

  console.log("All browser smoke tests passed: hero image (360/390/430px), round clock picker, big/small countdown rings!");
} finally {
  await browser.close();
  if (server) {
    await server.close();
  }
}
