import { V3_PAGE, V3_PRIMARY_NAV } from "./v3Nav";

export function V3BottomNav({ activePage, onNavigate }) {
  return (
    <nav className="v3BottomNav" aria-label="Primary navigation">
      {V3_PRIMARY_NAV.map((item) => {
        if (item.centerAction) {
          const active = activePage === V3_PAGE.SCAN;
          return (
            <div key={item.id} className="v3BottomNavItem v3BottomNavItem--scan">
              <button
                type="button"
                className={`v3BottomNavScanButton ${active ? "active" : ""}`}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <span aria-hidden="true">{item.glyph}</span>
              </button>
              <strong>{item.label}</strong>
            </div>
          );
        }

        const active = activePage === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`v3BottomNavItem ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span aria-hidden="true">{item.glyph}</span>
            <strong>{item.label}</strong>
          </button>
        );
      })}
    </nav>
  );
}
