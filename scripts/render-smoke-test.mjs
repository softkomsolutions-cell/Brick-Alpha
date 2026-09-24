const baseUrlInput = process.argv[2];

if (!baseUrlInput) {
  console.error("Usage: node scripts/render-smoke-test.mjs <render-url>");
  process.exit(1);
}

const baseUrl = baseUrlInput.replace(/\/+$/, "");

const checks = [
  {
    id: "root",
    url: `${baseUrl}/`,
    expectJson: false,
    validate: async (response) => {
      const text = await response.text();
      if (!text.includes("<title>Brick Alpha</title>")) {
        throw new Error("Root page did not contain the Brick Alpha document title.");
      }
      return "App shell responded";
    },
  },
  {
    id: "health",
    url: `${baseUrl}/api/health`,
    expectJson: true,
    validate: async (response) => {
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`Health returned status ${response.status}`);
      }
      return `mode=${payload.marketData || "unknown"} feedbackItems=${payload.feedbackItems ?? "n/a"}`;
    },
  },
  {
    id: "signals",
    url: `${baseUrl}/api/signals`,
    expectJson: true,
    validate: async (response) => {
      const payload = await response.json();
      const count = payload.signals?.length || 0;
      if (!response.ok || !count) {
        throw new Error("Signals endpoint did not return any live signal items.");
      }
      return `${count} signals`;
    },
  },
  {
    id: "news",
    url: `${baseUrl}/api/news`,
    expectJson: true,
    validate: async (response) => {
      const payload = await response.json();
      const count = payload.items?.length || 0;
      if (!response.ok || !count) {
        throw new Error("News endpoint did not return any feed items.");
      }
      return `${count} headlines`;
    },
  },
];

async function runCheck(check) {
  const response = await fetch(check.url, {
    headers: check.expectJson ? { Accept: "application/json" } : {},
  });
  const summary = await check.validate(response);
  return {
    id: check.id,
    ok: true,
    status: response.status,
    summary,
  };
}

const results = [];

for (const check of checks) {
  try {
    const result = await runCheck(check);
    results.push(result);
  } catch (error) {
    results.push({
      id: check.id,
      ok: false,
      status: "ERR",
      summary: String(error.message || error),
    });
  }
}

console.log("");
console.log(`Render smoke test for ${baseUrl}`);
console.log("");

for (const result of results) {
  const marker = result.ok ? "PASS" : "FAIL";
  console.log(`${marker.padEnd(5)} ${result.id.padEnd(8)} ${String(result.status).padEnd(5)} ${result.summary}`);
}

console.log("");

if (results.some((result) => !result.ok)) {
  process.exit(1);
}
