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

    // Full image must be visible: rendered ratio == natural ratio (nothing cropped by object-fit)
    // and the image box is not clipped by its container or squeezed by a fixed height.
    const fit = await page.evaluate(() => {
      const img = document.querySelector(".hero-portrait");
      const box = img.getBoundingClientRect();
      const container = img.closest(".visual").getBoundingClientRect();
      return {
        naturalRatio: img.naturalWidth / img.naturalHeight,
        renderedRatio: box.width / box.height,
        clippedBottom: box.bottom - container.bottom,
        clippedRight: box.right - container.right,
        clippedTop: container.top - box.top,
        clippedLeft: container.left - box.left,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    if (Math.abs(fit.naturalRatio - fit.renderedRatio) > 0.01) {
      throw new Error(`Hero image is cropped/distorted at ${width}px: ${JSON.stringify(fit)}`);
    }
    if (fit.clippedBottom > 1 || fit.clippedRight > 1 || fit.clippedTop > 1 || fit.clippedLeft > 1) {
      throw new Error(`Hero image is clipped by its container at ${width}px: ${JSON.stringify(fit)}`);
    }
    if (fit.overflowX > 1) {
      throw new Error(`Page overflows horizontally at ${width}px by ${fit.overflowX}px`);
    }

    // Quote sits under the STAY HARD lettering (lettering ends at ~20% of the image height) and inside the image
    const quote = page.locator(".hero-quote");
    await quote.waitFor({ state: "visible", timeout: 5000 });
    const quoteText = (await quote.innerText()).replace(/\s+/g, " ");
    if (!quoteText.includes("Every step is evidence the story in your mind is not true. Forward. Forward.")) {
      throw new Error(`Hero quote text is wrong at ${width}px: ${quoteText}`);
    }
    const qPos = await page.evaluate(() => {
      const img = document.querySelector(".hero-portrait").getBoundingClientRect();
      const q = document.querySelector(".hero-quote").getBoundingClientRect();
      return { topPct: (q.top - img.top) / img.height, bottomPct: (q.bottom - img.top) / img.height, inside: q.left >= img.left && q.right <= img.right };
    });
    if (qPos.topPct < 0.195 || qPos.bottomPct > 0.33 || !qPos.inside) {
      throw new Error(`Hero quote is not directly under STAY HARD at ${width}px: ${JSON.stringify(qPos)}`);
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
  const dateInputCount = await page
    .locator('input[type="datetime-local"], input[type="date"], input[type="month"], input[type="week"], input[type="time"]')
    .count();
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

  // Drag on the dial: pointer from 12 o'clock to 3 o'clock should land on hour 3 and advance to minutes
  const dial = page.locator(".clock-dial-container");
  const dialBox = await dial.boundingBox();
  const dcx = dialBox.x + dialBox.width / 2;
  const dcy = dialBox.y + dialBox.height / 2;
  const r = dialBox.width * 0.37;
  await page.mouse.move(dcx, dcy - r);
  await page.mouse.down();
  await page.mouse.move(dcx + r * 0.7, dcy - r * 0.7, { steps: 5 });
  await page.mouse.move(dcx + r, dcy, { steps: 5 });
  await page.mouse.up();
  const hourAfterDrag = await page.locator(".time-digit-btn").first().innerText();
  if (hourAfterDrag !== "03") throw new Error(`Dragging the hour hand did not select 3: ${hourAfterDrag}`);
  await page.locator('.clock-dial-node[aria-label="30 minutes"]').waitFor({ state: "visible", timeout: 5000 });

  // Back to hours via the big digital hour, then pick hour 10 (tap)
  await page.locator(".time-digit-btn").first().click();
  const hour10Node = page.locator('.clock-dial-node[aria-label="Hour 10"]');
  await hour10Node.click();

  // Dial switches to minutes (Step 2)
  const minute30Node = page.locator('.clock-dial-node[aria-label="30 minutes"]');
  await minute30Node.waitFor({ state: "visible", timeout: 5000 });
  await minute30Node.click();

  // AM/PM toggle switches the big digital time
  await page.locator(".ampm-btn", { hasText: "PM" }).click();
  const periodLabel = await page.locator(".digital-period-label").innerText();
  if (periodLabel !== "PM") throw new Error(`AM/PM toggle did not switch to PM: ${periodLabel}`);

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

  // Persistence: the task and its alarm survive a full reload
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".right-now-card").waitFor({ state: "visible", timeout: 5000 });
  await page.locator(".countdown-ring-big-container").waitFor({ state: "visible", timeout: 5000 });
  const persistedTitle = await page.locator(".saved-task").count();
  if (persistedTitle < 1) throw new Error("Saved task did not survive a reload");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("todo-adhd.tasks.guest") || "[]"));
  if (!stored.length || !stored[0].reminderTime || !stored[0].reminderAt) {
    throw new Error(`Alarm not stored persistently: ${JSON.stringify(stored)}`);
  }
  if (new Date(stored[0].reminderAt).getTime() <= Date.now()) {
    throw new Error(`Alarm should be scheduled in the future (today or tomorrow): ${stored[0].reminderAt}`);
  }

  if (await page.locator("#account").count()) {
    throw new Error("Removed account-creation section is still present");
  }

  await page.screenshot({ path: "todo-mobile-browser-check.png", fullPage: true });
  await page.screenshot({ path: "hero3d-browser-check.png", fullPage: true });
  if (errors.length) {
    throw new Error(`Browser page errors: ${errors.join(" | ")}`);
  }

  console.log("All browser smoke tests passed: full hero image + quote (360/390/430px), round clock picker (tap, drag, AM/PM), big/small countdown rings, persistence after reload!");
} finally {
  await browser.close();
  if (server) {
    await server.close();
  }
}
