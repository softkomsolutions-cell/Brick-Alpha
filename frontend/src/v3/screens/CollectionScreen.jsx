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

export function CollectionScreen({ openTrades = [], collectibles = [], navigateToPage }) {
  const view = useMemo(
    () => buildCollectionView(openTrades, collectibles),
    [collectibles, openTrades],
  );
  const [filter, setFilter] = useState("all");
  const [theme, setTheme] = useState(view.themes[0] || "");
  const [expandedId, setExpandedId] = useState("");
  const rows = filterCollectionSets(view.sets, filter, theme);

  return (
    <div className="v3WorkflowScreen" data-page="collection">
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
        <div><span>Opened</span><strong>{view.summary.opened}</strong></div>
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
            {rows.map((set) => {
              const expanded = expandedId === set.id;
              return (
                <article key={set.id} className="v3CollectionRow">
                  <button
                    type="button"
                    className="v3CollectionMain"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? "" : set.id)}
                  >
                    <div>
                      <strong>{set.name}</strong>
                      <small>
                        #{set.setNumber} · {set.theme} · {set.condition} · {set.units}{" "}
                        {set.units === 1 ? "unit" : "units"}
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
