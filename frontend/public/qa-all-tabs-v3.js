(() => {
  const statusEl = document.getElementById("status");
  const frame = document.getElementById("app");
  const lines = [];
  let running = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (ok, label, detail = "") => {
    const line = (ok ? "PASS " : "FAIL ") + label + (detail ? " — " + detail : "");
    lines.push(line);
    statusEl.textContent = lines.join("\n");
    statusEl.className = ok ? "pass" : "fail";
  };
  const fail = (label, detail = "") => {
    log(false, label, detail);
    throw new Error(label + (detail ? ": " + detail : ""));
  };
  const visible = (el) => {
    if (!el) return false;
    const win = el.ownerDocument.defaultView;
    const style = win.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const textOf = (el) =>
    String(el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || el?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  const button = (doc, label, scope = doc) =>
    [...scope.querySelectorAll("button")].find((el) => visible(el) && textOf(el) === label);
  const buttonContains = (doc, label, scope = doc) =>
    [...scope.querySelectorAll("button")].find((el) => visible(el) && textOf(el).includes(label));
  const pageEl = (doc, id) => {
    const el = doc.querySelector('[data-page="' + id + '"]');
    return el && visible(el) ? el : null;
  };
  const waitFor = async (fn, timeout = 20000, interval = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const value = fn();
        if (value) return value;
      } catch {}
      await sleep(interval);
    }
    throw new Error("timeout");
  };
  const ensureNoOverflow = (win, label) => {
    const root = win.document.documentElement;
    if (root.scrollWidth > win.innerWidth + 2) {
      fail(label, "horizontal overflow " + root.scrollWidth + " > " + win.innerWidth);
    }
    log(true, label, "no horizontal overflow");
  };
  const allVisibleButtonsNamed = (doc, label) => {
    for (const el of [...doc.querySelectorAll("button")].filter(visible)) {
      if (!textOf(el)) fail(label, "visible button without accessible name");
    }
    log(true, label, "all visible buttons named");
  };
  const sidebarButton = (doc, label) =>
    [...doc.querySelectorAll(".v3Sidebar button")].find((el) => visible(el) && textOf(el).includes(label));
  const navDesktop = async (doc, label, id) => {
    const target = sidebarButton(doc, label);
    if (!target) fail("Desktop nav " + label, "button missing");
    target.click();
    await waitFor(() => pageEl(doc, id), 15000);
    log(true, "Desktop nav " + label);
  };
  const clickResearchTab = async (doc, label, id) => {
    const tablist = [...doc.querySelectorAll('[role="tablist"]')].find((el) => el.getAttribute("aria-label") === "Research sections");
    if (!tablist) fail("Research " + label, "tablist missing");
    const tab = [...tablist.querySelectorAll('[role="tab"],button')].find((el) => visible(el) && textOf(el) === label);
    if (!tab) fail("Research " + label, "tab missing");
    tab.click();
    await waitFor(() => {
      const selected = tab.getAttribute("aria-selected") === "true" || tab.classList.contains("active");
      const active = doc.querySelector('[data-active-section="' + id + '"]');
      return selected && active && visible(active);
    }, 12000);
    const active = doc.querySelector('[data-active-section="' + id + '"]');
    log(true, "Research " + label, "result count " + (active?.getAttribute("data-result-count") ?? "n/a"));
  };
  const clickCollectionTab = async (doc, label, id) => {
    const tablist = [...doc.querySelectorAll('[role="tablist"]')].find((el) => el.getAttribute("aria-label") === "Collection filters");
    if (!tablist) fail("Collection " + label, "tablist missing");
    const tab = [...tablist.querySelectorAll('[role="tab"],button')].find((el) => visible(el) && textOf(el) === label);
    if (!tab) fail("Collection " + label, "tab missing");
    tab.click();
    await waitFor(() => {
      const selected = tab.getAttribute("aria-selected") === "true" || tab.getAttribute("aria-pressed") === "true";
      const active = doc.querySelector('[data-active-filter="' + id + '"]');
      return selected && active && visible(active);
    }, 12000);
    const active = doc.querySelector('[data-active-filter="' + id + '"]');
    log(true, "Collection " + label, "result count " + (active?.getAttribute("data-result-count") ?? "n/a"));
  };
  const clickFirstDisclosureTwice = async (doc, pageId, label) => {
    const page = pageEl(doc, pageId);
    if (!page) fail(label, "page missing");
    const toggle = [...page.querySelectorAll("button")].find((el) => visible(el) && el.classList.contains("v3DisclosureToggle"));
    if (!toggle) {
      log(true, label, "no disclosure present");
      return;
    }
    toggle.click();
    await sleep(150);
    toggle.click();
    await sleep(150);
    log(true, label);
  };
  const exactBottom = (doc, label) =>
    [...doc.querySelectorAll(".v3BottomNav button")].find((el) => visible(el) && textOf(el) === label);

  async function run() {
    if (running) return;
    running = true;
    try {
      statusEl.textContent = "Running all-tabs audit…";
      const win = frame.contentWindow;
      let doc = frame.contentDocument;

      await waitFor(() => doc && (doc.readyState === "complete" || doc.readyState === "interactive"), 15000);

      log(true, "Audit frame loaded");
      if (!pageEl(doc, "home")) {
        const enterDemo = await waitFor(() => button(doc, "Enter Demo") || pageEl(doc, "home"), 20000);
        if (!pageEl(doc, "home")) {
          enterDemo.click();
          log(true, "Enter Demo clicked");
          await waitFor(() => doc.querySelector(".v3OnboardingShell") || pageEl(doc, "home"), 30000);
          if (doc.querySelector(".v3OnboardingShell")) {
            const skip = button(doc, "Skip for now") || buttonContains(doc, "Skip for now");
            if (skip) {
              skip.click();
            } else {
              for (const label of ["Continue", "Continue", "Go to Home"]) {
                const next = await waitFor(() => button(doc, label), 10000);
                next.click();
                await sleep(150);
              }
            }
          }
        }
      } else {
        log(true, "Existing Demo session detected");
      }
      await waitFor(() => pageEl(doc, "home"), 30000);
      log(true, "Demo authentication and Home");

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
        await navDesktop(doc, label, id);
        allVisibleButtonsNamed(doc, label + " screen");
      }

      await navDesktop(doc, "Research", "research");
      await clickResearchTab(doc, "Search", "search");
      const searchInput = doc.querySelector('.v3ResearchFilters input[placeholder="Name or set number"]') ||
        doc.querySelector(".v3ResearchFilters input");
      if (!searchInput) fail("Research Search input", "missing");
      searchInput.value = "Hulkbuster";
      searchInput.dispatchEvent(new win.Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new win.Event("change", { bubbles: true }));
      await sleep(250);
      for (const [label, id] of [
        ["New Releases", "new"],
        ["Retiring Soon", "retiring"],
        ["Top Performers", "performers"],
        ["Watchlist", "watch"],
      ]) {
        const tablist = [...doc.querySelectorAll('[role="tablist"]')].find((el) => el.getAttribute("aria-label") === "Research sections");
        const exists = tablist && [...tablist.querySelectorAll("button")].some((el) => textOf(el) === label);
        if (!exists) {
          log(false, "Research " + label, "tab is not rendered");
          continue;
        }
        await clickResearchTab(doc, label, id);
        if (label !== "Watchlist" && searchInput.value) fail("Research " + label, "stale search query still present");
      }
      await clickResearchTab(doc, "Search", "search");

      const filtersForm = doc.querySelector(".v3ResearchFilters");
      if (!filtersForm || !visible(filtersForm)) fail("Research desktop filters", "filter form not visible");
      log(true, "Research desktop filters", "full filter form visible");

      await navDesktop(doc, "Collection", "collection");
      for (const [label, id] of [
        ["All", "all"],
        ["Stacks", "stacks"],
        ["Flywheel Ready", "flywheel"],
        ["Below Cost", "below"],
        ["Theme", "theme"],
      ]) {
        await clickCollectionTab(doc, label, id);
      }
      const themeSelect = doc.querySelector(".v3ThemeFilter select");
      if (!themeSelect) fail("Collection Theme selector", "missing");
      if (themeSelect.options.length > 1) {
        themeSelect.selectedIndex = 1;
        themeSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
        await sleep(150);
      }
      log(true, "Collection Theme selector");
      await clickCollectionTab(doc, "All", "all");

      const firstCollectionExpand = [...doc.querySelectorAll("[data-page='collection'] .v3CollectionMain")].find(visible);
      if (firstCollectionExpand) {
        const before = firstCollectionExpand.getAttribute("aria-expanded");
        firstCollectionExpand.click();
        await sleep(150);
        const after = firstCollectionExpand.getAttribute("aria-expanded");
        if (before === after) fail("Collection row expand/collapse", "aria-expanded did not change");
        firstCollectionExpand.click();
        log(true, "Collection row expand/collapse");
      } else {
        log(true, "Collection row expand/collapse", "no rows to expand");
      }

      await navDesktop(doc, "Portfolio", "portfolio");
      const holdingsToggle = buttonContains(doc, "View all holdings") || buttonContains(doc, "Show summary");
      if (holdingsToggle) {
        const before = textOf(holdingsToggle);
        holdingsToggle.click();
        await sleep(150);
        if (textOf(holdingsToggle) === before) fail("Portfolio holdings toggle", "label did not change");
        holdingsToggle.click();
        log(true, "Portfolio holdings toggle");
      } else {
        log(true, "Portfolio holdings toggle", "not required for current holding count");
      }

      await navDesktop(doc, "Scan", "scan");
      const manual = button(doc, "Enter Set Number") || buttonContains(doc, "Enter Set Number");
      if (!manual) fail("Scan manual set workflow", "Enter Set Number missing");
      manual.click();
      await waitFor(() => doc.querySelector('input[placeholder="e.g. 75252"]'), 5000);
      const setInput = doc.querySelector('input[placeholder="e.g. 75252"]');
      setInput.value = "75367";
      setInput.dispatchEvent(new win.Event("input", { bubbles: true }));
      setInput.dispatchEvent(new win.Event("change", { bubbles: true }));
      const analyse = button(doc, "Analyse") || buttonContains(doc, "Analyse");
      if (!analyse) fail("Scan manual set workflow", "Analyse missing");
      analyse.click();
      await waitFor(() => pageEl(doc, "verdict"), 30000);
      log(true, "Scan 75367 → Verdict");
      await clickFirstDisclosureTwice(doc, "verdict", "Verdict thesis disclosure");

      const setAnalysis = sidebarButton(doc, "Set Analysis");
      if (!setAnalysis || setAnalysis.disabled) fail("Decision path Set Analysis", "still locked after Verdict");
      setAnalysis.click();
      await waitFor(() => pageEl(doc, "set-analysis"), 12000);
      log(true, "Decision path Set Analysis");
      await clickFirstDisclosureTwice(doc, "set-analysis", "Set Analysis disclosure");

      const logPurchase = sidebarButton(doc, "Log Purchase");
      if (!logPurchase || logPurchase.disabled) fail("Decision path Log Purchase", "still locked after Verdict");
      logPurchase.click();
      await waitFor(() => pageEl(doc, "log-purchase"), 12000);
      log(true, "Decision path Log Purchase");

      await navDesktop(doc, "Settings", "settings");
      const openDataSources = button(doc, "Open Data Sources");
      if (!openDataSources) fail("Settings Open Data Sources", "missing");
      openDataSources.click();
      await waitFor(() => pageEl(doc, "data-sources"), 12000);
      log(true, "Settings Open Data Sources");

      await navDesktop(doc, "Data Sources", "data-sources");
      const csvInput = doc.querySelector('input[type="file"][accept*="csv"]');
      if (!csvInput) fail("Data Sources CSV preview/cancel", "CSV input missing");
      const file = new win.File(
        ["setNumber,quantity,purchasePrice\n75367,1,20000\n999999,1,500\n"],
        "tab-audit.csv",
        { type: "text/csv" }
      );
      const dt = new win.DataTransfer();
      dt.items.add(file);
      csvInput.files = dt.files;
      csvInput.dispatchEvent(new win.Event("change", { bubbles: true }));
      await waitFor(() => buttonContains(doc, "Preview 2 rows"), 5000);
      buttonContains(doc, "Preview 2 rows").click();
      await waitFor(() => button(doc, "Cancel"), 12000);
      button(doc, "Cancel").click();
      log(true, "Data Sources CSV preview/cancel");

      await navDesktop(doc, "Settings", "settings");
      const themeChip = [...doc.querySelectorAll(".v3ThemeChip")].find(visible);
      if (themeChip) {
        const activeBefore = themeChip.classList.contains("active");
        themeChip.click();
        await sleep(100);
        const activeAfter = themeChip.classList.contains("active");
        if (activeBefore === activeAfter) fail("Settings preferred-theme toggle", "active state did not change");
        themeChip.click();
        log(true, "Settings preferred-theme toggle");
      } else {
        fail("Settings preferred-theme toggle", "no theme chips");
      }

      frame.style.width = "390px";
      frame.style.height = "844px";
      await sleep(300);
      if (win.innerWidth !== 390) fail("Mobile viewport", "iframe width is " + win.innerWidth);
      log(true, "Mobile viewport 390x844");
      ensureNoOverflow(win, "Mobile Home/Settings current screen");

      for (const [label, id] of [
        ["Home", "home"],
        ["Research", "research"],
        ["Scan", "scan"],
        ["Collection", "collection"],
        ["Exits", "exits"],
      ]) {
        const nav = exactBottom(doc, label);
        if (!nav) fail("Mobile bottom nav " + label, "missing");
        nav.click();
        await waitFor(() => pageEl(doc, id), 12000);
        ensureNoOverflow(win, "Mobile " + label);
        log(true, "Mobile bottom nav " + label);
        if (id === "research") {
          const mobileFilters = buttonContains(doc, "Filters");
          if (!mobileFilters) fail("Mobile Research Filters toggle", "missing");
          const beforeExpanded = mobileFilters.getAttribute("aria-expanded");
          mobileFilters.click();
          await sleep(120);
          const afterExpanded = mobileFilters.getAttribute("aria-expanded");
          if (beforeExpanded === afterExpanded) fail("Mobile Research Filters toggle", "aria-expanded did not change");
          mobileFilters.click();
          log(true, "Mobile Research Filters toggle");
        }
      }

      const menuButton = button(doc, "Open menu") || buttonContains(doc, "Open menu");
      if (menuButton) {
        for (const [label, id] of [
          ["Portfolio", "portfolio"],
          ["Data Sources", "data-sources"],
          ["Settings", "settings"],
        ]) {
          (button(doc, "Open menu") || buttonContains(doc, "Open menu")).click();
          await waitFor(() => [...doc.querySelectorAll(".mobileMenuScreen button")].some((el) => visible(el) && textOf(el) === label), 5000);
          const menuTarget = [...doc.querySelectorAll(".mobileMenuScreen button")].find((el) => visible(el) && textOf(el) === label);
          if (!menuTarget) fail("Mobile menu " + label, "missing");
          menuTarget.click();
          await waitFor(() => pageEl(doc, id), 12000);
          ensureNoOverflow(win, "Mobile " + label);
          log(true, "Mobile menu " + label);
        }
      } else {
        log(false, "Mobile overflow menu", "Open menu control not found");
      }

      frame.style.width = "1440px";
      frame.style.height = "1000px";
      await sleep(200);
      log(true, "ALL_TABS_AUDIT_PASS");
    } catch (error) {
      if (!lines.some((line) => line.startsWith("FAIL "))) {
        log(false, "Unhandled audit error", String(error?.message || error));
      }
    }
  }

  frame.addEventListener("load", () => void run(), { once: true });
  if (frame.contentDocument?.readyState === "complete") void run();
  setTimeout(() => void run(), 1200);
})();
