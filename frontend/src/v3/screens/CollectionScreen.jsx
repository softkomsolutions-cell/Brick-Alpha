import { useEffect, useMemo, useState } from "react";
import { formatCollectiblePrice } from "../../appUtils";
import {
  buildCollectionView,
  filterCollectionSets,
  formatSignedPercent,
} from "../collection/ownershipModel";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "stacks", label: "Stacks" },
  { id: "flywheel", label: "Flywheel Ready" },
  { id: "below", label: "Below Cost" },
  { id: "theme", label: "Theme" },
];

const ALLOCATION_PALETTE = [
  "#2563eb",
  "#0f766e",
  "#7c3aed",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#4f46e5",
  "#65a30d",
  "#64748b",
  "#9333ea",
];

const COLLECTION_VISIT_KEY = "brick_alpha_collection_visit_snapshot";

function weightedGrowth(sets, field) {
  const recorded = sets
    .map((set) => ({ value: Number(set.marketValue || 0), growth: Number(set[field]) }))
    .filter((item) => item.value > 0 && Number.isFinite(item.growth));
  const total = recorded.reduce((sum, item) => sum + item.value, 0);
  if (!total) return null;
  return recorded.reduce((sum, item) => sum + item.growth * item.value, 0) / total;
}

function movementRows(sets) {
  return sets
    .map((set) => {
      const growth = Number.isFinite(Number(set.ninetyDayGrowth))
        ? Number(set.ninetyDayGrowth)
        : Number.isFinite(Number(set.annualGrowth))
          ? Number(set.annualGrowth)
          : null;
      const period = Number.isFinite(Number(set.ninetyDayGrowth)) ? "90-day" : "annual";
      const valueGain = growth == null ? null : Number(set.marketValue || 0) * (growth / (100 + growth || 100));
      return { ...set, movementGrowth: growth, movementPeriod: period, valueGain };
    })
    .filter((set) => set.movementGrowth != null);
}

export function CollectionScreen({ openTrades = [], collectibles = [], navigateToPage, authToken, requestJson }) {
  const view = useMemo(
    () => buildCollectionView(openTrades, collectibles),
    [collectibles, openTrades],
  );
  const [filter, setFilter] = useState("all");
  const [theme, setTheme] = useState(view.themes[0] || "");
  const [expandedId, setExpandedId] = useState("");
  const [showAllRows, setShowAllRows] = useState(false);
  const [previousVisit, setPreviousVisit] = useState(null);
  const [liveCollectionSummary, setLiveCollectionSummary] = useState(null);
  const [liveCollectionError, setLiveCollectionError] = useState("");

  useEffect(() => {
    let active = true;
    if (!authToken || !requestJson) return () => {};
    requestJson("/api/data-sources/brickeconomy/collection-summary", { token: authToken })
      .then((data) => {
        if (!active) return;
        setLiveCollectionSummary(data);
        setLiveCollectionError("");
      })
      .catch((error) => {
        if (!active) return;
        setLiveCollectionSummary(null);
        setLiveCollectionError(error?.message || "Live BrickEconomy collection history unavailable.");
      });
    return () => {
      active = false;
    };
  }, [authToken, requestJson]);

  useEffect(() => {
    try {
      const prior = window.localStorage.getItem(COLLECTION_VISIT_KEY);
      if (prior) setPreviousVisit(JSON.parse(prior));
      const snapshot = {
        value: view.summary.openValue,
        at: new Date().toISOString(),
      };
      window.localStorage.setItem(COLLECTION_VISIT_KEY, JSON.stringify(snapshot));
    } catch {
      // Visit comparison is optional; collection data remains available.
    }
  }, [view.summary.openValue]);
  const rows = filterCollectionSets(view.sets, filter, theme);
  const visibleRows = showAllRows ? rows : rows.slice(0, 12);
  const allocation = useMemo(() => {
    const total = view.sets.reduce((sum, set) => sum + Number(set.marketValue || 0), 0);
    const grouped = new Map();
    for (const set of view.sets) {
      const key = set.theme || "Other";
      const current = grouped.get(key) || { theme: key, value: 0, cost: 0 };
      current.value += Number(set.marketValue || 0);
      current.cost += Number(set.cost || 0);
      grouped.set(key, current);
    }
    return [...grouped.values()]
      .map((item) => ({
        ...item,
        share: total > 0 ? (item.value / total) * 100 : 0,
        roi: item.cost > 0 ? ((item.value - item.cost) / item.cost) * 100 : null,
      }))
      .sort((a, b) => b.value - a.value);
  }, [view.sets]);

  const donutGradient = useMemo(() => {
    const stops = allocation.map((item, index) => {
      const start = allocation
        .slice(0, index)
        .reduce((sum, entry) => sum + entry.share, 0);
      const end = start + item.share;
      return `${ALLOCATION_PALETTE[index % ALLOCATION_PALETTE.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return stops.length ? `conic-gradient(${stops.join(", ")})` : "#e9eef7";
  }, [allocation]);

  const costBasis = useMemo(
    () => view.sets.reduce((sum, set) => sum + Number(set.cost || 0), 0),
    [view.sets],
  );
  const unrealisedGain = view.summary.openValue - costBasis;
  const ninetyDayChange = liveCollectionSummary?.change90Day ?? weightedGrowth(view.sets, "ninetyDayGrowth");
  const ytdChange = liveCollectionSummary?.changeYtd ?? null;
  const thirtyDayChange = liveCollectionSummary?.change30Day ?? null;
  const annualChange = useMemo(() => weightedGrowth(view.sets, "annualGrowth"), [view.sets]);
  const movers = useMemo(() => movementRows(view.sets), [view.sets]);
  const topPercentMovers = useMemo(() => {
    if (Array.isArray(liveCollectionSummary?.topGrowth) && liveCollectionSummary.topGrowth.length) {
      return liveCollectionSummary.topGrowth.map((set, index) => ({
        id: `live-growth-${set.setNumber || index}`,
        setNumber: set.setNumber,
        name: set.name,
        imageUrl: null,
        movementGrowth: Number(set.growth),
        movementPeriod: "vs paid",
      }));
    }
    return [...movers].sort((a, b) => b.movementGrowth - a.movementGrowth).slice(0, 5);
  }, [liveCollectionSummary, movers]);
  const topValueMovers = useMemo(() => {
    if (Array.isArray(liveCollectionSummary?.topGain) && liveCollectionSummary.topGain.length) {
      return liveCollectionSummary.topGain.map((set, index) => ({
        id: `live-gain-${set.setNumber || index}`,
        setNumber: set.setNumber,
        name: set.name,
        imageUrl: null,
        movementGrowth: Number(set.growth),
        movementPeriod: "vs paid",
        valueGain: Number(set.gain),
      }));
    }
    return [...movers].filter((set) => Number.isFinite(set.valueGain)).sort((a, b) => b.valueGain - a.valueGain).slice(0, 5);
  }, [liveCollectionSummary, movers]);
  const visitChange = previousVisit && Number(previousVisit.value) > 0
    ? view.summary.openValue - Number(previousVisit.value)
    : null;

  return (
    <div className="v3WorkflowScreen v3Collection" data-page="collection">
      <header className="v3WorkflowHero v3CollectionHero">
        <div>
          <span className="v3Eyebrow">Brick Alpha portfolio</span>
          <h1>My Collection</h1>
          <p>Current value, recorded movement and the sets reshaping your LEGO portfolio.</p>
        </div>
        <div className="v3CollectionHeroMeta">
          <strong>{view.summary.positions}</strong><span>positions</span>
          <strong>{view.summary.uniqueSets}</strong><span>unique sets</span>
        </div>
      </header>

      <section className="v3CollectionKpis" aria-label="Collection value summary">
        <article>
          <span>Portfolio value</span>
          <strong>{formatCollectiblePrice(view.summary.openValue)}</strong>
          <small>{unrealisedGain >= 0 ? "+" : ""}{formatCollectiblePrice(unrealisedGain)} vs paid</small>
        </article>
        <article>
          <span>30-day change</span>
          <strong>{thirtyDayChange == null ? "—" : formatSignedPercent(thirtyDayChange)}</strong>
          <small>{thirtyDayChange == null ? "Not enough provider history" : "BrickEconomy collection history"}</small>
        </article>
        <article>
          <span>90-day change</span>
          <strong>{ninetyDayChange == null ? "—" : formatSignedPercent(ninetyDayChange)}</strong>
          <small>{ninetyDayChange == null ? "Not enough provider history" : "BrickEconomy collection history"}</small>
        </article>
        <article>
          <span>YTD change</span>
          <strong>{ytdChange == null ? "—" : formatSignedPercent(ytdChange)}</strong>
          <small>{ytdChange == null ? "Not enough provider history" : "BrickEconomy collection history"}</small>
        </article>
      </section>
      {liveCollectionError ? <p className="v3ResearchEmpty">{liveCollectionError}</p> : null}

      <section className="v3CollectionSinceVisit" aria-label="Since your last visit">
        <div>
          <span className="v3Eyebrow">Since your last visit</span>
          <strong>
            {visitChange == null
              ? "Your current collection snapshot is saved."
              : visitChange === 0
                ? "No portfolio-value change since your previous visit."
                : `Portfolio value has ${visitChange > 0 ? "increased" : "decreased"} by ${formatCollectiblePrice(Math.abs(visitChange))}.`}
          </strong>
          <p>
            {topPercentMovers.length
              ? `Current collection leader: ${topPercentMovers[0].name} (${formatSignedPercent(topPercentMovers[0].movementGrowth)} vs paid).`
              : "Movement will appear as BrickEconomy valuation history accumulates."}
          </p>
        </div>
      </section>

      <section className="v3DecisionCard v3CollectionMovement">
        <div className="v3PortfolioSectionHead">
          <div><span className="v3Eyebrow">BrickEconomy collection gains</span><h2>Current leaders</h2></div>
          <small>{liveCollectionSummary?.source === "BrickEconomy" ? "Growth and value gain vs recorded paid price" : "Recorded growth vs cost"}</small>
        </div>
        <div className="v3MovementColumns">
          <div>
            <h3>Top growth vs paid</h3>
            {topPercentMovers.length ? topPercentMovers.map((set) => (
              <article key={`pct-${set.id}`} className="v3MovementRow">
                <div className="v3MovementIdentity">
                  {set.imageUrl ? <img src={set.imageUrl} alt="" loading="lazy" /> : <span className="v3MovementFallback">#{set.setNumber}</span>}
                  <div><strong>{set.setNumber} {set.name}</strong><small>{set.movementPeriod}</small></div>
                </div>
                <strong className={set.movementGrowth >= 0 ? "isPositive" : "isNegative"}>{formatSignedPercent(set.movementGrowth)}</strong>
              </article>
            )) : <p className="v3Muted">No recorded growth history yet.</p>}
          </div>
          <div>
            <h3>Top value gains vs paid</h3>
            {topValueMovers.length ? topValueMovers.map((set) => (
              <article key={`value-${set.id}`} className="v3MovementRow">
                <div className="v3MovementIdentity">
                  {set.imageUrl ? <img src={set.imageUrl} alt="" loading="lazy" /> : <span className="v3MovementFallback">#{set.setNumber}</span>}
                  <div><strong>{set.setNumber} {set.name}</strong><small>{formatSignedPercent(set.movementGrowth)} {set.movementPeriod}</small></div>
                </div>
                <strong className={set.valueGain >= 0 ? "isPositive" : "isNegative"}>
                  {set.valueGain == null ? "—" : `${set.valueGain >= 0 ? "+" : "-"}${formatCollectiblePrice(Math.abs(set.valueGain))}`}
                </strong>
              </article>
            )) : <p className="v3Muted">No recorded value gains yet.</p>}
          </div>
        </div>
      </section>

      <section className="v3DecisionCard v3CollectionAllocation">
        <div className="v3PortfolioSectionHead">
          <div>
            <span className="v3Eyebrow">Portfolio mix</span>
            <h2>Allocation by theme</h2>
          </div>
          <small>Based on current collection market value</small>
        </div>
        <div className="v3AllocationVisual">
          <div className="v3ThemeDonutWrap">
            <div
              className="v3ThemeDonut"
              style={{ background: donutGradient }}
              role="img"
              aria-label="Portfolio allocation by theme"
            >
              <div className="v3ThemeDonutCenter">
                <strong>{view.summary.uniqueSets}</strong>
                <span>unique sets</span>
              </div>
            </div>
            <div className="v3ThemeLegend">
              {allocation.slice(0, 9).map((item, index) => (
                <div key={item.theme} className="v3ThemeLegendItem">
                  <span
                    className="v3ThemeLegendSwatch"
                    style={{ background: ALLOCATION_PALETTE[index % ALLOCATION_PALETTE.length] }}
                  />
                  <strong>{item.theme}</strong>
                  <span>{item.share.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="v3ThemeChart">
            {allocation.map((item, index) => (
              <div className="v3ThemeChartRow" key={item.theme}>
                <div className="v3ThemeChartLabel">
                  <strong>{item.theme}</strong>
                  <span>{item.share.toFixed(1)}%</span>
                </div>
                <div className="v3ThemeChartBar" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.max(1, Math.min(100, item.share))}%`,
                      background: ALLOCATION_PALETTE[index % ALLOCATION_PALETTE.length],
                    }}
                  />
                </div>
                <div className="v3ThemeChartValue">
                  <strong>{formatCollectiblePrice(item.value)}</strong>
                  <small>{item.roi == null ? "ROI —" : `ROI ${formatSignedPercent(item.roi)}`}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="v3FilterRow" role="tablist" aria-label="Collection filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-collection-filter={item.id}
            className={filter === item.id ? "primaryButton" : "ghostButton"}
            aria-selected={filter === item.id}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
        {filter === "theme" ? (
          <label className="v3ThemeFilter">
            Theme
            <select value={theme} onChange={(event) => setTheme(event.target.value)}>
              {view.themes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {rows.length ? (
        <section className="panel" data-active-filter={filter} data-result-count={rows.length} aria-label="Sets">
          <div className="panelHeader">
            <strong>Sets</strong>
            <small>Sorted by market value</small>
          </div>
          <div className="v3CollectionList">
            {visibleRows.map((set) => {
              const expanded = expandedId === set.id;
              return (
                <article key={set.id} className="v3CollectionRow">
                  <button
                    type="button"
                    className="v3CollectionMain"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? "" : set.id)}
                  >
                    <div className="v3CollectionIdentity">
                      <strong>{set.name}</strong>
                      <small>
                        <span>#{set.setNumber}</span>
                        <span>{set.theme}</span>
                        <span>{set.condition}</span>
                        <span>{set.units} {set.units === 1 ? "unit" : "units"}</span>
                      </small>
                    </div>
                    <div className="v3CollectionStats">
                      <span>Value <strong>{formatCollectiblePrice(set.marketValue)}</strong></span>
                      <span>ROI <strong>{formatSignedPercent(set.roi)}</strong></span>
                      <span>Cost <strong>{formatCollectiblePrice(set.cost)}</strong></span>
                      <span>Profit <strong>{formatCollectiblePrice(set.profit)}</strong></span>
                    </div>
                    {set.isStack ? (
                      <p className="v3FlywheelLine">
                        Stack cost {formatCollectiblePrice(set.cost)} · One unit{" "}
                        {formatCollectiblePrice(set.oneUnitValue)} · Recovery{" "}
                        {formatSignedPercent(set.recoveryPercent)} ·{" "}
                        {formatCollectiblePrice(Math.abs(set.recoveryGap))}{" "}
                        {set.recoveryGap >= 0 ? "above" : "below"} recovery
                        {set.flywheelReady ? " · Flywheel ready" : ""}
                      </p>
                    ) : null}
                  </button>
                  {expanded ? (
                    <ul className="v3UnitList">
                      {set.unitRows.map((unit) => (
                        <li key={unit.id}>
                          <strong>{unit.label}</strong>
                          <span>{unit.condition}</span>
                          <span>Cost {formatCollectiblePrice(unit.cost)}</span>
                          <span>
                            Covers {formatSignedPercent(unit.shareOfStackCost).replace("+", "")} of stack cost
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
          {rows.length > 12 ? (
            <div className="v3ListDisclosure">
              <span>Showing {visibleRows.length} of {rows.length} sets</span>
              <button type="button" className="secondaryButton" onClick={() => setShowAllRows((value) => !value)}>
                {showAllRows ? "Show summary" : "View all sets"}
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="panel" data-active-filter={filter} data-result-count="0">
          <p>
            {filter === "all"
              ? "No sets in the collection yet."
              : "No sets match this filter."}
          </p>
          <button type="button" className="primaryButton" onClick={() => navigateToPage("scan")}>
            Log a purchase
          </button>
        </section>
      )}
    </div>
  );
}
