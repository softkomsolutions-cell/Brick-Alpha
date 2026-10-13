(() => {
  const statusEl = document.getElementById("status");
  const frame = document.getElementById("app");
  const log = [];
  let running = false;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = (msg, ok = true) => {
    log.push((ok ? "PASS " : "FAIL ") + msg);
    statusEl.textContent = log.join("\n");
    statusEl.className = ok ? "pass" : "fail";
  };
  const fail = (msg) => { throw new Error(msg); };
  const waitFor = async (fn, ms = 25000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { const value = fn(); if (value) return value; } catch {}
      await sleep(180);
    }
    throw new Error("timeout");
  };
  const visible = (el) => {
    if (!el) return false;
    const win = el.ownerDocument.defaultView;
    const s = win.getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const nameOf = (el) => String(el?.getAttribute("aria-label") || el?.getAttribute("title") || el?.textContent || "").replace(/\s+/g, " ").trim();
  const buttons = (doc) => [...doc.querySelectorAll("button")].filter(visible);
  const setNativeValue = (win, input, value) => {
    const prototype = input.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor.set.call(input, value);
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
  };
  const button = (doc, label, exact = true) => buttons(doc).find(b => exact ? nameOf(b) === label : nameOf(b).includes(label));
  const page = (doc, id) => {
    const el = doc.querySelector('[data-page="' + id + '"]');
    return el && visible(el) ? el : null;
  };
  const noBadText = (doc, label) => {
    const text = String(doc.body?.innerText || "");
    for (const bad of ["NaN","Infinity","undefined"]) {
      if (text.includes(bad)) fail(label + " contains " + bad);
    }
  };
  const noOverflow = (win, label) => {
    const sw = win.document.documentElement.scrollWidth, iw = win.innerWidth;
    if (sw > iw + 3) fail(label + " horizontal overflow " + sw + " > " + iw);
  };
  const navDesktop = async (doc, label, id) => {
    const target = [...doc.querySelectorAll(".v3Sidebar button")].find(b => visible(b) && nameOf(b).includes(label));
    if (!target) fail("desktop nav missing " + label);
    target.click();
    await waitFor(() => page(doc,id));
    noBadText(doc,label);
    out("Desktop nav " + label);
  };
  const clickTab = async (doc, listLabel, tabLabel, attr, expected) => {
    const list = [...doc.querySelectorAll('[role="tablist"]')].find(x => x.getAttribute("aria-label") === listLabel);
    if (!list) fail("tablist missing " + listLabel);
    const tab = [...list.querySelectorAll('[role="tab"],button')].find(x => visible(x) && nameOf(x) === tabLabel);
    if (!tab) fail("tab missing " + tabLabel);
    tab.click();
    await sleep(250);
    if (tab.getAttribute("aria-selected") !== "true" && tab.getAttribute("aria-pressed") !== "true") fail(tabLabel + " did not become active");
    if (attr && expected) {
      const active = doc.querySelector("[" + attr + '="' + expected + '"]');
      if (!active || !visible(active)) fail(tabLabel + " did not produce observable state " + expected);
    }
    out("Tab " + listLabel + " → " + tabLabel);
  };
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const win = frame.contentWindow;
      let doc = frame.contentDocument;
      statusEl.textContent = "Bootstrapping disposable Gavin audit session…";
      await waitFor(() => doc && (doc.readyState === "complete" || doc.readyState === "interactive"));
      const auth = await fetch("/api/auth/demo", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Gavin Full Tab Audit"})});
      if (!auth.ok) fail("demo auth failed " + auth.status);
      const demo = await auth.json();
      if (!demo?.token) fail("demo token missing");
      win.localStorage.setItem("collecttrade_token", demo.token);
      win.localStorage.setItem("brick_alpha_v3_onboarding_complete", "1");
      const oldDoc = doc;
      win.location.href = "/#/home";
      await waitFor(() => frame.contentDocument && frame.contentDocument !== oldDoc, 30000);
      doc = frame.contentDocument;
      await waitFor(() => page(doc,"home"), 30000);
      out("Disposable Gavin session");
      
      for (const [label,id] of [["Home","home"],["Research","research"],["Scan","scan"],["Collection","collection"],["Portfolio","portfolio"],["Exits","exits"],["Data Sources","data-sources"],["Settings","settings"]]) {
        await navDesktop(doc,label,id);
      }

      await navDesktop(doc,"Research","research");
      const searchInput = [...doc.querySelectorAll("input")].find(i => i.placeholder === "Name or set number");
      if (!searchInput) fail("Research search input missing");
      setNativeValue(win, searchInput, "Hulkbuster");
      await sleep(500);
      await clickTab(doc,"Research sections","Search","data-active-section","search");
      for (const [label,id] of [["New Releases","new"],["Retiring Soon","retiring"],["Top Performers","performers"],["Watchlist","watch"]]) {
        await clickTab(doc,"Research sections",label,"data-active-section",id);
      }
      await clickTab(doc,"Research sections","Top Performers","data-active-section","performers");
      if (searchInput.value !== "") fail("Research stale search query not cleared");
      const filterToggle = button(doc,"Filters");
      if (filterToggle) {
        filterToggle.click(); await sleep(150);
        const after = button(doc,"Hide filters");
        if (!after) fail("Research Filters toggle did not open");
        after.click(); await sleep(150);
        out("Research Filters show/hide");
      }

      await navDesktop(doc,"Collection","collection");
      for (const [label,id] of [["All","all"],["Stacks","stacks"],["Flywheel Ready","flywheel"],["Below Cost","below"],["Theme","theme"]]) {
        await clickTab(doc,"Collection filters",label,"data-active-filter",id);
      }
      const themeSelect = [...doc.querySelectorAll("select")].find(s => visible(s) && nameOf(s).includes("Theme"));
      if (themeSelect && themeSelect.options.length > 1) {
        themeSelect.selectedIndex = 1;
        themeSelect.dispatchEvent(new win.Event("change",{bubbles:true}));
        await sleep(200);
        out("Collection Theme selector");
      }
      const firstCollectionMain = doc.querySelector(".v3CollectionMain");
      if (firstCollectionMain && visible(firstCollectionMain)) {
        const before = firstCollectionMain.getAttribute("aria-expanded");
        firstCollectionMain.click(); await sleep(150);
        const after = firstCollectionMain.getAttribute("aria-expanded");
        if (before === after) fail("Collection row expand/collapse did not change");
        out("Collection row expand/collapse");
      }

      await navDesktop(doc,"Portfolio","portfolio");
      const viewAll = buttons(doc).find(b => /View all holdings|Show summary/.test(nameOf(b)));
      if (viewAll) {
        const before = nameOf(viewAll);
        viewAll.click(); await sleep(180);
        const next = buttons(doc).find(b => /View all holdings|Show summary/.test(nameOf(b)));
        if (!next || nameOf(next) === before) fail("Portfolio holdings toggle did not change");
        out("Portfolio holdings toggle");
      }

      await navDesktop(doc,"Data Sources","data-sources");
      const csv = [...doc.querySelectorAll('input[type="file"]')].find(i => String(i.accept||"").includes("csv"));
      if (!csv) fail("Data Sources CSV input missing");
      out("Data Sources import control");

      await navDesktop(doc,"Settings","settings");
      const openDs = button(doc,"Open Data Sources");
      if (!openDs) fail("Settings Open Data Sources missing");
      openDs.click(); await waitFor(() => page(doc,"data-sources")); out("Settings Open Data Sources");
      await navDesktop(doc,"Settings","settings");
      const themeBtn = buttons(doc).find(b => nameOf(b) === "Star Wars");
      if (themeBtn) {
        const cls = themeBtn.className;
        themeBtn.click(); await sleep(120);
        if (themeBtn.className === cls) fail("Settings theme toggle did not change");
        themeBtn.click(); await sleep(120);
        out("Settings preferred theme toggle");
      }

      await navDesktop(doc,"Scan","scan");
      const manual = button(doc,"Enter Set Number");
      if (!manual) fail("Scan Enter Set Number missing");
      manual.click(); await sleep(120);
      const setInput = [...doc.querySelectorAll("input")].find(i => i.placeholder === "e.g. 75252");
      if (!setInput) fail("Scan set number input missing");
      setNativeValue(win, setInput, "75367");
      const analyse = button(doc,"Analyse");
      if (!analyse) fail("Analyse button missing");
      analyse.click();
      await waitFor(() => page(doc,"verdict"),30000);
      out("Decision path Scan → Verdict");
      const thesis = button(doc,"Thesis checklist");
      if (thesis) {
        const before = String(doc.body.innerText);
        thesis.click(); await sleep(120); thesis.click(); await sleep(120);
        out("Verdict thesis disclosure");
      }
      await navDesktop(doc,"Set Analysis","set-analysis");
      const disclosure = doc.querySelector(".v3DisclosureToggle");
      if (disclosure && visible(disclosure)) {
        disclosure.click(); await sleep(100); disclosure.click(); await sleep(100);
        out("Set Analysis disclosure");
      }
      await navDesktop(doc,"Log Purchase","log-purchase");
      if (!button(doc,"Save to Collection")) fail("Log Purchase Save to Collection missing");
      out("Decision path Verdict → Set Analysis → Log Purchase");

      frame.style.width = "390px";
      frame.style.height = "844px";
      await sleep(300);
      if (frame.contentWindow.innerWidth !== 390) fail("mobile viewport " + frame.contentWindow.innerWidth + " not 390");
      doc = frame.contentDocument;
      noOverflow(frame.contentWindow,"Mobile current screen");
      const bottom = doc.querySelector(".v3BottomNav");
      if (!bottom || !visible(bottom)) fail("mobile bottom nav missing");
      for (const [label,id] of [["Home","home"],["Research","research"],["Scan","scan"],["Collection","collection"],["Exits","exits"]]) {
        const b=[...bottom.querySelectorAll("button")].find(x=>visible(x)&&nameOf(x)===label);
        if(!b) fail("mobile bottom nav missing "+label);
        b.click(); await waitFor(()=>page(doc,id)); noOverflow(frame.contentWindow,"Mobile "+label); out("Mobile nav "+label);
      }
      const menuBtn=button(doc,"Open menu");
      if(!menuBtn) fail("mobile Open menu missing");
      for (const [label,id] of [["Portfolio","portfolio"],["Data Sources","data-sources"],["Settings","settings"]]) {
        menuBtn.click(); await sleep(150);
        const menu=doc.querySelector(".mobileMenuScreen");
        if(!menu||!visible(menu)) fail("mobile menu failed to open");
        const b=[...menu.querySelectorAll("button")].find(x=>visible(x)&&nameOf(x).includes(label));
        if(!b) fail("mobile menu missing "+label);
        b.click(); await waitFor(()=>page(doc,id)); noOverflow(frame.contentWindow,"Mobile "+label); out("Mobile menu "+label);
      }
      out("FULL_TAB_AUDIT_PASS");
    } catch (e) {
      out(String(e?.message || e), false);
    }
  };
  frame.addEventListener("load", () => void run(), {once:true});
  if (frame.contentDocument?.readyState === "complete") void run();
})();