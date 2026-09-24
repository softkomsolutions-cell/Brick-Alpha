const crypto = require('node:crypto');

// AES-256-GCM connector credential encryption shared by the legacy server store
// and the background worker. The key is derived from CONNECTOR_SECRET the same
// way the original server.js implementation does (sha256 of the secret), so
// blobs written by either layer can be read by the other.
function cipherKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptConnectorPayload(payload, secret) {
  const key = cipherKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptConnectorPayload(blob, secret) {
  if (!blob || typeof blob !== 'string') {
    return null;
  }
  const key = cipherKey(secret);
  const [ivRaw, tagRaw, dataRaw] = blob.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) {
    return null;
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataRaw, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

function maskValue(value, head = 6, tail = 4) {
  const stringValue = String(value || '').trim();
  if (!stringValue) return '';
  if (stringValue.length <= head + tail) {
    return `${stringValue.slice(0, Math.max(2, head - 2))}...`;
  }
  return `${stringValue.slice(0, head)}...${stringValue.slice(-tail)}`;
}

module.exports = {
  decryptConnectorPayload,
  encryptConnectorPayload,
  maskValue,
};