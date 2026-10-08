import { useEffect, useMemo, useState } from "react";
import { enrichBrickAlphaCollectible } from "../../brickAlphaModel";
import { formatCollectiblePrice } from "../../appUtils";
import { buildDecisionSnapshot } from "../decision/decisionModel";
import { saveDecisionSnapshot } from "../decision/decisionSession";
import { readBuyingProfile } from "../onboarding/onboardingStorage";
import {
  buildResearchCard,
  consumeResearchQuery,
  consumeResearchSection,
  filterResearchCards,
  readResearchQuery,
  readResearchSection,
  splitResearchSections,
} from "../research/researchModel";
import { CANONICAL_AS_OF, retirementReminderLabel } from "../retirement/retirementModel";
import { applyWatchTriggers, readWatchTargets, removeWatchTarget, upsertWatchTarget, writeWatchTargets } from "../watch/watchTargets";

const BASE_SECTIONS = [
  { id: "search", label: "Search" },
  { id: "watch", label: "Watchlist" },
];

const LIVE_SECTIONS = [
  { id: "new", label: "New Releases" },
  { id: "retiring", label: "Retiring Soon" },
  { id: "performers", label: "Top Performers" },
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

function Card({ card, watchTarget, onOpen, onWatch, onRemoveWatch, liveData }) {
  return (
    <article className="v3ResearchCard">
      <button
        type="button"
        className="v3ResearchOpen"
        onClick={() => onOpen(card)}
        disabled={!liveData}
        aria-disabled={!liveData}
      >
        {card.imageUrl ? (
          <span className="v3ResearchImageWrap">
            <img
              src={card.imageUrl}
              alt={`${card.name} LEGO set`}
              className="v3DecisionImage"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.closest(".v3ResearchImageWrap")?.classList.add("imageFailed");
              }}
            />
            <span className="v3DecisionImageFallback">#{card.setNumber}</span>
          </span>
        ) : (
          <span className="v3DecisionImage v3DecisionImageFallback">#{card.setNumber}</span>
        )}
        <div>
          <span className="v3Eyebrow">{card.theme}</span>
          <strong>{card.name}</strong>
          <small>#{card.setNumber}</small>
        </div>
      </button>
      {liveData ? (
        <>
          <dl className="v3ResearchFacts">
            <div><dt>Value</dt><dd>{card.currentMarketValue == null ? "Unavailable" : formatCollectiblePrice(card.currentMarketValue)}</dd></div>
            <div><dt>Annual</dt><dd className={card.annualGrowth == null ? "isUnavailable" : ""}>{card.annualGrowth == null ? "Not recorded" : card.annualLabel}</dd></div>
            <div><dt>90-day</dt><dd className={card.ninetyDayGrowth == null ? "isUnavailable" : ""}>{card.ninetyDayGrowth == null ? "Not recorded" : card.ninetyLabel}</dd></div>
            <div><dt>Retirement</dt><dd>{card.retirement.retirementState}</dd></div>
            <div><dt>Verdict</dt><dd>{card.verdict.label}</dd></div>
            <div><dt>Confidence</dt><dd>{card.confidence == null ? "—" : `${card.confidence}%`}</dd></div>
            <div><dt>Watch</dt><dd>{watchTarget ? "Watching" : "Not watching"}</dd></div>
          </dl>
          {retirementReminderLabel(card.retirement) ? (
            <p className="v3RetirementWarning">{retirementReminderLabel(card.retirement)}</p>
          ) : null}
          {card.personalisation.verdict.label !== card.verdict.label ? (
            <p className="v3ResearchBook">For your book: {card.personalisation.verdict.label}</p>
          ) : null}
          <div className="v3WatchActions">
            <button type="button" className="ghostButton" onClick={() => onWatch(card)}>
              {watchTarget ? "Refresh target" : "Add to watchlist"}
            </button>
            {watchTarget ? (
              <button type="button" className="ghostButton" onClick={() => onRemoveWatch(card)}>
                Remove watch
              </button>
            ) : null}
          </div>
          {watchTarget ? (
            <p className="v3ResearchBook">
              Target {watchTarget.targetBuyPrice == null ? "not set" : formatCollectiblePrice(watchTarget.targetBuyPrice)}
              {" · "}
              {watchTarget.triggered ? "Target reached" : "Watching for a better entry"}
            </p>
          ) : null}
        </>
      ) : (
        <div className="v3ResearchReferenceOnly">
          <strong>Reference identity only</strong>
          <span>Live market value, growth, retirement timing and investment verdict are hidden until a current Research provider is connected.</span>
        </div>
      )}
    </article>
  );
}

export function ResearchScreen({
  collectibles = [],
  openTrades = [],
  closedTrades = [],
  navigateToPage,
  onWatch,
  authToken,
  requestJson,
}) {
  const [section, setSection] = useState(() => readResearchSection());
  const [sourceStatus, setSourceStatus] = useState(null);
  const [liveSearchResults, setLiveSearchResults] = useState([]);
  const [liveSearchBusy, setLiveSearchBusy] = useState(false);
  const [liveSearchError, setLiveSearchError] = useState("");
  const stagedQuery = readResearchQuery();
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    query: stagedQuery,
  }));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      consumeResearchSection();
      consumeResearchQuery();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    if (!authToken || !requestJson) return () => {};
    Promise.resolve()
      .then(() => requestJson("/api/data-sources", { token: authToken }))
      .then((data) => {
        if (active) setSourceStatus(data);
      })
      .catch(() => {
        if (active) setSourceStatus(null);
      });
    return () => {
      active = false;
    };
  }, [authToken, requestJson]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [targets, setTargets] = useState(() => readWatchTargets());
  const asOf = CANONICAL_AS_OF;
  const profile = readBuyingProfile();

  const cards = useMemo(() => {
    const catalogue = (collectibles || [])
      .filter((item) => item.brand === "LEGO");

    const owned = (openTrades || [])
      .filter((trade) => trade?.assetClass === "collectible")
      .map((trade) => ({
        id: trade.collectibleId || trade.id,
        sku: trade.sourceSetNumber || trade.sku || "",
        name: trade.ticker || trade.label || trade.name || "LEGO set",
        brand: "LEGO",
        legoTheme: trade.sourceTheme || trade.legoTheme || "Owned LEGO",
        currentMarketValue: trade.currentMarketValue ?? trade.currentPrice ?? null,
        brickEconomyValue: trade.brickEconomyValue ?? trade.currentMarketValue ?? trade.currentPrice ?? null,
        valuationDate: trade.valuationDate || null,
        sourceCondition: trade.sourceCondition || "",
      }));

    const bySet = new Map();
    for (const item of [...catalogue, ...owned]) {
      const setNumber = String(item.sku || item.id || "").match(/\d{4,7}/)?.[0] || "";
      const key = setNumber || String(item.id || item.name || "");
      if (!bySet.has(key)) bySet.set(key, item);
    }

    return [...bySet.values()].map((item) =>
      buildResearchCard(item, { asOf, profile, openTrades, closedTrades }),
    );
  }, [asOf, closedTrades, collectibles, openTrades, profile]);

  const filtered = useMemo(() => filterResearchCards(cards, filters), [cards, filters]);
  const liveDiscoveryReady = Boolean(
    sourceStatus?.brickeconomy?.configured &&
    sourceStatus?.brickeconomy?.researchFeedReady,
  );

  useEffect(() => {
    let active = true;
    const query = String(filters.query || "").trim();
    if (!liveDiscoveryReady || query.length < 3 || !authToken || !requestJson) {
      return () => { active = false; };
    }
    const timer = window.setTimeout(() => {
      setLiveSearchBusy(true);
      setLiveSearchError("");
      requestJson(`/api/data-sources/brickeconomy/search?q=${encodeURIComponent(query)}`, { token: authToken })
        .then((data) => {
          if (active) setLiveSearchResults(Array.isArray(data.sets) ? data.sets : []);
        })
        .catch((error) => {
          if (active) {
            setLiveSearchResults([]);
            setLiveSearchError(error.payload?.reason || error.message || "BrickEconomy search failed.");
          }
        })
        .finally(() => {
          if (active) setLiveSearchBusy(false);
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [authToken, filters.query, liveDiscoveryReady, requestJson]);
  const sectionOptions = useMemo(
    () => (
      liveDiscoveryReady
        ? [BASE_SECTIONS[0], ...LIVE_SECTIONS, BASE_SECTIONS[1]]
        : BASE_SECTIONS
    ),
    [liveDiscoveryReady],
  );
  const effectiveSection = sectionOptions.some((item) => item.id === section)
    ? section
    : "search";
  const sections = useMemo(() => splitResearchSections(filtered), [filtered]);
  const themes = [...new Set(cards.map((card) => card.theme))].sort();
  const liveValues = liveDiscoveryReady
    ? Object.fromEntries(cards.map((card) => [card.setNumber, card.currentMarketValue]))
    : {};
  const watches = applyWatchTriggers(targets, liveValues);
  const watchBySet = new Map(watches.map((target) => [target.setNumber, target]));

  const visible =
    effectiveSection === "new"
      ? sections.newReleases
      : effectiveSection === "retiring"
        ? sections.retiringSoon
        : effectiveSection === "performers"
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

  const openLiveSearchResult = async (result) => {
    if (!authToken || !requestJson) return;
    setLiveSearchBusy(true);
    setLiveSearchError("");
    try {
      const data = await requestJson(
        `/api/data-sources/brickeconomy/set/${encodeURIComponent(result.apiSetNumber || result.setNumber)}`,
        { token: authToken },
      );
      const enriched = enrichBrickAlphaCollectible({
        ...data.item,
        numberOfMinifigures: data.item?.numberOfMinifigures ?? data.item?.minifigsCount ?? 0,
        releaseDate: data.item?.releaseDate || (data.item?.year ? `${data.item.year}-01-01` : null),
      });
      const card = buildResearchCard(enriched, { asOf, profile, openTrades, closedTrades });
      openCard(card);
    } catch (error) {
      setLiveSearchError(error.payload?.reason || error.message || "Unable to load BrickEconomy set data.");
    } finally {
      setLiveSearchBusy(false);
    }
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

  const removeWatch = (card) => {
    const id = card.setNumber || card.id;
    const next = removeWatchTarget(targets, id);
    setTargets(writeWatchTargets(next));
  };

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="v3Research" data-page="research">
      <header className="v3WorkflowHero">
        <h1>Research</h1>
        <p>Search known LEGO sets and maintain watch targets. Live discovery is shown only when a current provider feed is available.</p>
      </header>

      {!liveDiscoveryReady ? (
        <section className="v3ResearchSourceNotice" role="status">
          <strong>Live Research feed not connected</strong>
          <span>
            Search uses the known Brick Alpha catalogue. New Releases, Retiring Soon and Top Performers are hidden until a current discovery feed is connected and synced.
          </span>
          <button type="button" className="ghostButton" onClick={() => navigateToPage?.("data-sources")}>
            Open Data Sources
          </button>
        </section>
      ) : null}

      <div className="v3BookToggle" role="tablist" aria-label="Research sections">
        {sectionOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            className={effectiveSection === item.id ? "active" : ""}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="ghostButton v3ResearchFilterToggle"
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
      >
        {filtersOpen ? "Hide filters" : "Filters"}
      </button>

      <form className="v3ResearchFilters" data-open={filtersOpen ? "true" : "false"} onSubmit={(event) => event.preventDefault()}>
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

      {effectiveSection === "search" && liveDiscoveryReady && String(filters.query || "").trim().length >= 3 ? (
        <section className="v3DecisionCard" aria-label="Live BrickEconomy search results">
          <div className="v3PortfolioSectionHead">
            <div><span className="v3Eyebrow">BrickEconomy</span><h2>Live search results</h2></div>
            <small>{liveSearchBusy ? "Searching…" : `${liveSearchResults.length} matches`}</small>
          </div>
          {liveSearchError ? <p className="v3RetirementWarning">{liveSearchError}</p> : null}
          <div className="v3ResearchList">
            {liveSearchResults.map((result) => (
              <article key={result.apiSetNumber || result.setNumber} className="v3ResearchCard">
                <button
                  type="button"
                  className="v3ResearchOpen"
                  disabled={liveSearchBusy}
                  onClick={() => openLiveSearchResult(result)}
                >
                  <span className="v3DecisionImage v3DecisionImageFallback">#{result.setNumber}</span>
                  <div>
                    <span className="v3Eyebrow">{result.theme || "LEGO"}</span>
                    <strong>{result.name}</strong>
                    <small>#{result.setNumber}{result.year ? ` · ${result.year}` : ""}{result.subtheme ? ` · ${result.subtheme}` : ""}</small>
                  </div>
                </button>
              </article>
            ))}
            {!liveSearchBusy && !liveSearchError && !liveSearchResults.length ? <p>No BrickEconomy matches.</p> : null}
          </div>
        </section>
      ) : null}

      {section === "watch" ? (
        <section className="v3ResearchList" aria-label="Watch targets">
          {watches.length ? watches.map((target) => (
            <article key={target.id} className="v3ResearchCard" data-triggered={target.triggered ? "true" : "false"}>
              <strong>{target.name}</strong>
              <p>#{target.setNumber} · {target.retirementState}</p>
              <p>Value {target.currentValue == null ? "No recorded value" : formatCollectiblePrice(target.currentValue)} · target {formatCollectiblePrice(target.targetBuyPrice)}</p>
              <p>{target.targetVerdict} · {target.createdAt.slice(0, 10)} · {target.triggered ? "Triggered" : "Waiting"}</p>
              {target.retirementState === "Inside 6 months" ? <p className="v3RetirementWarning">Watch is urgent: inside 6 months</p> : null}
              <button
                type="button"
                className="ghostButton"
                onClick={() => {
                  const next = removeWatchTarget(targets, target.id || target.setNumber);
                  setTargets(writeWatchTargets(next));
                }}
              >
                Remove watch
              </button>
            </article>
          )) : <p>No watch targets yet.</p>}
        </section>
      ) : (
        <section className="v3ResearchList" aria-label={section}>
          {visible.length ? visible.map((card) => (
            <Card
              key={card.id}
              card={card}
              watchTarget={watchBySet.get(card.setNumber)}
              onOpen={openCard}
              onWatch={watchCard}
              onRemoveWatch={removeWatch}
              liveData={liveDiscoveryReady}
            />
          )) : <p>No sets match this section.</p>}
        </section>
      )}
    </div>
  );
}
