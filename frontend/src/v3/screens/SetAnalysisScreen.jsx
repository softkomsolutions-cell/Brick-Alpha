import { useState } from "react";
import { formatCollectiblePrice } from "../../appUtils";
import { resolveExchangeRate } from "../valuation/exchangeRate";
import { formatCanonicalValue, formatRecordedGrowth } from "../valuation/valuationAuthority";
import { readDecisionSnapshot } from "../decision/decisionSession";

function wholeScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : "—";
}

function Disclosure({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="v3DecisionCard">
      <button type="button" className="v3DisclosureToggle" onClick={() => setOpen((value) => !value)}>
        {title}
        <span>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="v3DisclosureBody">{children}</div> : null}
    </section>
  );
}

export function SetAnalysisScreen({ navigateToPage, appSettings }) {
  const snapshot = readDecisionSnapshot();
  const exchange = resolveExchangeRate(appSettings);

  if (!snapshot) {
    return (
      <div className="v3WorkflowScreen" data-page="set-analysis">
        <header className="v3WorkflowHero">
          <h1>Set Analysis</h1>
          <p>Open a verdict first. Deep factors stay attached to that frozen analysis.</p>
          <button type="button" className="primaryButton" onClick={() => navigateToPage("scan")}>
            Scan a set
          </button>
        </header>
      </div>
    );
  }

  return (
    <div className="v3WorkflowScreen" data-page="set-analysis">
      <header className="v3WorkflowHero">
        <h1>{snapshot.name}</h1>
        <p>
          #{snapshot.setNumber} · score {snapshot.score} · {snapshot.verdict.label} · confidence{" "}
          {snapshot.confidence}%
        </p>
        <div className="v3WorkflowActions">
          <button type="button" className="ghostButton" onClick={() => navigateToPage("verdict")}>
            Back to Verdict
          </button>
          <button type="button" className="primaryButton" onClick={() => navigateToPage("log-purchase")}>
            Log Purchase
          </button>
        </div>
      </header>

      <ol className="v3FactorList">
        {snapshot.factors.map((item, index) => (
          <li key={item.id} className="v3DecisionCard">
            <div className="v3FactorHead">
              <span>{index + 1}. {item.title}</span>
              <strong>{wholeScore(item.score)}</strong>
            </div>
            <p>{item.summary}</p>
            <small>{item.detail}</small>
          </li>
        ))}
      </ol>

      <Disclosure title="Score reasoning">
        <ul className="v3Checklist">
          {(snapshot.breakdown?.factors || snapshot.drivers || []).map((item) => (
            <li key={item.key || item.label}>
              {item.label}: {wholeScore(item.score)} — {item.explanation}
            </li>
          ))}
        </ul>
      </Disclosure>

      <Disclosure title="Risks">
        <p>
          Risk is {snapshot.risk} ({snapshot.riskScore}/100). Fees, condition, and exit timing can
          reduce the ROI shown on the verdict.
        </p>
      </Disclosure>

      <Disclosure title="Drivers">
        <ul className="v3Checklist">
          {(snapshot.breakdown?.displayGroups || []).map((group) => (
            <li key={group.key}>
              {group.label} · weight {group.weight}% · score {wholeScore(group.score)}
            </li>
          ))}
        </ul>
      </Disclosure>

      <Disclosure title="Comparables">
        <ul className="v3Checklist">
          {snapshot.comparables.map((item) => (
            <li key={item.setNumber}>
              #{item.setNumber} {item.name} · {item.score}/100 · {item.growth}
            </li>
          ))}
        </ul>
      </Disclosure>

      <Disclosure title="Evidence and provenance">
        <p>
          Analysis frozen {snapshot.analyzedAt}. Current value {formatCanonicalValue(snapshot.currentValue)} from{" "}
          {snapshot.valuationSource}. Valuation date {snapshot.valuationDate || "—"}. Exchange rate {exchange.label}. Annual growth {formatRecordedGrowth(snapshot.annualGrowth)}. 90-day
          growth {formatRecordedGrowth(snapshot.growth90Day)}. Retail {formatCollectiblePrice(snapshot.retailPrice)} is
          not the market value.
        </p>
      </Disclosure>

      <Disclosure title="AI advisor">
        <p>{snapshot.aiSummary?.lead}</p>
        <ul className="v3Checklist">
          {(snapshot.aiSummary?.bullets || []).map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        <p>{snapshot.aiSummary?.action}</p>
        {snapshot.aiSummary?.book?.lines?.length ? (
          <>
            <p><strong>{snapshot.aiSummary.book.heading}</strong></p>
            <ul className="v3Checklist">
              {snapshot.aiSummary.book.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Disclosure>
    </div>
  );
}
