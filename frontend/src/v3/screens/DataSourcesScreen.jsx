import { useEffect, useMemo, useState } from "react";

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const split = (line) => {
    const out = []; let value = ""; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted;
      } else if (ch === "," && !quoted) { out.push(value.trim()); value = ""; } else value += ch;
    }
    out.push(value.trim()); return out;
  };
  const headers = split(lines[0]).map((item) => item.replace(/\s+/g, "").toLowerCase());
  const aliases = {
    setnumber: "setNumber", set: "setNumber", sku: "setNumber", quantity: "quantity", qty: "quantity",
    purchaseprice: "purchasePrice", price: "purchasePrice", cost: "purchasePrice", purchasedate: "purchaseDate",
    date: "purchaseDate", condition: "condition", retailer: "retailer", source: "retailer", shipping: "shipping",
    vatreclaim: "vatReclaim", rewards: "rewards", cashback: "cashback", vouchers: "vouchers",
  };
  return lines.slice(1).map((line) => {
    const values = split(line); const row = {};
    headers.forEach((header, index) => { if (aliases[header]) row[aliases[header]] = values[index] ?? ""; });
    return row;
  });
}

export function DataSourcesScreen({ authToken, requestJson, onImported }) {
  const [source, setSource] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);

  const load = async () => {
    const data = await requestJson("/api/data-sources", { token: authToken });
    setSource(data);
  };
  useEffect(() => { load().catch((error) => setStatus(error.message)); }, [authToken]);
  const validRows = useMemo(() => (preview?.rows || []).filter((row) => row.valid), [preview]);

  const connect = async () => {
    setBusy("connect"); setStatus("");
    try {
      const data = await requestJson("/api/data-sources/brickeconomy", { method: "PUT", token: authToken, body: { apiKey } });
      setStatus(data.detail || "BrickEconomy connected."); setApiKey(""); await load();
    } catch (error) { setStatus(error.payload?.reason || error.message); } finally { setBusy(""); }
  };
  const sync = async () => {
    setBusy("sync"); setStatus("");
    try {
      const data = await requestJson("/api/data-sources/brickeconomy/sync", { method: "POST", token: authToken, body: {} });
      setStatus(`BrickEconomy sync completed ${new Date(data.syncedAt).toLocaleString()}.`);
    } catch (error) { setStatus(error.payload?.reason || error.message); } finally { setBusy(""); }
  };
  const selectFile = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const parsed = parseCsv(await file.text()); setRows(parsed); setPreview(null);
    if (!parsed.length) setStatus("No collection rows found. Check the CSV headings.");
    else setStatus(`${parsed.length} row${parsed.length === 1 ? "" : "s"} loaded. Preview before importing.`);
  };
  const previewImport = async () => {
    setBusy("preview");
    try { setPreview(await requestJson("/api/collection/import/preview", { method: "POST", token: authToken, body: { rows } })); setStatus(""); }
    catch (error) { setStatus(error.message); } finally { setBusy(""); }
  };
  const commit = async () => {
    setBusy("import");
    try {
      const data = await requestJson("/api/collection/import/commit", { method: "POST", token: authToken, body: { rows: validRows } });
      setStatus(`${data.created || 0} collection position${data.created === 1 ? "" : "s"} imported.`);
      setRows([]); setPreview(null); await onImported?.();
    } catch (error) { setStatus(error.message); } finally { setBusy(""); }
  };

  return <div className="v3DataSources" data-page="data-sources">
    <header className="v3WorkflowHero">
      <div><span className="v3Eyebrow">Your LEGO data</span><h1>Data Sources</h1><p>Bring Gavin's real collection into Brick Alpha, then keep market values separate through BrickEconomy.</p></div>
    </header>
    <div className="v3DataSourceGrid">
      <section className="v3DecisionCard">
        <div className="v3PortfolioSectionHead"><div><span className="v3Eyebrow">Valuation API</span><h2>BrickEconomy</h2></div><span className={source?.brickeconomy?.configured ? "v3SourceStatus isConnected" : "v3SourceStatus"}>{source?.brickeconomy?.configured ? "Connected" : "Not connected"}</span></div>
        <p>BrickEconomy remains the canonical source for current LEGO market values. Your API key is stored encrypted.</p>
        {source?.brickeconomy?.configured ? <>
          <div className="v3SourceMeta"><span>Credential</span><strong>{source.brickeconomy.apiKeyMasked}</strong><span>Last sync</span><strong>{source.brickeconomy.lastSyncAt ? new Date(source.brickeconomy.lastSyncAt).toLocaleString() : "Not synced yet"}</strong></div>
          <button className="primaryButton" disabled={Boolean(busy)} onClick={sync}>{busy === "sync" ? "Syncing…" : "Sync BrickEconomy"}</button>
        </> : <div className="v3SourceConnect"><label>BrickEconomy API key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste API key" autoComplete="off" /></label><button className="primaryButton" disabled={!apiKey.trim() || Boolean(busy)} onClick={connect}>{busy === "connect" ? "Testing…" : "Test & connect"}</button></div>}
      </section>
      <section className="v3DecisionCard">
        <span className="v3Eyebrow">Collection import</span><h2>Import CSV</h2>
        <p>Import what you own and what you actually paid. Brick Alpha keeps purchase data separate from market valuation.</p>
        <div className="v3ImportFields"><strong>Required:</strong> setNumber, quantity, purchasePrice <span>Optional: purchaseDate, condition, retailer, shipping, vatReclaim, rewards, cashback, vouchers</span></div>
        <label className="v3FileDrop">Choose collection CSV<input type="file" accept=".csv,text/csv" onChange={selectFile} /></label>
        {rows.length ? <button className="secondaryButton" disabled={Boolean(busy)} onClick={previewImport}>{busy === "preview" ? "Checking…" : `Preview ${rows.length} rows`}</button> : null}
      </section>
    </div>
    {preview ? <section className="v3DecisionCard">
      <div className="v3PortfolioSectionHead"><div><span className="v3Eyebrow">Safe preview</span><h2>Review before import</h2></div><strong>{preview.summary.valid} ready · {preview.summary.invalid} need attention</strong></div>
      <div className="v3ImportTable"><div className="v3ImportHead"><span>Set</span><span>Qty</span><span>Purchase price</span><span>Condition</span><span>Status</span></div>
      {preview.rows.map((row) => <div key={row.row} className={row.valid ? "" : "isInvalid"}><strong>#{row.setNumber || "—"}</strong><span>{row.quantity}</span><span>{row.purchasePrice == null ? "—" : `R${row.purchasePrice.toLocaleString()}`}</span><span>{row.condition}</span><span>{row.valid ? "Ready" : row.errors.join(" ")}</span></div>)}</div>
      <div className="v3ImportActions"><button className="primaryButton" disabled={!validRows.length || Boolean(busy)} onClick={commit}>{busy === "import" ? "Importing…" : `Import ${validRows.length} valid rows`}</button><span>Nothing is written until you confirm this import.</span></div>
    </section> : null}
    {status ? <div className="v3SourceNotice" role="status">{status}</div> : null}
  </div>;
}
