import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = process.env.BRICK_ALPHA_QA_URL || "http://127.0.0.1:5000";

async function expectPage(page, id) {
  await page.locator(`[data-page="${id}"]`).waitFor({ state: "visible", timeout: 15000 });
}

async function noOverflow(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert.ok(scrollWidth <= innerWidth + 2, `${label} overflow: ${scrollWidth} > ${innerWidth}`);
}

async function assertNamedVisibleButtons(page, label) {
  const buttons = page.locator("button:visible");
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const name = await button.evaluate((node) =>
      String(
        node.getAttribute("aria-label") ||
        node.getAttribute("title") ||
        node.textContent ||
        "",
      ).replace(/\\s+/g, " ").trim(),
    );
    assert.ok(name, `${label} contains a visible button without an accessible label`);
  }
}

async function completeOnboarding(page) {
  if (!(await page.locator(".v3OnboardingShell").isVisible().catch(() => false))) return;
  for (const [heading, button] of [
    ["Welcome to Brick Alpha", "Continue"],
    ["How you buy", "Continue"],
    ["Add your sets", "Go to Home"],
  ]) {
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    await page.getByRole("button", { name: button, exact: true }).click();
  }
  await expectPage(page, "home");
}

function sidebarButton(page, label) {
  return page.locator(".v3Sidebar button").filter({
    has: page.getByText(label, { exact: true }),
  }).first();
}

async function nav(page, label, id) {
  await sidebarButton(page, label).click();
  await expectPage(page, id);
}

async function mobileMenu(page) {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const menu = page.locator(".mobileMenuScreen");
  await menu.waitFor({ state: "visible" });
  return menu;
}

function exactMenuButton(page, menu, label) {
  return menu.locator("button").filter({ has: page.getByText(label, { exact: true }) }).first();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Enter Demo", exact: true }).click();
  await page.locator(".v3OnboardingShell, [data-page='home']").first().waitFor({ timeout: 15000 });
  await completeOnboarding(page);

  const sidebar = page.locator(".v3Sidebar");
  const sidebarText = await sidebar.innerText();
  for (const label of ["Home", "Research", "Scan", "Collection", "Portfolio", "Exits", "Data Sources", "Settings"]) {
    assert.ok(sidebarText.includes(label), `Missing desktop nav: ${label}`);
  }
  for (const legacy of ["News", "Trading", "Crypto", "Forex", "ETFs", "JSE", "Subscriptions"]) {
    assert.ok(!sidebarText.includes(legacy), `Legacy desktop nav visible: ${legacy}`);
  }
  for (const [label, id] of [
    ["Home", "home"],
    ["Research", "research"],
    ["Scan", "scan"],
    ["Collection", "collection"],
    ["Portfolio", "portfolio"],
    ["Exits", "exits"],
    ["Data Sources", "data-sources"],
    ["Settings", "settings"],
  ]) {
    await nav(page, label, id);
    await assertNamedVisibleButtons(page, label);
  }
  await nav(page, "Home", "home");

  for (const label of ["Verdict", "Set Analysis", "Log Purchase"]) {
    assert.equal(
      await sidebarButton(page, label).isDisabled(),
      true,
      `${label} should be locked before Scan`,
    );
  }

  await nav(page, "Settings", "settings");
  const rate = page.locator('input[name="usdZarRate"]');
  assert.equal(Number(await rate.inputValue()), 18.5);
  await rate.fill("19");
  await page.getByRole("button", { name: "Save rate", exact: true }).click();
  await page.getByRole("button", { name: "Save investment profile", exact: true }).click();
  await page.getByText("Investment profile saved.", { exact: true }).waitFor();
  await nav(page, "Research", "research");
  await nav(page, "Settings", "settings");
  assert.equal(Number(await page.locator('input[name="usdZarRate"]').inputValue()), 19);
  await assertNamedVisibleButtons(page, "Settings");
  await page.locator('input[name="usdZarRate"]').fill("18.50");
  await page.getByRole("button", { name: "Save rate", exact: true }).click();

  await page.getByRole("button", { name: "Open Data Sources", exact: true }).click();
  await expectPage(page, "data-sources");
  const apiKey = page.locator('input[type="password"]');
  assert.equal(await apiKey.count(), 1, "BrickEconomy key must use a masked password field");
  assert.equal(await page.getByRole("button", { name: "Test & connect", exact: true }).isDisabled(), true);
  await assertNamedVisibleButtons(page, "Data Sources");
  const csv = page.locator('input[type="file"][accept*="csv"]');
  await csv.setInputFiles({
    name: "qa-mixed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "setNumber,quantity,purchasePrice,purchaseDate,condition,retailer,shipping,rewards\n" +
      "75367,1,20000,2026-09-29,Sealed,QA Retailer,100,50\n" +
      "999999,1,500,2026-09-29,Sealed,QA Retailer,0,0\n",
    ),
  });
  await page.getByRole("button", { name: "Preview 2 rows", exact: true }).click();
  await page.getByText(/1 ready .* 1 need attention/).waitFor();
  assert.match(await page.locator(".v3ImportTable").innerText(), /catalogue/i);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByText("Import cancelled. Nothing was written.", { exact: true }).waitFor();

  await csv.setInputFiles({
    name: "qa-valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "setNumber,quantity,purchasePrice,purchaseDate,condition,retailer,shipping,rewards\n" +
      "75367,1,20000,2026-09-29,Sealed,QA Retailer,100,50\n",
    ),
  });
  await page.getByRole("button", { name: "Preview 1 rows", exact: true }).click();
  await page.getByText(/1 ready .* 0 need attention/).waitFor();
  await page.getByRole("button", { name: "Import 1 valid rows", exact: true }).click();
  await page.getByText(/1 collection position imported\./).waitFor();
  await nav(page, "Collection", "collection");
  assert.match(await page.locator("[data-page='collection']").innerText(), /#75367/);

  await nav(page, "Scan", "scan");
  await page.getByRole("button", { name: "Enter Set Number", exact: true }).click();
  await page.locator('input[placeholder="e.g. 75252"]').fill("75367");
  await page.getByRole("button", { name: "Analyse", exact: true }).click();
  await expectPage(page, "verdict");
  await assertNamedVisibleButtons(page, "Verdict");
  const verdict = await page.locator("[data-page='verdict']").innerText();
  assert.match(verdict, /75367/);
  assert.match(verdict, /BrickEconomy/i);
  assert.ok(/Buy ×2 flywheel|Buy ×1|Only below R|Skip/.test(verdict), "Canonical verdict label missing");

  const analysisButton = sidebarButton(page, "Set Analysis");
  assert.equal(await analysisButton.isDisabled(), false);
  await analysisButton.click();
  await expectPage(page, "set-analysis");
  await assertNamedVisibleButtons(page, "Set Analysis");
  const analysis = (await page.locator("[data-page='set-analysis']").innerText()).toLowerCase();
  for (const factor of ["time on", "theme strength", "time to retirement", "minifig", "reprint risk", "retirement pop", "how many to buy", "when to sell one unit", "recycle the cash"]) {
    assert.ok(analysis.includes(factor), `Missing set-analysis factor: ${factor}`);
  }

  await sidebarButton(page, "Log Purchase").click();
  await expectPage(page, "log-purchase");
  await assertNamedVisibleButtons(page, "Log Purchase");
  assert.match(await page.locator("[data-page='log-purchase']").innerText(), /75367/);

  await nav(page, "Settings", "settings");
  await page.getByRole("button", { name: "Reset Demo", exact: true }).click();
  await page.locator(".v3OnboardingShell").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expectPage(page, "home");
  await nav(page, "Collection", "collection");
  await assertNamedVisibleButtons(page, "Collection");
  const resetCollection = await page.locator("[data-page='collection']").innerText();
  assert.match(resetCollection, /Positions\s+292/, "Reset Demo did not restore Gavin V152 position count");
  assert.match(resetCollection, /Unique sets\s+195/, "Reset Demo did not restore Gavin V152 unique-set count");
  assert.match(resetCollection, /Stacks\s+66/, "Reset Demo did not restore Gavin V152 stack count");
  await nav(page, "Settings", "settings");
  assert.equal(Number(await page.locator('input[name="usdZarRate"]').inputValue()), 18.5);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".v3BottomNav").getByRole("button", { name: "Home", exact: true }).click();
  await expectPage(page, "home");
  const bottom = await page.locator(".v3BottomNav").innerText();
  for (const label of ["Home", "Research", "Scan", "Collection", "Exits"]) assert.ok(bottom.includes(label));
  assert.ok(!bottom.includes("Portfolio"), "Portfolio should not crowd mobile bottom nav");
  await noOverflow(page, "Home");

  for (const [label, id] of [["Research", "research"], ["Scan", "scan"], ["Collection", "collection"], ["Exits", "exits"]]) {
    await page.locator(".v3BottomNav").getByRole("button", { name: label, exact: true }).click();
    await expectPage(page, id);
    await noOverflow(page, label);
    await assertNamedVisibleButtons(page, `${label} mobile`);
  }

  let menu = await mobileMenu(page);
  const menuText = await menu.innerText();
  for (const label of ["Research", "Collection", "Portfolio", "Exits", "Data Sources", "Settings"]) assert.ok(menuText.includes(label), `Missing mobile menu: ${label}`);
  for (const legacy of ["News", "Trading", "Crypto", "Forex", "ETFs", "JSE", "Subscriptions"]) assert.ok(!menuText.includes(legacy), `Legacy mobile item visible: ${legacy}`);

  await menu.getByRole("button", { name: /^Portfolio\b/ }).click();
  await expectPage(page, "portfolio");
  await noOverflow(page, "Portfolio");
  await assertNamedVisibleButtons(page, "Portfolio mobile");

  menu = await mobileMenu(page);
  await menu.getByRole("button", { name: /^Data Sources\b/ }).first().click();
  await expectPage(page, "data-sources");
  await noOverflow(page, "Data Sources");
  await assertNamedVisibleButtons(page, "Data Sources mobile");

  menu = await mobileMenu(page);
  await menu.getByRole("button", { name: /^Settings\b/ }).click();
  await expectPage(page, "settings");
  await noOverflow(page, "Settings");
  await assertNamedVisibleButtons(page, "Settings mobile");

  console.log("BRICK_ALPHA_BROWSER_QA_PASS");
} finally {
  await browser.close();
}
