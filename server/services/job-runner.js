const { classifyFailure, RETRYABLE_FAILURE_CLASSES, safeSummary } = require('./connectors/failure');
const { withTimeout } = require('./connectors/timeout');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nextRunAt(failure, attempts, now, config) {
  const backoff = Math.min(config.backoffMs * Math.pow(2, Math.max(0, attempts - 1)), config.maxBackoffMs);
  if (failure.failureClass === 'RATE_LIMITED' && Number.isFinite(Number(failure.retryAfterSeconds))) {
    return now + Math.max(Number(failure.retryAfterSeconds) * 1000, 1000);
  }
  if (failure.failureClass === 'PROVIDER_UNAVAILABLE' && Number.isFinite(Number(failure.retryAfterSeconds))) {
    return now + Math.max(Number(failure.retryAfterSeconds) * 1000, backoff);
  }
  return now + backoff;
}

function createJobRunner({ repository, config, handlers, logger = null }) {
  if (!repository) throw new Error('job_repository_required');

  const handlersByType = new Map();
  for (const [type, handler] of Object.entries(handlers || {})) {
    handlersByType.set(String(type).toLowerCase(), handler);
  }

  function log(message) {
    if (logger && typeof logger === 'function') logger(message);
  }

  function registerHandler(type, handler) {
    handlersByType.set(String(type).toLowerCase(), handler);
  }

  async function enqueue(input) {
    const key = String(input.idempotencyKey || '').trim();
    if (!key) throw new Error('idempotency_key_required');
    const existing = await repository.getJobByIdempotencyKey(key);
    if (existing) return { ...existing, duplicate: true };
    return repository.enqueueJob({
      type: input.type,
      provider: input.provider || null,
      idempotencyKey: key,
      correlationId: input.correlationId || null,
      runAt: input.runAt || Date.now(),
      timeoutMs: input.timeoutMs || config.jobTimeoutMs,
      maxAttempts: input.maxAttempts ?? config.jobMaxAttempts,
      retryPolicy: input.retryPolicy || { maxAttempts: input.maxAttempts ?? config.jobMaxAttempts },
      payload: input.payload || null,
    });
  }

  async function runExecute(job) {
    const handler = handlersByType.get(String(job.type || '').toLowerCase());
    const maxAttempts = job.maxAttempts || config.jobMaxAttempts;
    const attempts = job.attempts + 1;

    if (!handler) {
      await repository.markFailed({
        jobId: job.id,
        attempts,
        errorCode: 'UNKNOWN_JOB_TYPE',
        errorSummary: safeSummary(`unknown_job_type_${job.type}`),
      });
      log(`job ${job.id} (${job.type}) failed: unknown_job_type`);
      return { job, outcome: 'failed', failure: { failureClass: 'NON_RETRYABLE' } };
    }

    const timeoutMs = job.timeoutMs || config.jobTimeoutMs;
    try {
      const result = await withTimeout(
        handler({ job, repository, config }),
        timeoutMs,
        'JOB_TIMEOUT',
      );
      await repository.markCompleted({ jobId: job.id, result, attempts });
      log(`job ${job.id} (${job.type}) completed on attempt ${attempts}`);
      return { job, outcome: 'completed' };
    } catch (error) {
      const failure = classifyFailure(error, { timeoutMs });
      const summary = safeSummary(error?.message);
      const retryable = RETRYABLE_FAILURE_CLASSES.has(failure.failureClass) && attempts < maxAttempts;
      if (retryable) {
        const schedule = nextRunAt(failure, attempts, Date.now(), config);
        await repository.scheduleRetry({
          jobId: job.id,
          nextRunAt: schedule,
          attempts,
          errorCode: failure.failureClass,
          errorSummary: summary,
        });
        log(`job ${job.id} (${job.type}) attempt ${attempts} -> ${failure.failureClass}, retry at ${new Date(schedule).toISOString()}`);
        return { job, outcome: 'retry', failure };
      }
      await repository.markFailed({ jobId: job.id, attempts, errorCode: failure.failureClass, errorSummary: summary });
      log(`job ${job.id} (${job.type}) failed after ${attempts} attempts with ${failure.failureClass}`);
      return { job, outcome: 'failed', failure };
    }
  }

  async function processQueue({ limit = config.jobClaimLimit } = {}) {
    const jobs = await repository.claimDueJobs({ limit, now: Date.now() });
    const summary = { claimed: jobs.length, completed: 0, retried: 0, failed: 0 };
    for (const job of jobs) {
      const outcome = await runExecute(job);
      if (outcome.outcome === 'completed') summary.completed += 1;
      else if (outcome.outcome === 'retry') summary.retried += 1;
      else summary.failed += 1;
    }
    return summary;
  }

  function createWorker({ pollIntervalMs = config.jobPollIntervalMs, graceMs = config.jobGraceMs } = {}) {
    let timer = null;
    let stopped = false;
    let inFlight = null;
    let ticks = 0;

    async function tick() {
      if (stopped || inFlight) return;
      ticks += 1;
      inFlight = processQueue().catch(error => ({ claimed: 0, failed: 0, error: safeSummary(error?.message) }));
      try {
        await inFlight;
      } finally {
        inFlight = null;
      }
    }

    return {
      start() {
        stopped = false;
        tick();
        if (!timer) {
          timer = setInterval(tick, pollIntervalMs);
          if (timer.unref) timer.unref();
        }
        return this;
      },
      async stop() {
        stopped = true;
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        if (inFlight) {
          const deadline = Date.now() + graceMs;
          while (inFlight && Date.now() < deadline) {
            await sleep(50);
          }
        }
        return { ticks, drained: !inFlight };
      },
      isRunning() {
        return !stopped;
      },
    };
  }

  return {
    createWorker,
    enqueue,
    processQueue,
    registerHandler,
    runExecute,
  };
}

module.exports = { createJobRunner, nextRunAt };