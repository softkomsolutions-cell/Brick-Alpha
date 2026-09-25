import { useEffect, useMemo, useState } from "react";
import { formatCollectiblePrice } from "../../appUtils";
import { buildDecisionSnapshot } from "../decision/decisionModel";
import { saveDecisionSnapshot } from "../decision/decisionSession";
import { readBuyingProfile } from "../onboarding/onboardingStorage";
import { buildResearchCard, consumeResearchSection, filterResearchCards, readResearchSection, splitResearchSections } from "../research/researchModel";
import { CANONICAL_AS_OF, retirementReminderLabel } from "../retirement/retirementModel";
import { applyWatchTriggers, readWatchTargets, upsertWatchTarget, writeWatchTargets } from "../watch/watchTargets";

const SECTIONS = [
  { id: "search", label: "Search" },
  { id: "new", label: "New Releases" },
  { id: "retiring", label: "Retiring Soon" },
  { id: "performers", label: "Top Performers" },
  { id: "watch", label: "Watch Targets" },
];

const EMPTY_FILTERS = {
  query: "",
  theme: "",
  retirement: "",
  verdict: "",
  minPrice: "",
  maxPrice: "",
  minAnnual: "",
  minNinety: "",
};

function Card({ card, watching, onOpen, onWatch }) {
  return (
    <article className="v3ResearchCard">
      <button type="button" className="v3ResearchOpen" onClick={() => onOpen(card)}>
        {card.imageUrl ? (
          <img src={card.imageUrl} alt="" className="v3DecisionImage" />
        ) : (
          <div className="v3DecisionImage v3DecisionImageFallback">#{card.setNumber}</div>
        )}
        <div>
          <span className="v3Eyebrow">{card.theme}</span>
          <strong>{card.name}</strong>
          <small>#{card.setNumber}</small>
        </div>
      </button>
      <dl className="v3ResearchFacts">
        <div><dt>Value</dt><dd>{card.currentMarketValue == null ? "No recorded value" : formatCollectiblePrice(card.currentMarketValue)}</dd></div>
        <div><dt>Annual</dt><dd>{card.annualLabel}</dd></div>
        <div><dt>90-day</dt><dd>{card.ninetyLabel}</dd></div>
        <div><dt>Retirement</dt><dd>{card.retirement.retirementState}</dd></div>
        <div><dt>Verdict</dt><dd>{card.verdict.label}</dd></div>
        <div><dt>Confidence</dt><dd>{card.confidence == null ? "—" : `${card.confidence}%`}</dd></div>
        <div><dt>Watch</dt><dd>{watching ? "Watching" : "Not watching"}</dd></div>
      </dl>
      {retirementReminderLabel(card.retirement) ? (
        <p className="v3RetirementWarning">{retirementReminderLabel(card.retirement)}</p>
      ) : null}
      {card.personalisation.verdict.label !== card.verdict.label ? (
        <p className="v3ResearchBook">For your book: {card.personalisation.verdict.label}</p>
      ) : null}
      <button type="button" className="ghostButton" onClick={() => onWatch(card)}>
        {watching ? "Update watch target" : "Watch target"}
      </button>
    </article>
  );
}

export function ResearchScreen({
  collectibles = [],
  openTrades = [],
  closedTrades = [],
  navigateToPage,
  onWatch,
}) {
  const [section, setSection] = useState(() => readResearchSection());
  useEffect(() => {
    const timer = window.setTimeout(consumeResearchSection, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [targets, setTargets] = useState(() => readWatchTargets());
  const asOf = CANONICAL_AS_OF;
  const profile = readBuyingProfile();

  const cards = useMemo(() => {
    return (collectibles || [])
      .filter((item) => item.brand === "LEGO")
      .map((item) =>
        buildResearchCard(item, { asOf, profile, openTrades, closedTrades }),
      );
  }, [asOf, closedTrades, collectibles, openTrades, profile]);

  const filtered = useMemo(() => filterResearchCards(cards, filters), [cards, filters]);
  const sections = useMemo(() => splitResearchSections(filtered), [filtered]);
  const themes = [...new Set(cards.map((card) => card.theme))].sort();
  const liveValues = Object.fromEntries(cards.map((card) => [card.setNumber, card.currentMarketValue]));
  const watches = applyWatchTriggers(targets, liveValues);
  const watchingNumbers = new Set(watches.map((target) => target.setNumber));

  const visible =
    section === "new"
      ? sections.newReleases
      : section === "retiring"
        ? sections.retiringSoon
        : section === "performers"
          ? sections.topPerformers
          : sections.search;

  const openCard = (card) => {
    const snapshot = buildDecisionSnapshot({
      evaluation: card.item,
      imageUrl: card.imageUrl,
      buyingProfile: profile,
      openTrades,
      closedTrades,
      analyzedAt: asOf,
    });
    saveDecisionSnapshot(snapshot);
    navigateToPage?.("verdict");
  };

  const watchCard = (card) => {
    const next = upsertWatchTarget(targets, {
      setNumber: card.setNumber,
      name: card.name,
      collectibleId: card.id,
      currentValue: card.currentMarketValue,
      targetBuyPrice: card.verdict.targetPrice,
      targetVerdict: card.verdict.label,
      retirementState: card.retirement.retirementState,
      createdAt: new Date().toISOString(),
    });
    setTargets(writeWatchTargets(next));
    onWatch?.({
      ticker: card.setNumber,
      label: card.name,
      desk: "collectible",
      targetPrice: card.verdict.targetPrice,
    });
  };

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="v3Research" data-page="research">
      <header className="v3WorkflowHero">
        <h1>Research</h1>
        <p>BrickEconomy value, recorded growth and one consistent Brick Alpha verdict.</p>
      </header>

      <div className="v3BookToggle" role="tablist" aria-label="Research sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? "active" : ""}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form className="v3ResearchFilters" onSubmit={(event) => event.preventDefault()}>
        <label>Search<input value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="Name or set number" /></label>
        <label>Theme
          <select value={filters.theme} onChange={(event) => setFilter("theme", event.target.value)}>
            <option value="">All themes</option>
            {themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
          </select>
        </label>
        <label>Retirement
          <select value={filters.retirement} onChange={(event) => setFilter("retirement", event.target.value)}>
            <option value="">Any window</option>
            <option>Active</option>
            <option>Approaching</option>
            <option>Inside 6 months</option>
            <option>Retired</option>
          </select>
        </label>
        <label>Verdict
          <select value={filters.verdict} onChange={(event) => setFilter("verdict", event.target.value)}>
            <option value="">Any verdict</option>
            <option value="buy-2">Buy ×2 flywheel</option>
            <option value="buy-1">Buy ×1</option>
            <option value="below">Only below target</option>
            <option value="skip">Skip</option>
          </select>
        </label>
        <label>Min price<input type="number" min="0" value={filters.minPrice} onChange={(event) => setFilter("minPrice", event.target.value)} /></label>
        <label>Max price<input type="number" min="0" value={filters.maxPrice} onChange={(event) => setFilter("maxPrice", event.target.value)} /></label>
        <label>Min annual %<input type="number" value={filters.minAnnual} onChange={(event) => setFilter("minAnnual", event.target.value)} /></label>
        <label>Min 90-day %<input type="number" value={filters.minNinety} onChange={(event) => setFilter("minNinety", event.target.value)} /></label>
      </form>

      {section === "watch" ? (
        <section className="v3ResearchList" aria-label="Watch targets">
          {watches.length ? watches.map((target) => (
            <article key={target.id} className="v3ResearchCard" data-triggered={target.triggered ? "true" : "false"}>
              <strong>{target.name}</strong>
              <p>#{target.setNumber} · {target.retirementState}</p>
              <p>Value {target.currentValue == null ? "No recorded value" : formatCollectiblePrice(target.currentValue)} · target {formatCollectiblePrice(target.targetBuyPrice)}</p>
              <p>{target.targetVerdict} · {target.createdAt.slice(0, 10)} · {target.triggered ? "Triggered" : "Waiting"}</p>
              {target.retirementState === "Inside 6 months" ? <p className="v3RetirementWarning">Watch is urgent: inside 6 months</p> : null}
            </article>
          )) : <p>No watch targets yet.</p>}
        </section>
      ) : (
        <section className="v3ResearchList" aria-label={section}>
          {visible.length ? visible.map((card) => (
            <Card
              key={card.id}
              card={card}
              watching={watchingNumbers.has(card.setNumber)}
              onOpen={openCard}
              onWatch={watchCard}
            />
          )) : <p>No sets match this section.</p>}
        </section>
      )}
    </div>
  );
}
