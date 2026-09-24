import { useMemo, useState } from "react";
import { formatCollectiblePrice } from "../../appUtils";
import {
  EXIT_CHANNELS,
  EXIT_FEE_ASSUMPTION,
  buildExitCandidates,
  buildRealisedLedger,
  formatSignedPercent,
} from "../collection/ownershipModel";
import { buildCanonicalRetirement, retirementReminderLabel } from "../retirement/retirementModel";

function proximityLabel(months) {
  if (months == null || !Number.isFinite(months)) {
    return "—";
  }
  const rounded = Math.round(months);
  if (rounded <= 0) {
    return "In the sell window";
  }
  return `${rounded} months`;
}

function saleDateLabel(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toISOString().slice(0, 10);
}

export function ExitsScreen({
  openTrades = [],
  closedTrades = [],
  collectibles = [],
  navigateToPage,
  onRecordSale,
  busy = false,
}) {
  const candidates = useMemo(
    () =>
      buildExitCandidates(openTrades, collectibles).map((set) => {
        const retirement = buildCanonicalRetirement({
          expectedRetirementDate: set.expectedRetirementDate,
        });
        return { ...set, retirement, reminder: retirementReminderLabel(retirement) };
      }),
    [collectibles, openTrades],
  );
  const ledger = useMemo(() => buildRealisedLedger(closedTrades), [closedTrades]);
  const nearestWindow = candidates
    .map((set) => set.sellWindowMonths)
    .filter((months) => months != null)
    .sort((left, right) => left - right)[0];
  const [saleFor, setSaleFor] = useState(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    salePrice: "",
    date: new Date().toISOString().slice(0, 10),
    channel: EXIT_CHANNELS[0].id,
    notes: "",
  });

  const openSale = (set) => {
    const unit = set.unitRows[0];
    setSaleFor(set);
    setStatus("");
    setForm({
      salePrice: unit ? String(Math.round(unit.marketValue)) : "",
      date: new Date().toISOString().slice(0, 10),
      channel: EXIT_CHANNELS[0].id,
      notes: "",
    });
  };

  const submitSale = async (event) => {
    event.preventDefault();
    const unit = saleFor?.unitRows?.[0];
    const salePrice = Number(form.salePrice);
    if (!unit || !Number.isFinite(salePrice) || salePrice <= 0) {
      setStatus("Enter the sale price before recording.");
      return;
    }
    const channel = EXIT_CHANNELS.find((item) => item.id === form.channel) || EXIT_CHANNELS[0];
    try {
      await onRecordSale({
        tradeId: unit.tradeId,
        salePrice,
        orderNote: [
          `Channel: ${channel.label}`,
          form.date ? `Sale date: ${form.date}` : "",
          form.notes || "",
        ]
          .filter(Boolean)
          .join(". "),
      });
      setStatus(`${saleFor.name} recorded. Collection and Home now use the updated holdings.`);
      setSaleFor(null);
    } catch (error) {
      setStatus(String(error?.message || "The sale could not be recorded."));
    }
  };

  return (
    <div className="v3WorkflowScreen" data-page="exits">
      <header className="v3WorkflowHero">
        <h1>Exits</h1>
        <p>
          A stack is flywheel-ready when one unit’s current value covers the whole stack cost.
          Retirement timing still shapes the sell-window note.
        </p>
        <p className="v3FeeAssumption">{EXIT_FEE_ASSUMPTION}</p>
      </header>

      <section className="v3StatGrid" aria-label="Exit summary">
        <div><span>Flywheel-ready stacks</span><strong>{candidates.filter((set) => set.flywheelReady).length}</strong></div>
        <div>
          <span>Nearest sell window</span>
          <strong>{proximityLabel(nearestWindow)}</strong>
        </div>
      </section>

      {candidates.length ? (
        <section className="panel" aria-label="Open exits">
          <div className="panelHeader">
            <strong>Open holdings</strong>
            <small>Flywheel stacks first, then the closest sell window</small>
          </div>
          <div className="v3ExitList">
            {candidates.map((set) => (
              <article key={set.id} className="v3ExitCard">
                <div className="v3ExitRowMain">
                  <strong>{set.name}</strong>
                  <small>
                    #{set.setNumber} · {set.units} {set.units === 1 ? "unit" : "units"}
                    {set.flywheelReady ? " · Flywheel ready" : ""}
                  </small>
                </div>
                <div className="v3ExitRowStats">
                  <span>Sell window <strong>{proximityLabel(set.sellWindowMonths)}</strong></span>
                  <span>Gain <strong>{formatSignedPercent(set.roi)}</strong></span>
                  <span>Annualised <strong>{formatSignedPercent(set.annualised)}</strong></span>
                  <span>Net, one unit <strong>{formatCollectiblePrice(set.bestNet)}</strong></span>
                  {set.isStack ? (
                    <span>
                      Recovery <strong>{formatSignedPercent(set.recoveryPercent)}</strong>
                      {" · "}
                      one unit {formatCollectiblePrice(set.oneUnitValue)} vs stack{" "}
                      {formatCollectiblePrice(set.cost)}
                    </span>
                  ) : null}
                </div>
                <p className="v3ExitRecommendation">{set.recommendation}</p>
                <p>
                  Retirement {set.retirement?.retirementState || "—"}
                  {set.retirement?.retirementState !== "Retired" && set.retirement?.monthsRemaining != null
                    ? ` · ${set.retirement.monthsRemaining} months`
                    : ""}
                </p>
                {set.reminder ? (
                  <p className="v3RetirementWarning">{set.reminder}. The sell window is open.</p>
                ) : set.retirement?.insideSixMonths ? (
                  <p className="v3RetirementWarning">Inside 6 months. The sell window is open.</p>
                ) : null}
                <div className="v3ChannelGrid" aria-label="Channel comparison">
                  {set.channels.map((channel) => (
                    <div key={channel.id}>
                      <span>{channel.label}</span>
                      <strong>{formatCollectiblePrice(channel.net)}</strong>
                      <small>Assumed {Math.round(channel.feeRate * 100)}% fees</small>
                    </div>
                  ))}
                </div>
                <button type="button" className="primaryButton" onClick={() => openSale(set)}>
                  Record sale
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <p>No open holdings to exit.</p>
          <button type="button" className="primaryButton" onClick={() => navigateToPage("collection")}>
            Open Collection
          </button>
        </section>
      )}

      {saleFor ? (
        <form className="v3PurchaseForm v3DecisionCard" onSubmit={submitSale}>
          <h2>Record sale · {saleFor.name}</h2>
          <p>This closes the holding at the sale price. It does not change past analysis snapshots.</p>
          <label>
            Sale price (ZAR)
            <input
              type="number"
              min="1"
              step="1"
              required
              value={form.salePrice}
              onChange={(event) => setForm((current) => ({ ...current, salePrice: event.target.value }))}
            />
          </label>
          <label>
            Sale date
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </label>
          <label>
            Channel
            <select
              value={form.channel}
              onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))}
            >
              {EXIT_CHANNELS.map((channel) => (
                <option key={channel.id} value={channel.id}>{channel.label}</option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
          <div className="v3WorkflowActions">
            <button type="button" className="ghostButton" onClick={() => setSaleFor(null)}>
              Cancel
            </button>
            <button type="submit" className="primaryButton" disabled={busy}>
              {busy ? "Saving…" : "Save sale"}
            </button>
          </div>
        </form>
      ) : null}
      {status ? <p className="v3StatusLine">{status}</p> : null}

      <section className="panel" aria-label="Realised sales">
        <div className="panelHeader">
          <strong>Realised sales</strong>
          <small>Original cost, fees, and cash ready to recycle</small>
        </div>
        {ledger.length ? (
          <div className="v3ExitList">
            {ledger.map((sale) => (
              <article key={sale.id} className="v3ExitCard">
                <div className="v3ExitRowMain">
                  <strong>{sale.name}</strong>
                  <small>#{sale.setNumber} · {sale.channel} · {saleDateLabel(sale.saleDate)}</small>
                </div>
                <div className="v3ExitRowStats">
                  <span>Cost <strong>{formatCollectiblePrice(sale.cost)}</strong></span>
                  <span>Gross <strong>{formatCollectiblePrice(sale.gross)}</strong></span>
                  <span>Fees <strong>{formatCollectiblePrice(sale.fees)}</strong></span>
                  <span>Net <strong>{formatCollectiblePrice(sale.net)}</strong></span>
                  <span>Profit <strong>{formatCollectiblePrice(sale.realisedProfit)}</strong></span>
                </div>
                <p className="v3ExitRecommendation">{sale.recovery}</p>
              </article>
            ))}
          </div>
        ) : (
          <p>No realised sales yet. Record a sale from an open holding to start the ledger.</p>
        )}
      </section>
    </div>
  );
}
