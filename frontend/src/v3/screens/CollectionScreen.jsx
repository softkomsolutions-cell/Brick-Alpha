import { useMemo, useState } from "react";
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

export function CollectionScreen({ openTrades = [], collectibles = [], navigateToPage }) {
  const view = useMemo(
    () => buildCollectionView(openTrades, collectibles),
    [collectibles, openTrades],
  );
  const [filter, setFilter] = useState("all");
  const [theme, setTheme] = useState(view.themes[0] || "");
  const [expandedId, setExpandedId] = useState("");
  const [showAllRows, setShowAllRows] = useState(false);
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

  return (
    <div className="v3WorkflowScreen v3Collection" data-page="collection">
      <header className="v3WorkflowHero">
        <h1>Collection</h1>
        <p>One row per set. Market value leads. Stacks open into the units that make up the cost.</p>
      </header>

      <section className="v3StatGrid" aria-label="Collection summary">
        <div><span>Positions</span><strong>{view.summary.positions}</strong></div>
        <div><span>Unique sets</span><strong>{view.summary.uniqueSets}</strong></div>
        <div><span>Stacks</span><strong>{view.summary.stacks}</strong></div>
        <div><span>In profit</span><strong>{view.summary.inProfit}</strong></div>
        <div><span>Sealed</span><strong>{view.summary.sealed}</strong></div>
        <div><span>Non-sealed</span><strong>{view.summary.opened}</strong></div>
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
            className={filter === item.id ? "primaryButton" : "ghostButton"}
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
        <section className="panel" aria-label="Sets">
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
        <section className="panel">
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
