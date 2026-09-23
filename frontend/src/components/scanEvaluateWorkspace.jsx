import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildBrickAlphaScoreBreakdown,
  confidenceFor,
  enrichBrickAlphaCollectible,
  letterGradeFor,
} from "../brickAlphaModel";
import { formatCollectiblePrice } from "../appUtils";
import { presentResearchFields, buildCanonicalAdvisor } from "../v3/decision/decisionModel";
import { formatCanonicalValue } from "../v3/valuation/valuationAuthority";
import {
  buildForecastCards,
  buildMarketPricing,
  buildRetirementSnapshot,
  findCatalogMatch,
  getCopilotResponse,
  getDemoSetProfile,
  identifySetNumberFromFilename,
  PREMIUM_COMPARABLES,
  PROCESSING_STEPS,
  riskLabel,
  runProcessingPipeline,
  searchDemoSets,
} from "../scanEvaluationData";
import { monthsUntilRetirement, portfolioStatusFor } from "../retirementIntelligenceData";
import { ScoreBar, ScoreRing } from "./brickAlphaScoreDisplay";
import { ScoreExplanationPanel } from "./scoreExplanationPanel";
import { AlphaSignalBadges } from "./workspaceCards";
import { buildDecisionSnapshot } from "../v3/decision/decisionModel";
import { saveDecisionSnapshot } from "../v3/decision/decisionSession";

const ACQUISITION_METHODS = [
  { id: "camera", icon: "📷", label: "Take Photo", detail: "Use your device camera" },
  { id: "upload", icon: "🖼", label: "Upload Image", detail: "Box, barcode, or receipt" },
  { id: "manual", icon: "⌨", label: "Enter Set Number", detail: "Search by number or name" },
];

function extractSetNumber(item) {
  if (item?.sku) {
    return item.sku;
  }
  const match = String(item?.id || "").match(/(\d{4,6})/);
  return match ? match[1] : "--";
}

function normalizeSetNumber(value) {
  return String(value || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 6);
}

function recommendationTone(recommendation) {
  if (recommendation === "Strong Buy" || recommendation === "Buy") {
    return "buy";
  }
  if (recommendation === "Sell" || recommendation === "Avoid") {
    return "sell";
  }
  return "hold";
}

function displayRecommendation(recommendation) {
  if (recommendation === "Watch") {
    return "Hold";
  }
  if (recommendation === "Avoid") {
    return "Reduce";
  }
  return recommendation || "Hold";
}

function buildEvaluation(item) {
  return enrichBrickAlphaCollectible({
    ...item,
    buyPrice: item.buyPrice || item.price || item.retailPrice,
    price: item.currentMarketValue || item.price || item.retailPrice,
    currentMarketValue: item.currentMarketValue || item.price || item.retailPrice,
    quantityOwned: 1,
    storeSource: item.venue || "Scan evaluation",
  });
}

function CameraModal({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setError("Camera unavailable — use Upload Image instead.");
      }
    }

    startCamera();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }
        const file = new File([blob], `brick-alpha-capture-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        onCapture(file, canvas.toDataURL("image/jpeg", 0.92));
        onClose();
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture, onClose]);

  return (
    <div className="seCameraOverlay" role="dialog" aria-label="Camera capture">
      <div className="seCameraModal">
        <div className="seCameraHeader">
          <h3>Capture LEGO set</h3>
          <button type="button" className="ghostButton" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? (
          <p className="seCameraError">{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="seCameraVideo" />
        )}
        <div className="seCameraActions">
          <button type="button" className="primaryButton" onClick={handleCapture} disabled={Boolean(error)}>
            Capture Photo
          </button>
        </div>
      </div>
    </div>
  );
}

function ProcessingOverlay({ activeStepIndex }) {
  return (
    <div className="seProcessingOverlay">
      <div className="seProcessingCard">
        <div className="seProcessingPulse" aria-hidden="true" />
        <h2>Brick Alpha AI</h2>
        <ol className="seProcessingSteps">
          {PROCESSING_STEPS.map((step, index) => {
            const state =
              index < activeStepIndex ? "complete" : index === activeStepIndex ? "active" : "upcoming";
            return (
              <li key={step.id} className={`seProcessingStep seProcessingStep-${state}`}>
                <span className="seProcessingDot" />
                {step.label}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ManualSearchPanel({ collectibles, onSelect, onCancel }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchDemoSets(query, collectibles), [collectibles, query]);

  return (
    <article className="seGlassCard seManualPanel">
      <div className="seSectionHeader">
        <span className="executiveDashboardEyebrow">Manual identification</span>
        <h2>AI could not identify automatically</h2>
        <p>Search by set number, name, or theme — autocomplete against the Brick Alpha catalog.</p>
      </div>
      <label className="seField">
        <span>Search catalog</span>
        <input
          type="search"
          placeholder="e.g. 75252, Rivendell, Star Wars"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </label>
      {results.length ? (
        <ul className="seSearchResults">
          {results.map((result) => (
            <li key={result.id || result.setNumber}>
              <button type="button" className="seSearchResult" onClick={() => onSelect(result)}>
                <strong>{result.name}</strong>
                <span>
                  #{result.setNumber} · {result.theme}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : query ? (
        <p className="seSearchEmpty">No matches — try a set number like 75252 or 10316.</p>
      ) : null}
      <button type="button" className="ghostButton" onClick={onCancel}>
        Back to scan
      </button>
    </article>
  );
}

function CopilotCard({ evaluation, demoProfile }) {
  const [question, setQuestion] = useState("Should I buy three of these?");
  const [response, setResponse] = useState(() =>
    getCopilotResponse("Should I buy three of these?", { evaluation, demoProfile }),
  );

  const handleAsk = useCallback(() => {
    setResponse(getCopilotResponse(question, { evaluation, demoProfile }));
  }, [demoProfile, evaluation, question]);

  return (
    <article className="seGlassCard seCopilotCard">
      <div className="seSectionHeader">
        <span className="executiveDashboardEyebrow">AI Copilot</span>
        <h2>Investment advisor</h2>
      </div>
      <div className="seCopilotThread">
        <div className="seCopilotMessage seCopilotMessage-user">
          <span>You</span>
          <p>{question}</p>
        </div>
        <div className="seCopilotMessage seCopilotMessage-ai">
          <span>Brick Alpha</span>
          <p>{response}</p>
        </div>
      </div>
      <div className="seCopilotInput">
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleAsk();
            }
          }}
          placeholder={`Ask about ${evaluation?.name || "this set"}…`}
        />
        <button type="button" className="primaryButton" onClick={handleAsk}>
          Ask
        </button>
      </div>
    </article>
  );
}

export function ScanEvaluateWorkspace({
  collectibles = [],
  openTrades = [],
  handleCollectibleSelect,
  jumpToPageSection,
  onAddToWatchlist,
  openCollectibleTicket,
  navigateToPage,
}) {
  const fileInputRef = useRef(null);
  const hasWebcam = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  const [phase, setPhase] = useState("landing");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageName, setImageName] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [actionStatus, setActionStatus] = useState("");
  const [identifiedSetNumber, setIdentifiedSetNumber] = useState("");

  const demoProfile = useMemo(
    () => getDemoSetProfile(identifiedSetNumber || extractSetNumber(evaluation)),
    [evaluation, identifiedSetNumber],
  );

  const breakdown = useMemo(
    () => (evaluation ? buildBrickAlphaScoreBreakdown(evaluation) : null),
    [evaluation],
  );

  const marketPricing = useMemo(
    () => (evaluation ? buildMarketPricing(evaluation, demoProfile) : null),
    [demoProfile, evaluation],
  );

  const forecasts = useMemo(() => (evaluation ? buildForecastCards(evaluation) : []), [evaluation]);
  const aiSummary = useMemo(() => {
    if (!evaluation) {
      return null;
    }
    const presented = presentResearchFields(evaluation);
    return buildCanonicalAdvisor({
      name: evaluation.name,
      verdict: { label: presented.verdictLabel },
      valuation: presented,
      retirement: {
        status: presented.retirementStatus,
        monthsRemaining: presented.monthsRemaining,
      },
    });
  }, [evaluation]);
  const retirementSnapshot = useMemo(
    () => (evaluation ? buildRetirementSnapshot(evaluation) : null),
    [evaluation],
  );

  const portfolioStatus = useMemo(
    () => (evaluation ? portfolioStatusFor(evaluation, openTrades) : "Not Owned"),
    [evaluation, openTrades],
  );

  const confidence = evaluation ? confidenceFor(evaluation) : 0;
  const displayImage = imagePreview || demoProfile?.imageUrl || null;
  const showImage = Boolean(displayImage) && !imageFailed;

  const runAnalysis = useCallback(
    async (setNumber, file, previewUrl, fileName) => {
      setPhase("processing");
      setProcessingIndex(0);
      setActionStatus("");

      await runProcessingPipeline((_stepId, index) => {
        setProcessingIndex(index);
      });

      const normalized = normalizeSetNumber(setNumber);
      if (!normalized) {
        setPhase("manual");
        setActionStatus("AI could not identify automatically — search the catalog below.");
        return;
      }

      const profile = getDemoSetProfile(normalized);
      let match = findCatalogMatch(collectibles, normalized, 0);

      if (!match && profile) {
        match = {
          id: `lego-demo-${normalized}`,
          sku: normalized,
          name: profile.name,
          brand: "LEGO",
          category: profile.theme,
          legoTheme: profile.theme,
          retailPrice: profile.retailPrice,
          price: Math.round(profile.retailPrice * 0.88),
          currentMarketValue: Math.round(profile.retailPrice * 0.88),
          numberOfPieces: profile.pieces,
          numberOfMinifigures: profile.minifigures,
        };
      }

      if (!match) {
        setPhase("manual");
        setActionStatus("Set not found in catalog — search manually below.");
        return;
      }

      const enriched = buildEvaluation({
        ...match,
        ...(profile
          ? {
              name: profile.name,
              legoTheme: profile.theme,
              category: profile.theme,
              retailPrice: profile.retailPrice,
              numberOfPieces: profile.pieces,
              numberOfMinifigures: profile.minifigures,
            }
          : {}),
      });

      setIdentifiedSetNumber(normalized);
      const snapshot = buildDecisionSnapshot({
        evaluation: enriched,
        imageUrl: previewUrl || profile?.imageUrl || "",
        profile,
      });
      saveDecisionSnapshot(snapshot);
      handleCollectibleSelect(enriched);
      setPhase("landing");
      setActionStatus("");
      if (navigateToPage) {
        navigateToPage("verdict");
        return;
      }
      setEvaluation(enriched);
      setImageFailed(false);
      if (previewUrl) {
        setImagePreview(previewUrl);
      }
      if (fileName) {
        setImageName(fileName);
      }
      setPhase("results");
    },
    [collectibles, handleCollectibleSelect, navigateToPage],
  );

  const handleImageFile = useCallback(
    (file, previewOverride) => {
      if (!file) {
        return;
      }

      const applyPreview = (preview) => {
        setImagePreview(preview);
        setImageName(file.name);
        const setNumber = identifySetNumberFromFilename(file.name);
        runAnalysis(setNumber, file, preview, file.name);
      };

      if (previewOverride) {
        applyPreview(previewOverride);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => applyPreview(reader.result);
      reader.readAsDataURL(file);
    },
    [runAnalysis],
  );

  const handleFileSelect = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        handleImageFile(file);
      }
      event.target.value = "";
    },
    [handleImageFile],
  );

  const handleManualSelect = useCallback(
    (result) => {
      setManualQuery("");
      runAnalysis(result.setNumber, null, null, "");
    },
    [runAnalysis],
  );

  const handleSetNumberSubmit = useCallback(() => {
    const setNumber = normalizeSetNumber(manualQuery);
    if (!setNumber) {
      setActionStatus("Enter a valid LEGO set number.");
      return;
    }
    runAnalysis(setNumber, null, null, `set-${setNumber}.jpg`);
  }, [manualQuery, runAnalysis]);

  const handleAddToPortfolio = useCallback(() => {
    if (!evaluation) {
      return;
    }
    openCollectibleTicket(evaluation, "BUY");
    handleCollectibleSelect(evaluation);
    jumpToPageSection("portfolio", "portfolio-intelligence");
    setActionStatus("Opening Portfolio Intelligence — confirm your entry in the ticket.");
  }, [evaluation, handleCollectibleSelect, jumpToPageSection, openCollectibleTicket]);

  const handleAddToWatchlist = useCallback(() => {
    if (!evaluation) {
      return;
    }
    if (onAddToWatchlist) {
      onAddToWatchlist({
        ticker: extractSetNumber(evaluation),
        label: evaluation.name,
        desk: "collectible",
      });
      setActionStatus(`${evaluation.name} added to watchlist.`);
      return;
    }
    setActionStatus("Sign in to sync watchlist items.");
  }, [evaluation, onAddToWatchlist]);

  const handleOpenInvestmentAnalysis = useCallback(() => {
    if (!evaluation) {
      return;
    }
    handleCollectibleSelect(evaluation);
    jumpToPageSection("collectibles", "investment-analysis");
  }, [evaluation, handleCollectibleSelect, jumpToPageSection]);

  const handleTrackRetirement = useCallback(() => {
    if (!evaluation) {
      return;
    }
    handleCollectibleSelect(evaluation);
    jumpToPageSection("collectibles", "retirement-intelligence");
  }, [evaluation, handleCollectibleSelect, jumpToPageSection]);

  const handleReset = useCallback(() => {
    setPhase("landing");
    setImagePreview(null);
    setImageName("");
    setEvaluation(null);
    setIdentifiedSetNumber("");
    setManualQuery("");
    setActionStatus("");
  }, []);

  const legoCatalogCount = useMemo(
    () => collectibles.filter((item) => item.brand === "LEGO").length,
    [collectibles],
  );

  return (
    <section className="seWorkspace" id="scan-evaluate">
      {phase === "processing" ? <ProcessingOverlay activeStepIndex={processingIndex} /> : null}
      {showCamera ? (
        <CameraModal
          onCapture={(file, preview) => handleImageFile(file, preview)}
          onClose={() => setShowCamera(false)}
        />
      ) : null}

      {actionStatus ? <div className="statusBanner subtleBanner">{actionStatus}</div> : null}

      {phase === "landing" || phase === "manual" ? (
        <>
          <article className="seHeroCard">
            <div className="seHeroCopy">
              <span className="executiveDashboardEyebrow">Hero Feature</span>
              <h2>Scan a LEGO set. Get an instant investment verdict.</h2>
              <p>
                Photograph, upload, or enter a set number — Brick Alpha identifies the set, pulls market
                data, and delivers a complete investment analysis in seconds.
              </p>
            </div>
            <div className="seHeroStats">
              <div>
                <strong>{legoCatalogCount}</strong>
                <span>Catalog sets</span>
              </div>
              <div>
                <strong>AI</strong>
                <span>Identification</span>
              </div>
              <div>
                <strong>5s</strong>
                <span>Analysis time</span>
              </div>
            </div>
          </article>

          <div className="seAcquisitionHeader">
            <span className="executiveDashboardEyebrow">Acquisition methods</span>
            <h2>Scan a LEGO set</h2>
          </div>

          <div className="seAcquisitionGrid">
            {ACQUISITION_METHODS.map((method) => (
              <button
                key={method.id}
                type="button"
                className="seAcquisitionCard"
                onClick={() => {
                  if (method.id === "upload") {
                    fileInputRef.current?.click();
                  } else if (method.id === "camera") {
                    if (hasWebcam) {
                      setShowCamera(true);
                    } else {
                      fileInputRef.current?.click();
                      setActionStatus("Camera not supported — opening file upload instead.");
                    }
                  } else {
                    setPhase("manual");
                  }
                }}
              >
                <span className="seAcquisitionIcon">{method.icon}</span>
                <strong>{method.label}</strong>
                <small>{method.detail}</small>
              </button>
            ))}
          </div>

          <article
            className="seGlassCard seUploadDropzone"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="seUploadDropzoneInner">
              <span className="seUploadDropIcon">📷</span>
              <strong>Drop an image here or click to browse</strong>
              <small>PNG, JPG, HEIC · box photo, barcode, or receipt</small>
            </div>
          </article>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="seHiddenInput"
            onChange={handleFileSelect}
          />

          {phase === "manual" ? (
            <div className="seManualStack">
              <article className="seGlassCard seManualEntry">
                <div className="seSectionHeader">
                  <span className="executiveDashboardEyebrow">Set number</span>
                  <h2>Enter LEGO set number</h2>
                </div>
                <div className="seManualRow">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 75252"
                    value={manualQuery}
                    onChange={(event) => setManualQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleSetNumberSubmit();
                      }
                    }}
                  />
                  <button type="button" className="primaryButton" onClick={handleSetNumberSubmit}>
                    Analyse
                  </button>
                </div>
              </article>
              <ManualSearchPanel
                collectibles={collectibles}
                onSelect={handleManualSelect}
                onCancel={handleReset}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "results" && evaluation ? (
        <div className="seResultsFlow">
          <div className="seResultsToolbar">
            <button type="button" className="ghostButton" onClick={handleReset}>
              ← Scan another set
            </button>
            {imageName ? <span className="seResultsSource">Source: {imageName}</span> : null}
          </div>

          <article className="seGlassCard seIdentificationCard">
            <div className="seIdentificationLayout">
              <div className="seIdentificationVisual">
                {showImage ? (
                  <img
                    src={displayImage}
                    alt={evaluation.name}
                    className="seIdentificationImage"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <div className="seIdentificationPlaceholder">
                    <span>{extractSetNumber(evaluation)}</span>
                  </div>
                )}
              </div>
              <div className="seIdentificationMeta">
                <span className="executiveDashboardEyebrow">AI identification result</span>
                <h2>{evaluation.name}</h2>
                <div className="seIdentificationGrid">
                  <div><span>Set number</span><strong>#{extractSetNumber(evaluation)}</strong></div>
                  <div><span>Theme</span><strong>{evaluation.legoTheme || demoProfile?.theme}</strong></div>
                  <div><span>Pieces</span><strong>{demoProfile?.pieces || evaluation.numberOfPieces || "—"}</strong></div>
                  <div><span>Minifigures</span><strong>{demoProfile?.minifigures || evaluation.numberOfMinifigures || "—"}</strong></div>
                  <div><span>Retail price</span><strong>{formatCollectiblePrice(evaluation.retailPrice)}</strong></div>
                  <div><span>Current market value</span><strong>{formatCanonicalValue(presentResearchFields(evaluation).currentMarketValue)}</strong></div>
                  <div><span>Retirement status</span><strong>{evaluation.retirementStatus}</strong></div>
                  <div><span>Expected retirement</span><strong>{retirementSnapshot?.expectedRetirement}</strong></div>
                  <div><span>BrickEconomy status</span><strong>{demoProfile?.brickEconomyStatus || "Tracked"}</strong></div>
                  <div><span>Portfolio status</span><strong>{portfolioStatus}</strong></div>
                </div>
                <AlphaSignalBadges signals={evaluation.alphaSignals || []} />
              </div>
            </div>
          </article>

          <article className="seGlassCard seVerdictCard">
            <div className="seVerdictLayout">
              <div className="seVerdictScore">
                <span className="executiveDashboardEyebrow">Investment verdict</span>
                <ScoreRing score={evaluation.brickAlphaScore} label="Brick Alpha Score" size="large" />
              </div>
              <div className="seVerdictMetrics">
                <div className="seVerdictMetric">
                  <span>Grade</span>
                  <strong className={`iaGrade iaGrade-${letterGradeFor(evaluation.brickAlphaScore).replace("+", "plus")}`}>
                    {letterGradeFor(evaluation.brickAlphaScore)}
                  </strong>
                  <small>{evaluation.investmentGrade}</small>
                </div>
                <div className="seVerdictMetric">
                  <span>Recommendation</span>
                  <strong className={`seRecommendation seRecommendation-${recommendationTone(evaluation.recommendation)}`}>
                    {displayRecommendation(evaluation.recommendation).toUpperCase()}
                  </strong>
                </div>
                <div className="seVerdictMetric">
                  <span>Confidence</span>
                  <strong>{confidence}%</strong>
                </div>
                <div className="seVerdictMetric">
                  <span>Expected ROI</span>
                  <strong className="seMetric-positive">
                    +{Math.round(demoProfile?.expectedRoi || evaluation.projectedRoi || 0)}%
                  </strong>
                </div>
                <div className="seVerdictMetric">
                  <span>Investment horizon</span>
                  <strong>{demoProfile?.investmentHorizon || evaluation.holdingPeriod || "3–5 years"}</strong>
                </div>
                <div className="seVerdictMetric">
                  <span>Risk</span>
                  <strong>{riskLabel(evaluation.riskScore)}</strong>
                </div>
              </div>
            </div>
          </article>

          {aiSummary ? (
            <article className="seGlassCard seAiSummaryCard">
              <div className="seSectionHeader">
                <span className="executiveDashboardEyebrow">AI investment summary</span>
                <h2>Brick Alpha recommendation</h2>
              </div>
              <p className="seAiSummaryLead">{aiSummary.lead}</p>
              <ul className="seAiSummaryList">
                {aiSummary.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <p className="seAiSummaryAction">{aiSummary.action}</p>
            </article>
          ) : null}

          <ScoreExplanationPanel item={evaluation} />

          <div className="seTwoColumn">
            <article className="seGlassCard">
              <div className="seSectionHeader">
                <span className="executiveDashboardEyebrow">Market pricing</span>
                <h2>Secondary market</h2>
              </div>
              <div className="sePricingGrid">
                <div className="seMetric"><span>Retail</span><strong>{formatCollectiblePrice(marketPricing?.retail)}</strong></div>
                <div className="seMetric"><span>Current value</span><strong>{formatCollectiblePrice(marketPricing?.currentValue)}</strong></div>
                <div className="seMetric"><span>Lowest price</span><strong>{formatCollectiblePrice(marketPricing?.lowestPrice)}</strong></div>
                <div className="seMetric"><span>Highest price</span><strong>{formatCollectiblePrice(marketPricing?.highestPrice)}</strong></div>
                <div className="seMetric"><span>Illustrative blend</span><strong>{formatCollectiblePrice(marketPricing?.averageMarketPrice)}</strong><small>Not BrickEconomy</small></div>
                <div className="seMetric"><span>Expected retirement pop</span><strong>{formatCollectiblePrice(marketPricing?.expectedRetirementPop)}</strong></div>
              </div>
            </article>

            <article className="seGlassCard">
              <div className="seSectionHeader">
                <span className="executiveDashboardEyebrow">Non-canonical</span>
                <h2>Illustrative outlook</h2>
              </div>
              <p>These 1-year, 5-year, and 10-year figures are illustrative. They do not set the verdict or the BrickEconomy value.</p>
              <details>
                <summary>Show illustrative figures</summary>
                <div className="seForecastGrid">
                  {forecasts.map((forecast) => (
                    <div key={forecast.years} className="seForecastCard">
                      <span>{forecast.label}</span>
                      <strong>{formatCollectiblePrice(forecast.value)}</strong>
                    </div>
                  ))}
                </div>
              </details>
            </article>
          </div>

          {breakdown ? (
            <article className="seGlassCard">
              <div className="seSectionHeader">
                <span className="executiveDashboardEyebrow">Brick Alpha score</span>
                <h2>Weighted breakdown</h2>
              </div>
              <div className="iaWeightLegend">
                {breakdown.displayGroups.map((group) => (
                  <span key={group.key}>
                    {group.label} {group.weight}%
                  </span>
                ))}
              </div>
              <div className="iaScoreBars">
                {breakdown.factors.map((factor) => (
                  <ScoreBar key={factor.key} factor={factor} />
                ))}
              </div>
            </article>
          ) : null}

          <article className="seGlassCard">
            <div className="seSectionHeader">
              <span className="executiveDashboardEyebrow">Comparable sets</span>
              <h2>Historical performance peers</h2>
            </div>
            <div className="seComparableGrid">
              {PREMIUM_COMPARABLES.map((comp) => (
                <div key={comp.setNumber} className="seComparableCard">
                  <span className="seComparableTheme">{comp.theme}</span>
                  <strong>{comp.name}</strong>
                  <small>#{comp.setNumber}</small>
                  <div className="seComparableStats">
                    <div><span>Score</span><strong>{comp.score}</strong></div>
                    <div><span>ROI</span><strong>+{comp.roi}%</strong></div>
                    <div><span>Growth</span><strong>{comp.growth}</strong></div>
                  </div>
                  <em className={`seRecommendation seRecommendation-${recommendationTone(comp.recommendation)}`}>
                    {comp.recommendation}
                  </em>
                </div>
              ))}
            </div>
          </article>

          <article className="seGlassCard seRetirementCard">
            <div className="seSectionHeader">
              <span className="executiveDashboardEyebrow">Retirement intelligence</span>
              <h2>Production lifecycle</h2>
            </div>
            <div className="seRetirementGrid">
              <div className="seMetric"><span>Expected retirement</span><strong>{retirementSnapshot?.expectedRetirement}</strong></div>
              <div className="seMetric"><span>Retirement probability</span><strong>{retirementSnapshot?.retirementProbability}%</strong></div>
              <div className="seMetric"><span>Retirement confidence</span><strong>{retirementSnapshot?.retirementConfidence}%</strong></div>
              <div className="seMetric"><span>Months remaining</span><strong>{retirementSnapshot?.monthsRemaining ?? monthsUntilRetirement(evaluation)}</strong></div>
              <div className="seMetric"><span>Expected retirement pop</span><strong>{formatCollectiblePrice(retirementSnapshot?.expectedRetirementPop)}</strong></div>
            </div>
          </article>

          <CopilotCard evaluation={evaluation} demoProfile={demoProfile} />

          <article className="seGlassCard seActionsCard">
            <div className="seSectionHeader">
              <span className="executiveDashboardEyebrow">Portfolio actions</span>
              <h2>Next steps</h2>
            </div>
            <div className="seActionRow">
              <button type="button" className="primaryButton" onClick={handleAddToPortfolio}>
                Add to Portfolio
              </button>
              <button type="button" className="ghostButton" onClick={handleAddToWatchlist}>
                Add to Watchlist
              </button>
              <button type="button" className="ghostButton" onClick={() => setActionStatus("PDF report queued for demo export.")}>
                Generate PDF Report
              </button>
              <button type="button" className="ghostButton" onClick={() => setActionStatus("Analysis link copied to clipboard (demo).")}>
                Share Analysis
              </button>
              <button type="button" className="ghostButton" onClick={handleOpenInvestmentAnalysis}>
                Compare Sets
              </button>
              <button type="button" className="ghostButton" onClick={handleTrackRetirement}>
                Track Retirement
              </button>
              <button type="button" className="ghostButton" onClick={handleOpenInvestmentAnalysis}>
                Investment Analysis
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
