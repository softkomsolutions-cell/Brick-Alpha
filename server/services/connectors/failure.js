const FAILURE_CLASSES = Object.freeze([
  'RETRYABLE',
  'NON_RETRYABLE',
  'RATE_LIMITED',
  'AUTH_FAILED',
  'TIMEOUT',
  'PROVIDER_UNAVAILABLE',
]);

const RETRYABLE_FAILURE_CLASSES = new Set([
  'RETRYABLE',
  'RATE_LIMITED',
  'TIMEOUT',
  'PROVIDER_UNAVAILABLE',
]);

const SENSITIVE_PATTERNS = [
  /X-VALR-(API-KEY|SIGNATURE)/i,
  /apiSecret|api_key|apikey|apiKey/i,
  /passw|secret/i,
  /postgresql:\/\//i,
  /DATABASE_URL|connection.?string/i,
  /CONNECTOR_CIPHER/i,
];

function truncate(value, maxLength) {
  const string = String(value || '');
  return string.length > maxLength ? `${string.slice(0, maxLength)}...` : string;
}

function safeSummary(input, maxLength = 180) {
  let message = String(input || 'no_error_message');
  if (SENSITIVE_PATTERNS.some(pattern => pattern.test(message))) {
    message = 'error_detail_redacted';
  }
  return truncate(message.replace(/\s+/g, ' ').trim(), maxLength);
}

function statusOf(error) {
  return Number(error?.status || error?.statusCode || error?.response?.status || 0);
}

function extractRetryAfterSeconds(error) {
  const source = error?.headers || error?.response?.headers || {};
  const headers =
    typeof source.entries === 'function' && typeof source.get === 'function'
      ? { ...Object.fromEntries(source.entries()), get: name => source.get(name) }
      : source;
  const header = ['retry-after', 'Retry-After', 'x-ratelimit-reset'].find(key => key in headers);
  if (!header) return null;
  const raw = String(headers[header] || '').trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
  return null;
}

function classifyFailure(input, options = {}) {
  const error = input?.error || input;
  const timeoutMs = options.timeoutMs || 0;
  const code = error?.code || error?.name || '';
  const status = statusOf(error);

  if (code === 'JOB_TIMEOUT' || code === 'AbortError' || code === 'TimeoutError') {
    return { failureClass: 'TIMEOUT', retryable: true, status, code };
  }

  if (status) {
    if (status === 429) {
      return { failureClass: 'RATE_LIMITED', retryable: true, status, code, retryAfterSeconds: extractRetryAfterSeconds(error) };
    }
    if (status === 401 || status === 403) {
      return { failureClass: 'AUTH_FAILED', retryable: false, status, code };
    }
    if (status === 503) {
      return { failureClass: 'PROVIDER_UNAVAILABLE', retryable: true, status, code, retryAfterSeconds: extractRetryAfterSeconds(error) };
    }
    if (status >= 500) {
      return { failureClass: 'RETRYABLE', retryable: true, status, code };
    }
    if (status >= 400) {
      return { failureClass: 'NON_RETRYABLE', retryable: false, status, code };
    }
  }

  if (code === 'connector_not_configured' || code === 'sync_not_supported') {
    return { failureClass: 'NON_RETRYABLE', retryable: false, status, code };
  }

  if (code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
    return { failureClass: 'PROVIDER_UNAVAILABLE', retryable: true, status, code };
  }

  if (Number.isFinite(timeoutMs) && (error?.name === 'AbortControllerTimeout')) {
    return { failureClass: 'TIMEOUT', retryable: true, status, code };
  }

  return { failureClass: 'RETRYABLE', retryable: true, status, code };
}

function healthStateFor(failureClass, previous = 'UNKNOWN') {
  switch (failureClass) {
    case 'RATE_LIMITED':
      return 'RATE_LIMITED';
    case 'AUTH_FAILED':
      return 'AUTH_FAILED';
    case 'PROVIDER_UNAVAILABLE':
      return 'UNAVAILABLE';
    case 'TIMEOUT':
      return previous === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'DEGRADED';
    case 'RETRYABLE':
      return previous === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'DEGRADED';
    case 'NON_RETRYABLE':
      return 'DEGRADED';
    default:
      return 'UNKNOWN';
  }
}

module.exports = {
  FAILURE_CLASSES,
  RETRYABLE_FAILURE_CLASSES,
  classifyFailure,
  extractRetryAfterSeconds,
  healthStateFor,
  safeSummary,
};