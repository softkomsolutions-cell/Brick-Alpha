import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...parts) => fs.readFileSync(path.join(here, "..", "src", ...parts), "utf8");

test("LEGO Settings surface only exposes live Gavin controls", () => {
  const settings = src("v3", "screens", "SettingsScreen.jsx");
  assert.match(settings, /Open Data Sources/);
  assert.match(settings, /usdZarRate/);
  assert.match(settings, /Reset Demo/);
  assert.doesNotMatch(settings, /Subscriptions|Trading|Crypto|Forex|ETFs|JSE/);
});

test("LEGO mobile menu has Portfolio, Data Sources and Settings without dead feedback", () => {
  const app = src("App.jsx");
  assert.match(app, /id: "menu-portfolio"/);
  assert.match(app, /id: "menu-data-sources"/);
  assert.match(app, /"menu-home", "menu-data-sources", "menu-settings"/);
  assert.match(app, /onOpenFeedback=\{legoJourneyActive \? undefined/);
  assert.match(app, /\["menu-inbox", "menu-logout"\]/);
});

test("390px-compatible v3 surfaces collapse wide grids before phone width", () => {
  const css = src("v3", "v3Layout.css");
  assert.match(css, /@media\(max-width:760px\).*?v3DataSourceGrid\{grid-template-columns:1fr\}/s);
  assert.match(css, /@media\(max-width:620px\).*?v3PurchaseGrid\{grid-template-columns:1fr\}/s);
  assert.match(css, /@media \(max-width:600px\).*?v3PortfolioKpis \{ grid-template-columns:1fr 1fr; \}/s);
  assert.match(css, /@media\(max-width:720px\).*?v3CollectionStats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/s);
});

test("Data Sources presents a cancellable confirmed import flow", () => {
  const data = src("v3", "screens", "DataSourcesScreen.jsx");
  assert.match(data, /importId: preview\?\.importId/);
  assert.match(data, />Cancel<\/button>/);
  assert.match(data, /Nothing is written until you confirm this import/);
  assert.match(data, /already committed\. Nothing was duplicated/);
});
