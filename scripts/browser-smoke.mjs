import { chromium } from "playwright";
import { preview } from "vite";

let server;
const targetUrl = "http://127.0.0.1:4173";
try { const ping = await fetch(targetUrl); if (!ping.ok) throw new Error("preview not ready"); }
catch { server = await preview({ preview: { port: 4173, host: "127.0.0.1" } }); }

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByText("வினை", { exact: true }).first().waitFor({ state: "visible" });
  await page.locator(".hero-section").waitFor({ state: "visible" });
  await page.locator(".today-card").waitFor({ state: "visible" });
  for (const label of ["Today", "Timed Plan", "My Buddy"]) {
    await page.getByRole("button", { name: label, exact: true }).waitFor({ state: "visible" });
  }
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`Horizontal overflow at ${width}px: ${overflow}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Add a Task" }).click();
  await page.locator("#task-title").fill("Study the biology chapter");
  await page.locator(".add-sheet button[type=submit]").click();
  const task = page.locator(".task-card").filter({ hasText: "Study the biology chapter" }).first();
  await task.waitFor({ state: "visible", timeout: 5000 });
  if (!(await task.locator(".task-main p").innerText()).trim()) throw new Error("Task micro-step is empty");
  await task.locator(".task-chevron").click();
  const focusPanel = page.locator(".focus-panel");
  await focusPanel.waitFor({ state: "visible" });
  await focusPanel.locator("textarea").fill("Opened the book and found the chapter.");
  await focusPanel.getByRole("button", { name: /Stop/ }).click();
  await focusPanel.waitFor({ state: "hidden" });
  await task.locator(".check-button").click();
  await task.waitFor({ state: "detached", timeout: 5000 });
  const completed = page.locator(".completed-task").filter({ hasText: "Study the biology chapter" }).first();
  await completed.waitFor({ state: "visible" });
  await completed.getByRole("button", { name: "Undo completion" }).click();
  const restored = page.locator(".task-card").filter({ hasText: "Study the biology chapter" }).first();
  await restored.waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Timed Plan", exact: true }).click();
  await page.locator("#plan-task").fill("Revise the biology chapter and make short notes");
  await page.locator(".planner-card button[type=submit]").click();
  const plan = page.locator(".generated-plan");
  await plan.waitFor({ state: "visible", timeout: 5000 });
  if (await plan.locator(".plan-step").count() < 3) throw new Error("Timed plan should contain multiple editable steps");
  await plan.getByRole("button", { name: /Start step/ }).click();
  await plan.getByRole("button", { name: /Pause/ }).click();

  await page.getByRole("button", { name: "My Buddy", exact: true }).click();
  await page.getByText("Your accountability buddy").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem("vinai.fresh.v1") || "{}");
    return saved.tasks?.some(item => item.title === "Study the biology chapter" && item.note === "Opened the book and found the chapter.");
  }, null, { timeout: 5000 });
  await page.reload({ waitUntil: "networkidle" });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("vinai.fresh.v1") || "{}"));
  if (!stored.tasks?.some(item => item.title === "Study the biology chapter")) throw new Error("Task did not survive reload");
  const forbidden = await page.getByText(/take photo|camera verification|photo proof/i).count();
  if (forbidden) throw new Error("Legacy camera/photo verification UI is still present");
  if (errors.length) throw new Error(`Browser page errors: ${errors.join(" | ")}`);
  await page.screenshot({ path: "vinai-mobile-browser-check.png", fullPage: true });
  console.log("Vinai reference redesign smoke test passed: responsive layout, slide-away completion/undo, focus notes, timed plan, buddy section, and local persistence.");
} finally { await browser.close(); if (server) await server.close(); }
