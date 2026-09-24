import { BrandLogo } from "../components/brandLogo";
import { APP_TAGLINE, APP_WORDMARK } from "../appConfig";
import { V3_ACCOUNT_NAV, V3_PRIMARY_NAV, V3_SECONDARY_NAV } from "./v3Nav";

export function V3Sidebar({
  activePage,
  workspaceHint,
  userLabel,
  userInitial,
  onNavigate,
  onBrandClick,
}) {
  return (
    <aside className="v3Sidebar" aria-label="Application navigation">
      <div className="v3SidebarBrand">
        <button type="button" onClick={onBrandClick} aria-label="Brick Alpha home">
          <BrandLogo size="md" />
        </button>
        <button type="button" onClick={onBrandClick}>
          <div className="v3SidebarWordmark">{APP_WORDMARK}</div>
          <div className="v3SidebarTagline">{APP_TAGLINE}</div>
        </button>
        {workspaceHint ? <small className="v3SidebarTagline">{workspaceHint}</small> : null}
      </div>

      <div>
        <div className="v3SidebarSectionLabel">Invest</div>
        <nav className="v3SidebarNav">
          {V3_PRIMARY_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`v3SidebarNavItem ${activePage === item.id ? "active" : ""}`}
              aria-current={activePage === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="v3SidebarNavGlyph">{item.glyph}</span>
              <span className="v3SidebarNavCopy">
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </nav>
      </div>

      <div>
        <div className="v3SidebarSectionLabel">Decision path</div>
        <nav className="v3SidebarNav">
          {V3_SECONDARY_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`v3SidebarNavItem ${activePage === item.id ? "active" : ""}`}
              aria-current={activePage === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="v3SidebarNavGlyph">{item.glyph}</span>
              <span className="v3SidebarNavCopy">
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </nav>
      </div>

      <div>
        <div className="v3SidebarSectionLabel">Account</div>
        <nav className="v3SidebarNav">
          {V3_ACCOUNT_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`v3SidebarNavItem ${activePage === item.id ? "active" : ""}`}
              aria-current={activePage === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="v3SidebarNavGlyph">{item.glyph}</span>
              <span className="v3SidebarNavCopy">
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </nav>
      </div>

      <div className="v3SidebarUser">
        <div className="avatarCircle">{userInitial}</div>
        <div className="v3SidebarNavCopy">
          <span>{userLabel}</span>
          <small>LEGO collection investor</small>
        </div>
      </div>
    </aside>
  );
}
