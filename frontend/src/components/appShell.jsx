import { useEffect, useRef, useState } from "react";
import {
  APP_NAME,
  APP_SUBTAGLINE,
  APP_TAGLINE,
  APP_WORDMARK,
  PARTNER_TEST_FLOW,
} from "../appConfig";
import {
  AUTH_FEATURE_CARDS,
  AuthDashboardPreview,
  BrandLogo,
} from "./brandLogo";
import {
  buildHomeEntrySelection,
  buildPrimaryServiceRows,
  ENTRY_ONBOARDING_SLIDES,
} from "../serviceRegistry";
import {
  defaultIntroIdForPage,
  defaultSectionIdForIntro,
  readLaunchPreference,
  workspaceLabel,
} from "../appUtils";

export function EmptyState({ title, body }) {
  return (
    <div className="emptyState">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export function GlobalSearch({ open, query, onQueryChange, results, onSelect, onClose }) {
  const inputRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const safeActiveIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const handleClose = () => {
    setActiveIndex(0);
    onClose();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && results[safeActiveIndex]) {
      event.preventDefault();
      onSelect(results[safeActiveIndex]);
    }
  };

  return (
    <div className="globalSearchBackdrop" onClick={handleClose} role="presentation">
      <div
        className="globalSearchPanel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Global search"
      >
        <div className="globalSearchInputRow">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search workspaces, sections, and tools..."
            aria-label="Search"
            autoComplete="off"
          />
        </div>

        <div className="globalSearchResults">
          {results.length ? (
            <>
              <div className="globalSearchGroupLabel">Results</div>
              {results.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`globalSearchResult ${index === safeActiveIndex ? "active" : ""}`}
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <div className="globalSearchResultGlyph">{item.glyph}</div>
                  <div className="globalSearchResultCopy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <div className="globalSearchEmpty">
              {query.trim() ? "No matching workspaces or sections." : "Type to search across the platform."}
            </div>
          )}
        </div>

        <div className="globalSearchFooter">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            navigate
          </span>
          <span>
            <kbd>↵</kbd>
            open
          </span>
          <span>
            <kbd>esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

export function SaasTopNav({
  workspaceLabel,
  feedMode,
  feedModeTone,
  notificationCount,
  onOpenSearch,
  onOpenNotifications,
  onOpenFeedback,
  onLogout,
  userInitial,
}) {
  return (
    <header className="saasTopNav">
      <div className="saasTopNavBreadcrumb">
        <BrandLogo size="xs" className="saasTopNavLogo" />
        <span>{APP_NAME}</span>
        <span className="saasTopNavDivider">/</span>
        <strong>{workspaceLabel}</strong>
      </div>

      <button type="button" className="saasTopNavSearch" onClick={onOpenSearch}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Search workspaces...
        <kbd>⌘K</kbd>
      </button>

      <div className="saasTopNavActions">
        <div className={`saasTopNavPill live ${feedModeTone || ""}`}>{feedMode}</div>

        <button
          type="button"
          className="saasTopNavIconButton"
          aria-label="Alerts inbox"
          onClick={onOpenNotifications}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 2C5.8 2 4 3.8 4 6v2.5L2.5 11h11L12 8.5V6c0-2.2-1.8-4-4-4z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path d="M6.5 11a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {notificationCount ? <span className="badge">{notificationCount}</span> : null}
        </button>

        <button type="button" className="ghostButton" onClick={onOpenFeedback}>
          Feedback
        </button>
        <button type="button" className="ghostButton" onClick={onLogout}>
          Log out
        </button>
        <div className="avatarCircle">{userInitial}</div>
      </div>
    </header>
  );
}

export function ExecutiveSummaryStrip({ metrics = [] }) {
  if (!metrics.length) {
    return null;
  }

  return (
    <section className="executiveSummaryStrip" aria-label="Executive summary">
      {metrics.map((metric) => (
        <button
          key={metric.id}
          type="button"
          className="executiveKpiCard"
          onClick={metric.action}
        >
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.detail}</small>
        </button>
      ))}
    </section>
  );
}
export function WorkspaceHero({
  tone = "blue",
  eyebrow,
  title,
  description,
  metrics = [],
  statusLabel,
  statusValue,
  primaryAction,
  secondaryAction,
}) {
  return (
    <section className={`workspaceHero workspaceHero-${tone}`}>
      <div className="workspaceHeroCopy">
        {eyebrow ? <div className="workspaceHeroEyebrow">{eyebrow}</div> : null}
        <div className="workspaceHeroText">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        {primaryAction || secondaryAction ? (
          <div className="workspaceHeroActions">
            {primaryAction ? (
              <button type="button" className="primaryButton" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </button>
            ) : null}
            {secondaryAction ? (
              <button type="button" className="ghostButton" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="workspaceHeroRail">
        {statusLabel || statusValue ? (
          <div className="workspaceHeroStatus">
            <span>{statusLabel || "Status"}</span>
            <strong>{statusValue || "--"}</strong>
          </div>
        ) : null}

        <div className="workspaceHeroMetricGrid">
          {metrics.map((metric) => (
            <div className="workspaceHeroMetric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.detail ? <small>{metric.detail}</small> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WorkspaceSectionBar({ title = "On this screen", sections, onSelect }) {
  if (!sections?.length) {
    return null;
  }

  return (
    <section className="workspaceSectionBar">
      <div className="workspaceSectionBarHeader">
        <span>{title}</span>
        <small>Jump directly to the part of the workspace you need.</small>
      </div>
      <div className="workspaceSectionChipRow">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className="workspaceSectionChip"
            onClick={() => onSelect(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function WorkspaceCommandBar({
  title = "Quick Actions",
  hint = "Use these shortcuts to move through the workflow without hunting around.",
  tone = "default",
  actions = [],
}) {
  const visibleActions = actions.filter(Boolean);

  if (!visibleActions.length) {
    return null;
  }

  return (
    <section className={`workspaceCommandBar workspaceCommandBar-${tone}`}>
      <div className="workspaceCommandBarHeader">
        <span>{title}</span>
        <small>{hint}</small>
      </div>
      <div className="workspaceCommandGrid">
        {visibleActions.map((action) => (
          <button
            key={action.id || action.label}
            type="button"
            className={`workspaceCommandCard ${action.active ? "active" : ""}`}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            <div className="workspaceCommandCardTop">
              <span>{action.label}</span>
              {action.meta ? <strong>{action.meta}</strong> : null}
            </div>
            {action.detail ? <small>{action.detail}</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export function BootSplash() {
  return (
    <div className="bootSplashShell" aria-label={`${APP_NAME} is opening`}>
      <div className="bootSplashPanel">
        <BrandLogo variant="full" size="xl" className="bootSplashLogo" />
        <div className="bootSplashTag">{APP_TAGLINE}</div>
        <div className="bootSplashPulse" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export function SplashScreen({ ready, activeDesk, onLaunch }) {
  const savedLaunch = readLaunchPreference();
  const launchDesk = savedLaunch?.desk || activeDesk;
  const defaultTradingDesk = launchDesk;
  const homeLaunch = buildHomeEntrySelection(launchDesk);
  const serviceMenuRows = buildPrimaryServiceRows({
    launchDesk,
    launchDeskLabel: "LEGO",
    defaultTradingDesk,
    defaultTradingDeskLabel: "LEGO",
  });
  const onboardingSlides = ENTRY_ONBOARDING_SLIDES;
  const [onboardingStep, setOnboardingStep] = useState(onboardingSlides.length);
  const onboardingComplete = onboardingStep >= onboardingSlides.length;
  const currentOnboardingSlide =
    onboardingSlides[Math.min(onboardingStep, onboardingSlides.length - 1)];

  const advanceOnboarding = () => {
    setOnboardingStep((step) => Math.min(step + 1, onboardingSlides.length));
  };

  const skipOnboarding = () => {
    setOnboardingStep(onboardingSlides.length);
  };

  if (!onboardingComplete) {
    return (
      <div className="splashShell splashShellMobile">
        <div className="onboardingPanel">
          <div className="onboardingTopBar">
            <BrandLogo variant="full" size="sm" />
            <button type="button" className="ghostButton onboardingSkipButton" onClick={skipOnboarding}>
              Skip
            </button>
          </div>

          <div className={`onboardingCard onboardingCard-${currentOnboardingSlide.accent}`}>
            <div className="onboardingGraphic">
              <div className="onboardingGraphicFrame">
                <div className="onboardingGraphicChrome">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="onboardingGraphicStage">
                  <div className="onboardingGraphicBadge">{currentOnboardingSlide.glyph}</div>
                  <div className="onboardingGraphicBars">
                    {currentOnboardingSlide.bars.map((bar, index) => (
                      <span key={`${currentOnboardingSlide.id}-${bar}-${index}`} style={{ height: `${bar}%` }} />
                    ))}
                  </div>
                </div>
                <div className="onboardingGraphicFooter">
                  <span />
                  <span />
                </div>
              </div>
            </div>

            <div className="splashEyebrow">{currentOnboardingSlide.eyebrow}</div>
            <h1>{currentOnboardingSlide.title}</h1>
            <p className="authBlurb">{currentOnboardingSlide.description}</p>
          </div>

          <div className="onboardingFooter">
            <div className="onboardingDots" aria-label="Onboarding progress">
              {onboardingSlides.map((slide, index) => (
                <span
                  key={slide.id}
                  className={`onboardingDot ${index === onboardingStep ? "active" : ""}`}
                />
              ))}
            </div>

            <button type="button" className="primaryButton onboardingPrimaryButton" onClick={advanceOnboarding}>
              {onboardingStep === onboardingSlides.length - 1 ? "Open Menu" : "Next"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="splashShell splashShellMobile">
      <div className="splashPanel splashPanelCompact splashMenuBackdrop splashPanelServicesOnly">
        <div className="splashCompactHeader">
          <div className="authBrandLockup splashServiceBrandLockup">
            <BrandLogo size="md" />
            <div className="authBrandMeta">
              <div className="authBrand">{APP_WORDMARK}</div>
              <small>Investment Platform</small>
            </div>
          </div>
        </div>

        <div className="mobileMenuScreenList splashServiceMenuList splashServiceMenuOnly">
          {serviceMenuRows.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mobileMenuRow mobileMenuRow-${item.tone || "support"} launchMenuRow`}
              onClick={() => onLaunch(item.selection)}
              disabled={!ready}
            >
              <div className="mobileMenuRowGlyph">{item.glyph}</div>
              <div className="mobileMenuRowCopy">
                <div className="mobileMenuRowTop">
                  <span>{item.ordinal}</span>
                  <small>{item.tag}</small>
                </div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
              <div className="mobileMenuRowArrow" aria-hidden="true">{">"}</div>
            </button>
          ))}
        </div>

        <div className="chooserActionRow chooserActionRowSplit">
          <button
            type="button"
            className="primaryButton splashRailPrimary"
            onClick={() => onLaunch(homeLaunch)}
            disabled={!ready}
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function describeLaunchSelection(page) {
  if (page === "home") {
    return {
      label: "Executive Dashboard",
      hint: "You'll land on the hub with quick launch, session context, and partner-readiness cards.",
    };
  }

  if (page === "scan-evaluate") {
    return {
      label: "Scan & Evaluate",
      hint: "You'll land on the scan flow and can generate an evaluation immediately.",
    };
  }

  return {
    label: workspaceLabel(page),
    hint: "Your first workspace will be ready as soon as you sign in.",
  };
}

export function LandingShell({ initialLaunch, onContinue, onDemo, demoBusy = false, demoStatus = "" }) {
  const landingActions = [
    {
      id: "scan-evaluate",
      glyph: "📷",
      eyebrow: "Start",
      title: "Scan & Evaluate",
      page: "scan-evaluate",
      introId: "scan-evaluate",
      sectionId: "scan-evaluate",
      destination: "Instant evaluation",
      bestFor: "Start with a set",
      blurb: "Upload a photo, confirm the set, generate a Brick Alpha score, then save it into your portfolio.",
    },
    {
      id: "collectibles",
      glyph: "CL",
      eyebrow: "Analyze",
      title: "LEGO Investments",
      page: "collectibles",
      introId: "collectibles",
      sectionId: "investment-analysis",
      destination: "Investment analysis",
      bestFor: "Analyze and save holdings",
      blurb: "Run an investment analysis, attach evidence and notes, and manage LEGO positions in one workflow.",
    },
  ];
  const secondaryActions = [
    {
      id: "home",
      glyph: "HM",
      eyebrow: "Hub",
      title: "Dashboard",
      page: "home",
      introId: "home",
      sectionId: "home-dashboard",
      destination: "Executive Dashboard",
      blurb: "Land on the executive dashboard for NAV, collection grade, and portfolio intelligence.",
    },
    {
      id: "portfolio",
      glyph: "PF",
      eyebrow: "Book",
      title: "Portfolio",
      page: "portfolio",
      introId: "portfolio",
      sectionId: "open-positions",
      destination: "Open positions",
      blurb: "Review holdings, position details, and activity history.",
    },
      {
        id: "subscriptions",
        glyph: "SB",
        eyebrow: "Plans",
        title: "Subscriptions",
        page: "subscriptions",
        introId: "subscriptions",
        sectionId: "subscriptions-overview",
        destination: "Subscription plans",
        blurb: "Show plan tiers, premium features, and the value path that makes the service commercially real.",
      },
    {
      id: "settings",
      glyph: "ST",
      eyebrow: "Setup",
      title: "Settings",
      page: "settings",
      introId: "settings",
      sectionId: "news-region",
      destination: "Workspace settings",
      blurb: "Adjust region, workspace preferences, and saved desk targets before the session starts.",
    },
  ];
  const allActions = [...landingActions, ...secondaryActions];

  const initialPage = initialLaunch?.page || "scan-evaluate";
  const initialDesk = initialLaunch?.desk || "forex";
  const initialIntroId = initialLaunch?.introId || defaultIntroIdForPage(initialPage);
  const [selectedActionId, setSelectedActionId] = useState(
    allActions.some((action) => action.id === initialLaunch?.landingId)
      ? initialLaunch.landingId
      : allActions.find((action) => action.page === initialPage && action.sectionId === initialLaunch?.sectionId)
        ?.id || initialIntroId,
  );
  const [selectedPage, setSelectedPage] = useState(initialPage);
  const [selectedDesk] = useState(initialDesk);
  const [selectedIntroId, setSelectedIntroId] = useState(initialIntroId);
  const [selectedSectionId, setSelectedSectionId] = useState(
    initialLaunch?.sectionId || defaultSectionIdForIntro(initialPage, initialIntroId),
  );

  const selectedAction =
    allActions.find((action) => action.id === selectedActionId) || allActions[0];
  const launchDetails = describeLaunchSelection(selectedPage);

  const handleActionSelect = (action) => {
    setSelectedActionId(action.id);
    setSelectedPage(action.page);
    setSelectedIntroId(action.introId);
    setSelectedSectionId(action.sectionId || defaultSectionIdForIntro(action.page, action.introId));
  };

  return (
    <div className="splashShell landingShell">
      <div className="splashPanel landingPanel">
        <div className="splashHero landingHero">
          <div className="splashHeroCopy">
            <BrandLogo variant="full" size="lg" className="landingHeroLogo" />
            <div className="splashEyebrow">INVESTMENT PLATFORM</div>
            <h1>Your LEGO investment command center.</h1>
            <p className="authBlurb">
              Portfolio intelligence, AI investment scores, and collection analytics in one premium
              platform. Create an account or explore the live demo.
            </p>

            <div className="landingHeroActions">
              <button
                type="button"
                className="primaryButton"
                onClick={() =>
                  onContinue(
                    {
                      page: selectedPage,
                      desk: selectedDesk,
                      introId: selectedIntroId,
                      sectionId: selectedSectionId,
                      landingId: selectedActionId,
                    },
                    "register",
                  )
                }
              >
                Create Account
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={() =>
                  onContinue(
                    {
                      page: selectedPage,
                      desk: selectedDesk,
                      introId: selectedIntroId,
                      sectionId: selectedSectionId,
                      landingId: selectedActionId,
                    },
                    "login",
                  )
                }
              >
                Sign In
              </button>
              {onDemo ? (
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() =>
                    onDemo({
                      page: selectedPage,
                      desk: selectedDesk,
                      introId: selectedIntroId,
                      sectionId: selectedSectionId,
                      landingId: selectedActionId,
                    })
                  }
                  disabled={demoBusy}
                >
                  {demoBusy ? "Opening Demo..." : "Enter Demo"}
                </button>
              ) : null}
            </div>

            <div className="landingValueGrid">
              <div className="landingValueCard">
                <span>Identify</span>
                <strong>Scan set details fast</strong>
                <small>Upload a photo, confirm the match, and capture the set identity cleanly.</small>
              </div>
              <div className="landingValueCard">
                <span>Evaluate</span>
                <strong>Brick Alpha score + thesis</strong>
                <small>Get a recommendation with a clear score breakdown and evidence-led notes.</small>
              </div>
              <div className="landingValueCard">
                <span>Track</span>
                <strong>Portfolio intelligence</strong>
                <small>Save holdings and review performance, retirement timelines, and activity history.</small>
              </div>
            </div>

            <div className="landingFeatureRow">
              <div className="landingFeatureChip">
                <span>Workflow</span>
                <strong>Scan → Evaluate → Save</strong>
              </div>
              <div className="landingFeatureChip">
                <span>Holdings</span>
                <strong>LEGO investment holdings</strong>
              </div>
              <div className="landingFeatureChip">
                <span>Commercial</span>
                <strong>Subscriptions-ready</strong>
              </div>
              <div className="landingFeatureChip">
                <span>Workspace state</span>
                <strong>Saved per account</strong>
              </div>
            </div>

            <div className="landingTesterCard">
              <span>Partner testing route</span>
              <strong>Landing, Scan & Evaluate, LEGO Investments, Portfolio, Feedback Board</strong>
              <small>
                If this session is for partner feedback, use the built-in test pass so notes land in one
                place and cover the main product surfaces.
              </small>
              <div className="landingTesterSteps">
                {PARTNER_TEST_FLOW.map((step) => (
                  <div className="landingTesterStep" key={step.id}>
                    <span>{step.ordinal}</span>
                    <strong>{step.title}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="splashPreviewPanel landingPreviewPanel">
            <span>Session route</span>
            <strong>{launchDetails.label}</strong>
            <small>{launchDetails.hint}</small>

            <div className="splashPreviewGrid">
              <div className="splashPreviewCard">
                <span>Start</span>
                <strong>{selectedAction.title}</strong>
              </div>
              <div className="splashPreviewCard">
                <span>Desk</span>
                <strong>
                  {"LEGO Investments"}
                </strong>
              </div>
              <div className="splashPreviewCard">
                <span>Landing</span>
                <strong>{selectedSectionId ? "Focused" : "Default"}</strong>
              </div>
              <div className="splashPreviewCard">
                <span>Mode</span>
                <strong>{onDemo ? "Demo or sign-in" : "Authentication required"}</strong>
              </div>
            </div>

            <div className="landingRouteStack">
              <div className="landingRouteStep">
                <span>01</span>
                <div>
                  <strong>Choose the lane</strong>
                  <small>{selectedAction.title} becomes your first working surface.</small>
                </div>
              </div>
              <div className="landingRouteStep">
                <span>02</span>
                <div>
                  <strong>Follow one workflow</strong>
                  <small>Scan, evaluate, save, and review without switching product lanes.</small>
                </div>
              </div>
              <div className="landingRouteStep">
                <span>03</span>
                <div>
                  <strong>Create account or sign in</strong>
                  <small>Your selected route is carried through auth and restored on entry.</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="splashSection splashSectionPrimary">
          <div className="splashSectionHeader">
            <div>
              <span>Choose Your Start</span>
              <strong>Choose where to start</strong>
              <p>Pick the first lane you want to open after account access.</p>
            </div>
          </div>

          <div className="splashGrid splashGridPrimary landingPrimaryGrid">
            {landingActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`splashCard splashCardPrimary ${selectedActionId === action.id ? "active" : ""}`}
                onClick={() => handleActionSelect(action)}
              >
                <div className="splashCardMeta">
                  <span className="splashGlyph">{action.glyph}</span>
                  <span className="splashCardFlag">{action.eyebrow}</span>
                </div>
                <div className="splashCardHeaderCopy">
                  <strong>{action.title}</strong>
                  <small>{action.blurb}</small>
                </div>
                <div className="landingChoiceMeta">
                  <div className="landingChoiceMetaItem">
                    <span>Best for</span>
                    <strong>{action.bestFor}</strong>
                  </div>
                  <div className="landingChoiceMetaItem">
                    <span>Opens to</span>
                    <strong>{action.destination}</strong>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="splashSection splashSectionSecondary">
          <div className="splashSectionHeader">
            <div>
              <span>More Workspaces</span>
              <strong>Open the supporting parts of the platform first if that’s your priority</strong>
              <p>Account and billing workspaces stay available without distracting from the LEGO investment workflow.</p>
            </div>
          </div>

          <div className="splashWorkspaceRow landingWorkspaceRow">
            {secondaryActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`splashWorkspaceChip ${selectedActionId === action.id ? "active" : ""}`}
                onClick={() => handleActionSelect(action)}
              >
                <div className="landingWorkspaceHeader">
                  <span>{action.title}</span>
                  <strong>{action.glyph}</strong>
                </div>
                <em>{action.destination}</em>
                <small>{action.blurb}</small>
              </button>
            ))}
          </div>
        </div>

        {null}

        <div className="panelActions landingActions">
          {demoStatus ? <div className="statusBanner">{demoStatus}</div> : null}
          {onDemo ? (
            <button
              type="button"
              className="secondaryButton"
              onClick={() =>
                onDemo({
                  page: selectedPage,
                  desk: selectedDesk,
                  introId: selectedIntroId,
                  sectionId: selectedSectionId,
                  landingId: selectedActionId,
                })
              }
              disabled={demoBusy}
            >
              {demoBusy ? "Opening Demo..." : "Enter Demo"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AuthShell({
  authMode,
  authView = "auth",
  authForm,
  resetForm,
  authStatus,
  resetStatus,
  resetHintCode,
  onBack,
  onModeChange,
  onSubmit,
  onFieldChange,
  onResetFieldChange,
  onForgotPassword,
  onPasswordResetRequest,
  onPasswordResetConfirm,
  onReturnToLogin,
  onDemo,
  demoBusy = false,
}) {
  const isResetRequest = authView === "forgot-request";
  const isResetConfirm = authView === "forgot-reset";
  const isResetFlow = isResetRequest || isResetConfirm;

  return (
    <div className="authShell premiumAuthShell">
      <div className="authShellInner premiumAuthLayout">
        <section className="authBrandStage">
          <BrandLogo variant="full" size="hero" className="authBrandStageLogo" />
          <h1 className="authBrandStageHeadline">
            AI Investment Intelligence
            <span>for LEGO Collectors</span>
          </h1>
          <p className="authBrandStageSubheadline">{APP_SUBTAGLINE}</p>

          <div className="authFeatureGrid">
            {AUTH_FEATURE_CARDS.map((feature) => (
              <div className="authFeatureCard" key={feature.id}>
                <span className="authFeatureCheck" aria-hidden="true">
                  ✓
                </span>
                <strong>{feature.label}</strong>
              </div>
            ))}
          </div>

          <AuthDashboardPreview />
        </section>

        <div className="authPanel authPanelPremium authPanelStandalone">
          <div className="authPanelHeader">
            <div>
              <div className="authBrandLockup authBrandLockupCompact">
                <BrandLogo size="sm" />
                <div className="authBrandMeta">
                  <div className="authBrand">{APP_WORDMARK}</div>
                  <small>{APP_TAGLINE}</small>
                </div>
              </div>
              <h2>
                {isResetRequest
                  ? "Reset your password"
                  : isResetConfirm
                    ? "Set a new password"
                    : authMode === "login"
                      ? "Welcome back"
                      : "Create your account"}
              </h2>
              <p>
                {isResetRequest
                  ? "Enter your email and we will send you a reset code."
                  : isResetConfirm
                    ? "Enter your reset code and choose a new password."
                    : authMode === "login"
                      ? "Sign in to your investment dashboard."
                      : "Start building portfolio intelligence for your collection."}
              </p>
            </div>
            {onBack ? (
              <button type="button" className="ghostButton authBackButton" onClick={onBack}>
                Back
              </button>
            ) : null}
          </div>

          {isResetFlow ? (
            <form className="authForm" onSubmit={isResetRequest ? onPasswordResetRequest : onPasswordResetConfirm}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={resetForm.email}
                  onChange={(event) => onResetFieldChange("email", event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>

              {isResetConfirm ? (
                <>
                  <label>
                    <span>Reset code</span>
                    <input
                      type="text"
                      value={resetForm.code}
                      onChange={(event) => onResetFieldChange("code", event.target.value)}
                      placeholder="6-digit code"
                      autoComplete="one-time-code"
                    />
                  </label>

                  {resetHintCode ? (
                    <div className="statusBanner subtleBanner">
                      <strong>Your reset code</strong>
                      <small>
                        Enter <strong>{resetHintCode}</strong> to continue.
                      </small>
                    </div>
                  ) : null}

                  <label>
                    <span>New password</span>
                    <input
                      type="password"
                      value={resetForm.password}
                      onChange={(event) => onResetFieldChange("password", event.target.value)}
                      placeholder="Minimum 8 characters"
                      autoComplete="new-password"
                    />
                  </label>

                  <label>
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={resetForm.confirmPassword}
                      onChange={(event) => onResetFieldChange("confirmPassword", event.target.value)}
                      placeholder="Repeat the new password"
                      autoComplete="new-password"
                    />
                  </label>
                </>
              ) : null}

              {resetStatus ? <div className="statusBanner">{resetStatus}</div> : null}

              <button className="primaryButton authPrimaryButton" type="submit">
                {isResetRequest ? "Send reset code" : "Reset password"}
              </button>

              <div className="authAuxActions">
                <button type="button" className="ghostButton authLinkButton" onClick={onReturnToLogin}>
                  Back to sign in
                </button>
                {isResetConfirm ? (
                  <button type="button" className="ghostButton authLinkButton" onClick={onPasswordResetRequest}>
                    Request new code
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <>
              <div className="segmentedControl authModeSwitch">
                <button
                  type="button"
                  className={authMode === "login" ? "active" : ""}
                  onClick={() => onModeChange("login")}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={authMode === "register" ? "active" : ""}
                  onClick={() => onModeChange("register")}
                >
                  Create Account
                </button>
              </div>

              <form className="authForm authFormPremium" onSubmit={onSubmit}>
                {authMode === "register" ? (
                  <label>
                    <span>Name</span>
                    <input
                      type="text"
                      value={authForm.name}
                      onChange={(event) => onFieldChange("name", event.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </label>
                ) : null}

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(event) => onFieldChange("email", event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>

                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => onFieldChange("password", event.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  />
                </label>

                {authMode === "login" ? (
                  <div className="authAuxActions">
                    <button type="button" className="ghostButton authLinkButton" onClick={onForgotPassword}>
                      Forgot password?
                    </button>
                  </div>
                ) : null}

                {authStatus ? <div className="statusBanner">{authStatus}</div> : null}

                <button className="primaryButton authPrimaryButton" type="submit">
                  {authMode === "login" ? "Sign In" : "Create Account"}
                </button>
                {onDemo ? (
                  <button type="button" className="secondaryButton" onClick={onDemo} disabled={demoBusy}>
                    {demoBusy ? "Opening demo..." : "Enter Demo"}
                  </button>
                ) : null}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}







