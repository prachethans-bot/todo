import { chromium } from "playwright";
import { preview } from "vite";

let server;
const targetUrl = "http://127.0.0.1:4173";

try {
  const ping = await fetch(targetUrl);
  if (!ping.ok) throw new Error("preview not ready");
} catch {
  server = await preview({ preview: { port: 4173, host: "127.0.0.1" } });
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });

  // Brand and core navigation
  await page.getByText("வினை", { exact: true }).first().waitFor({ state: "visible" });
  await page.locator(".hero-poster").waitFor({ state: "visible" });
  await page.locator(".task-count").waitFor({ state: "visible" });
  for (const label of ["Today", "Timed plan", "My buddy"]) {
    await page.getByRole("button", { name: label, exact: true }).waitFor({ state: "visible" });
  }

  // Responsive layout at common phone widths
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`Horizontal overflow at ${width}px: ${overflow}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // Add a task and verify the local micro-step fallback
  await page.locator("#task-title").fill("Study the biology chapter");
  await page.locator(".quick-add button[type=submit]").click();
  const task = page.locator(".task-card").filter({ hasText: "Study the biology chapter" }).first();
  await task.waitFor({ state: "visible", timeout: 5000 });
  if (!(await task.locator(".task-main p").innerText()).trim()) throw new Error("Task micro-step is empty");

  // Immediate completion, points, undo
  const pointsBefore = Number((await page.locator(".stat-card").first().locator("strong").innerText()).match(/\d+/)?.[0] ?? 0);
  await task.locator(".check-button").click();
  await task.waitFor({ state: "visible" });
  if (!(await task.getAttribute("class")).includes("is-complete")) throw new Error("Checkbox did not complete the task immediately");
  const pointsAfter = Number((await page.locator(".stat-card").first().locator("strong").innerText()).match(/\d+/)?.[0] ?? 0);
  if (pointsAfter - pointsBefore !== 10 && pointsAfter - pointsBefore !== 35) throw new Error("Expected +10 points or +35 with bonus");
  await task.getByRole("button", { name: "Undo", exact: true }).click();
  if ((await task.getAttribute("class")).includes("is-complete")) throw new Error("Undo did not restore the task");

  // Focus session and editable progress note
  await task.getByRole("button", { name: /Focus/ }).click();
  const focusPanel = page.locator(".focus-panel");
  await focusPanel.waitFor({ state: "visible" });
  await focusPanel.locator("textarea").fill("Opened the book and found the chapter.");
  await focusPanel.getByRole("button", { name: /Stop/ }).click();
  await focusPanel.waitFor({ state: "hidden" });

  // Timed plan generation and step controls
  await page.getByRole("button", { name: "Timed plan", exact: true }).click();
  await page.locator("#plan-task").fill("Revise the biology chapter and make short notes");
  await page.locator(".planner-card button[type=submit]").click();
  const plan = page.locator(".generated-plan");
  await plan.waitFor({ state: "visible", timeout: 5000 });
  if (await plan.locator(".plan-step").count() < 3) throw new Error("Timed plan should contain multiple editable steps");
  await plan.getByRole("button", { name: /Start step/ }).click();
  await plan.getByRole("button", { name: /Pause/ }).click();

  // Buddy section should be visible even in unauthenticated local-demo mode
  await page.getByRole("button", { name: "My buddy", exact: true }).click();
  await page.getByText("Your accountability buddy").waitFor({ state: "visible" });

  // Task and progress note survive a refresh in local mode
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem("vinai.fresh.v1") || "{}");
    return saved.tasks?.some(item => item.title === "Study the biology chapter" && item.note === "Opened the book and found the chapter.");
  }, null, { timeout: 5000 });
  await page.reload({ waitUntil: "networkidle" });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("vinai.fresh.v1") || "{}"));
  const saved = stored.tasks?.find(item => item.title === "Study the biology chapter");
  if (!saved) throw new Error("Task did not survive reload");
  if (saved.note !== "Opened the book and found the chapter.") throw new Error("Focus note did not survive reload");

  const forbidden = await page.getByText(/take photo|camera verification|photo proof/i).count();
  if (forbidden) throw new Error("Legacy camera/photo verification UI is still present");
  if (errors.length) throw new Error(`Browser page errors: ${errors.join(" | ")}`);

  await page.screenshot({ path: "vinai-mobile-browser-check.png", fullPage: true });
  console.log("Vinai browser smoke test passed: responsive layout, task completion/reward/undo, focus notes, timed plan, buddy section, and local persistence.");
} finally {
  await browser.close();
  if (server) await server.close();
}
