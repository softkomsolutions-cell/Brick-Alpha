(() => {
  const statusEl = document.getElementById("status");
  const frame = document.getElementById("app");
  const lines = [];
  let running = false;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const visible = (el) => {
    if (!el) return false;
    const w = el.ownerDocument.defaultView, s = w.getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const textOf = (el) => String(el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || el?.textContent || "").replace(/\s+/g," ").trim();
  const button = (doc,label,scope=doc) => [...scope.querySelectorAll("button")].find(el=>visible(el)&&textOf(el)===label);
  const buttonContains = (doc,label,scope=doc) => [...scope.querySelectorAll("button")].find(el=>visible(el)&&textOf(el).includes(label));
  const pageEl = (doc,id) => { const el=doc.querySelector('[data-page="'+id+'"]'); return el&&visible(el)?el:null; };
  const waitFor = async(fn,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const v=fn();if(v)return v}catch{}await sleep(150)}throw new Error("timeout");};
  const log=(ok,label,detail="")=>{lines.push((ok?"PASS ":"FAIL ")+label+(detail?" — "+detail:""));statusEl.textContent=lines.join("\n");statusEl.className=ok?"pass":"fail";};
  const fail=(label,detail="")=>{log(false,label,detail);throw new Error(label);};
  const noOverflow=(win,label)=>{const sw=win.document.documentElement.scrollWidth,iw=win.innerWidth;if(sw>iw+2)fail(label,"overflow "+sw+" > "+iw);log(true,label,"no horizontal overflow");};
  const bottom=(doc,label)=>[...doc.querySelectorAll(".v3BottomNav button")].find(el=>{
    if(!visible(el)) return false;
    const aria=String(el.getAttribute("aria-label")||"").trim();
    const strong=String(el.querySelector("strong")?.textContent||"").trim();
    return aria===label || strong===label || textOf(el).includes(label);
  });

  async function run(){
    if(running)return; running=true;
    try{
      let doc;
      await waitFor(()=>{doc=frame.contentDocument;return doc&&(doc.readyState==="interactive"||doc.readyState==="complete");},30000);
      const win=frame.contentWindow;
      if(win.innerWidth!==390) fail("Mobile viewport","expected 390, got "+win.innerWidth);
      log(true,"Mobile viewport","390x844 from initial load");

      win.location.hash = "#/home";
      await sleep(800);
      doc = frame.contentDocument;
      if (!pageEl(doc, "home")) {
        const enter = button(doc, "Enter Demo");
        if (enter) {
          enter.click();
          await waitFor(() => doc.querySelector(".v3OnboardingShell") || doc.querySelector("[data-page]"), 30000);
          if (doc.querySelector(".v3OnboardingShell")) {
            const skip = button(doc, "Skip for now") || buttonContains(doc, "Skip for now");
            if (skip) skip.click();
          }
          win.location.hash = "#/home";
        }
      }
      await waitFor(() => {
        doc = frame.contentDocument;
        return pageEl(doc, "home");
      }, 30000);
      noOverflow(win,"Mobile Home");

      for(const [label,id] of [["Home","home"],["Research","research"],["Scan","scan"],["Collection","collection"],["Exits","exits"]]){
        const nav=bottom(doc,label);
        if(!nav) fail("Mobile bottom nav "+label,"missing");
        nav.click();
        await waitFor(()=>pageEl(doc,id),12000);
        noOverflow(win,"Mobile "+label);
        log(true,"Mobile bottom nav "+label);
        if(id==="research"){
          const toggle=buttonContains(doc,"Filters");
          if(!toggle) fail("Mobile Research Filters","missing");
          const before=toggle.getAttribute("aria-expanded");
          toggle.click(); await sleep(150);
          const after=toggle.getAttribute("aria-expanded");
          if(before===after) fail("Mobile Research Filters","toggle state did not change");
          toggle.click();
          log(true,"Mobile Research Filters");
          const tabs=[["Search","search"],["New Releases","new"],["Retiring Soon","retiring"],["Top Performers","performers"],["Watchlist","watch"]];
          for(const [tabLabel,section] of tabs){
            const t=[...doc.querySelectorAll('[aria-label="Research sections"] button')].find(el=>visible(el)&&textOf(el)===tabLabel);
            if(!t) fail("Mobile Research "+tabLabel,"missing");
            t.click();
            await waitFor(()=>doc.querySelector('[data-active-section="'+section+'"]'),10000);
            log(true,"Mobile Research "+tabLabel);
          }
        }
        if(id==="collection"){
          for(const [tabLabel,fid] of [["All","all"],["Stacks","stacks"],["Flywheel Ready","flywheel"],["Below Cost","below"],["Theme","theme"]]){
            const t=[...doc.querySelectorAll('[aria-label="Collection filters"] button')].find(el=>visible(el)&&textOf(el)===tabLabel);
            if(!t) fail("Mobile Collection "+tabLabel,"missing");
            t.click();
            await waitFor(()=>doc.querySelector('[data-active-filter="'+fid+'"]'),10000);
            log(true,"Mobile Collection "+tabLabel);
          }
        }
      }

      for(const [label,id] of [["Portfolio","portfolio"],["Data Sources","data-sources"],["Settings","settings"]]){
        const open=button(doc,"Open menu")||buttonContains(doc,"Open menu");
        if(!open) fail("Mobile menu "+label,"Open menu missing");
        open.click();
        const menu=await waitFor(()=>doc.querySelector(".mobileMenuScreen"),5000);
        const target=[...menu.querySelectorAll("button")].find(el=>visible(el)&&textOf(el)===label);
        if(!target) fail("Mobile menu "+label,"item missing");
        target.click();
        await waitFor(()=>pageEl(doc,id),12000);
        noOverflow(win,"Mobile "+label);
        log(true,"Mobile menu "+label);
      }
      log(true,"MOBILE_TABS_AUDIT_PASS");
    }catch(e){if(!lines.some(x=>x.startsWith("FAIL ")))log(false,"Unhandled mobile audit error",String(e?.message||e));}
  }
  frame.addEventListener("load",()=>void run(),{once:true});
  setTimeout(()=>void run(),1200);
})();