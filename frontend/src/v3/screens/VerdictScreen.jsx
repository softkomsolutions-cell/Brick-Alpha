import { useState } from "react";
import { formatCollectiblePrice } from "../../appUtils";
import { resolveExchangeRate } from "../valuation/exchangeRate";
import { formatCanonicalValue, formatRecordedGrowth } from "../valuation/valuationAuthority";
import { ScoreRing } from "../../components/brickAlphaScoreDisplay";
import { readDecisionSnapshot } from "../decision/decisionSession";

export function VerdictScreen({ navigateToPage, onWatch, onAddToCollection, appSettings }) {
  const snapshot = readDecisionSnapshot();
  const [watchStatus, setWatchStatus] = useState("");
  const [openThesis, setOpenThesis] = useState(true);
  const exchange = resolveExchangeRate(appSettings);

  if (!snapshot) {
    return (
      <div className="v3WorkflowScreen" data-page="verdict">
        <header className="v3WorkflowHero">
          <h1>Verdict</h1>
          <p>Scan a set first. The verdict is calculated once and stays fixed after you watch or buy.</p>
          <button type="button" className="primaryButton" onClick={() => navigateToPage("scan")}>
            Scan a set
          </button>
        </header>
      </div>
    );
  }

  return (
    <div className="v3WorkflowScreen v3Verdict" data-page="verdict">
      <article className="v3DecisionCard">
        <div className="v3DecisionIdentity">
          {snapshot.imageUrl ? (
            <img src={snapshot.imageUrl} alt="" className="v3DecisionImage" />
          ) : (
            <div className="v3DecisionImage v3DecisionImageFallback">#{snapshot.setNumber}</div>
          )}
          <div>
            <span className="v3Eyebrow">{snapshot.theme || "LEGO"}</span>
            <h1>{snapshot.name}</h1>
            <p>Set #{snapshot.setNumber}</p>
          </div>
        </div>

        <div className="v3VerdictBanner" data-verdict={snapshot.verdict.id}>
          <span>Verdict</span>
          <strong>{snapshot.verdict.label}</strong>
        </div>

        <div className="v3VerdictGrid">
          <div className="v3VerdictScore">
            <ScoreRing score={snapshot.score} label="Brick Alpha Score" size="large" />
          </div>
          <div className="v3Metric">
            <span>Current value</span>
            <strong>{formatCanonicalValue(snapshot.currentValue)}</strong>
            <small>
              {snapshot.valuationSource || "BrickEconomy"} · {snapshot.valuationDate || "—"} · {exchange.label}
            </small>
          </div>
          <div className="v3Metric"><span>Confidence</span><strong>{snapshot.confidence}%</strong></div>
          <div className="v3Metric">
            <span>Annual growth</span>
            <strong>{formatRecordedGrowth(snapshot.annualGrowth)}</strong>
            <small>{snapshot.annualGrowth == null ? "Insufficient history" : "Recorded"}</small>
          </div>
          <div className="v3Metric">
            <span>90-day growth</span>
            <strong>{formatRecordedGrowth(snapshot.growth90Day)}</strong>
            <small>{snapshot.growth90Day == null ? "Insufficient history" : "Recorded"}</small>
          </div>
          <div className="v3Metric"><span>Risk</span><strong>{snapshot.risk}</strong></div>
          <div className="v3Metric"><span>Grade</span><strong>{snapshot.grade}</strong></div>
        </div>
      </article>

      <section className="v3DecisionCard">
        <button type="button" className="v3DisclosureToggle" onClick={() => setOpenThesis((open) => !open)}>
          Thesis checklist
        </button>
        {openThesis ? (
          <ul className="v3Checklist">
            {snapshot.thesis.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="v3DecisionCard">
        <h2>Retirement</h2>
        <p>
          {snapshot.retirement.status} · {snapshot.retirement.monthsRemaining} months · expected{" "}
          {snapshot.retirement.expectedRetirement}
        </p>
      </section>

      <section className="v3DecisionCard">
        <h2>Net exit by channel</h2>
        <div className="v3ExitChannels">
          {snapshot.netExits.map((channel) => (
            <div key={channel.id}>
              <span>{channel.label}</span>
              <strong>{channel.net == null ? "No recorded value" : formatCollectiblePrice(channel.net)}</strong>
              <small>{channel.feePercent}% fees</small>
            </div>
          ))}
        </div>
      </section>

      {watchStatus ? <div className="statusBanner subtleBanner">{watchStatus}</div> : null}

      <div className="v3WorkflowActions">
        <button
          type="button"
          className="ghostButton"
          onClick={() => {
            onWatch?.({
              ticker: snapshot.setNumber,
              label: snapshot.name,
              desk: "collectible",
              targetPrice: snapshot.verdict.targetPrice,
            });
            setWatchStatus(
              `Watching ${snapshot.name} at ${formatCollectiblePrice(snapshot.verdict.targetPrice)}. The verdict is unchanged.`,
            );
          }}
        >
          Watch at {formatCollectiblePrice(snapshot.verdict.targetPrice)}
        </button>
        <button type="button" className="ghostButton" onClick={() => navigateToPage("set-analysis")}>
          Set Analysis
        </button>
        <button type="button" className="primaryButton" onClick={() => onAddToCollection?.()}>
          Add to Collection
        </button>
      </div>
    </div>
  );
}
