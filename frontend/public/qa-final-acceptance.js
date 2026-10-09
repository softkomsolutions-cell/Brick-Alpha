(() => {
  const statusEl = document.getElementById("status");
  const frame = document.getElementById("app");
  const log = [];
  const out = (msg, ok = true) => {
    log.push((ok ? "PASS " : "FAIL ") + msg);
    statusEl.textContent = log.join("\n");
    statusEl.className = ok ? "pass" : "fail";
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (fn, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        const value = fn();
        if (value) return value;
      } catch {}
      await sleep(200);
    }
    throw new Error("timeout");
  };
  const visible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const button = (doc, label) =>
    [...doc.querySelectorAll("button")].find((candidate) => {
      if (!visible(candidate)) return false;
      return String(
        candidate.getAttribute("aria-label") ||
        candidate.getAttribute("title") ||
        candidate.textContent ||
        "",
      ).replace(/\s+/g, " ").trim() === label;
    });
  const page = (doc, id) => {
    const el = doc.querySelector('[data-page="' + id + '"]');
    return el && visible(el) ? el : null;
  };
  const noOverflow = (win, label) => {
    const scrollWidth = win.document.documentElement.scrollWidth;
    const innerWidth = win.innerWidth;
    if (scrollWidth > innerWidth + 2) throw new Error(label + " overflow " + scrollWidth + " > " + innerWidth);
  };
  const namedButtons = (doc, label) => {
    for (const candidate of [...doc.querySelectorAll("button")].filter(visible)) {
      const name = String(
        candidate.getAttribute("aria-label") ||
        candidate.getAttribute("title") ||
        candidate.textContent ||
        "",
      ).replace(/\s+/g, " ").trim();
      if (!name) throw new Error(label + " unnamed visible button");
    }
  };
  const upcBits = (code) => {
    const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
    const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
    return "101" + code.slice(0, 6).split("").map((d) => L[+d]).join("") +
      "01010" + code.slice(6).split("").map((d) => R[+d]).join("") + "101";
  };
  const barcodeFile = (win, code) => {
    const bits = upcBits(code);
    const quiet = 12;
    const moduleWidth = 4;
    const height = 180;
    const canvas = win.document.createElement("canvas");
    canvas.width = (bits.length + quiet * 2) * moduleWidth;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, height);
    context.fillStyle = "#000";
    for (let i = 0; i < bits.length; i += 1) {
      if (bits[i] === "1") context.fillRect((quiet + i) * moduleWidth, 10, moduleWidth, 150);
    }
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(new win.File([blob], "barcode-673419340618.png", { type: "image/png" })), "image/png");
    });
  };
  const gotoMobile = async (doc, win, label, id) => {
    let target = button(doc, label);
    if (!target) {
      const menu = button(doc, "Open menu");
      if (menu) {
        menu.click();
        await sleep(250);
        target = button(doc, label);
      }
    }
    if (!target) throw new Error("missing nav " + label);
    target.click();
    await waitFor(() => page(doc, id));
    noOverflow(win, label);
    namedButtons(doc, label);
  };
  const completeOnboarding = async (doc) => {
    if (!doc.querySelector(".v3OnboardingShell")) return;
    for (const label of ["Continue", "Continue", "Go to Home"]) {
      await waitFor(() => button(doc, label));
      button(doc, label).click();
      await sleep(300);
    }
  };
  const runAcceptance = async () => {
    try {
      statusEl.textContent = "Running exact 390px + barcode acceptance…";
      const win = frame.contentWindow;
      const doc = win.document;
      await waitFor(() => doc.readyState === "complete" || doc.readyState === "interactive");
      await waitFor(() => button(doc, "Enter Demo"), 30000);
      button(doc, "Enter Demo").click();
      await waitFor(() => doc.querySelector(".v3OnboardingShell") || page(doc, "home"), 30000);
      await completeOnboarding(doc);
      await waitFor(() => page(doc, "home"), 30000);
      if (win.innerWidth !== 390) throw new Error("iframe viewport is " + win.innerWidth + ", expected 390");
      noOverflow(win, "Home");
      namedButtons(doc, "Home");
      out("390px Home");
      for (const [label, id] of [
        ["Research", "research"],
        ["Scan", "scan"],
        ["Collection", "collection"],
        ["Exits", "exits"],
        ["Portfolio", "portfolio"],
        ["Data Sources", "data-sources"],
        ["Settings", "settings"],
      ]) {
        await gotoMobile(doc, win, label, id);
        out("390px " + label);
      }
      await gotoMobile(doc, win, "Scan", "scan");
      const upload = button(doc, "Upload Barcode Image");
      if (!upload) throw new Error("Upload Barcode Image control missing");
      const input = doc.querySelector("#brick-alpha-barcode-image-input");
      if (!input) throw new Error("accessible barcode input missing");
      const file = await barcodeFile(win, "673419340618");
      const transfer = new win.DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new win.Event("change", { bubbles: true }));
      await waitFor(() => page(doc, "verdict"), 40000);
      const verdictText = page(doc, "verdict").textContent || "";
      if (!/75313/.test(verdictText)) throw new Error("barcode did not resolve to LEGO set 75313");
      out("UPC 673419340618 image decoded and resolved to LEGO 75313");
      out("FINAL_ACCEPTANCE_PASS");
    } catch (error) {
      out(String(error?.message || error), false);
    }
  };
  frame.addEventListener("load", () => void runAcceptance(), { once: true });
  if (frame.contentDocument?.readyState === "complete") void runAcceptance();
})();
