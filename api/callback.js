import crypto from 'crypto';

function generateSignature(privateKey, data) {
  return crypto
    .createHash('sha1')
    .update(privateKey + data + privateKey, 'utf8')
    .digest('base64');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string' && req.body.length > 0) {
    return parseRaw(req.body);
  }

  if (Buffer.isBuffer(req.body)) {
    return parseRaw(req.body.toString('utf8'));
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(parseRaw(raw)));
    req.on('error', () => resolve({}));
  });
}

function parseRaw(raw) {
  if (!raw) return {};
  try {
    if (raw.trim().startsWith('{')) {
      return JSON.parse(raw);
    }
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    const body = await readBody(req);
    const data = body?.data;
    const signature = body?.signature;

    console.log('[CALLBACK RECEIVED]', {
      hasData: Boolean(data),
      hasSignature: Boolean(signature),
      contentType: req.headers['content-type'] || null,
    });

    if (!data || !signature) {
      console.warn('[CALLBACK ERROR] Missing data or signature');
      return res.status(400).json({
        success: false,
        error: 'Missing data or signature.',
      });
    }

    const privateKey = process.env.EPOINT_PRIVATE_KEY;
    if (!privateKey) {
      console.error('[CALLBACK ERROR] Missing EPOINT_PRIVATE_KEY in env');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error.',
      });
    }

    const expectedSignature = generateSignature(privateKey, data);

    if (!timingSafeEqual(expectedSignature, signature)) {
      console.error('[INVALID SIGNATURE]', {
        receivedLength: signature.length,
      });
      return res.status(403).json({
        success: false,
        error: 'Invalid signature.',
      });
    }

    let decoded;
    try {
      const jsonString = Buffer.from(data, 'base64').toString('utf8');
      decoded = JSON.parse(jsonString);
    } catch (decodeError) {
      console.error('[CALLBACK ERROR] Failed to decode data payload', decodeError.message);
      return res.status(400).json({
        success: false,
        error: 'Failed to decode data payload.',
      });
    }

    const summary = {
      status: decoded.status,
      order_id: decoded.order_id,
      transaction: decoded.transaction,
      bank_transaction: decoded.bank_transaction,
      amount: decoded.amount,
      code: decoded.code,
      message: decoded.message,
      card_mask: decoded.card_mask,
    };

    if (decoded.status === 'success') {
      console.log('[PAYMENT SUCCESS]', summary);
      console.log('SUCCESS PAYMENT', summary);
    } else if (decoded.status === 'failed' || decoded.status === 'error') {
      console.warn('[PAYMENT FAILED]', summary);
    } else {
      console.log('[PAYMENT STATUS]', summary);
    }

    return res.status(200).json({
      success: true,
      status: decoded.status,
      order_id: decoded.order_id,
      transaction: decoded.transaction,
    });
  } catch (error) {
    console.error('[CALLBACK ERROR] Exception', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error while processing callback.',
    });
  }
}
