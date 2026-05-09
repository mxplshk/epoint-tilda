import crypto from 'crypto';
import axios from 'axios';

const EPOINT_API_URL = 'https://epoint.az/api/1/request';

const ALLOWED_ORIGINS = [
  'https://you-lush.com',
  'https://www.you-lush.com',
  'https://you-lush.tilda.ws',
];

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://you-lush.com');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function generateSignature(privateKey, data) {
  return crypto
    .createHash('sha1')
    .update(privateKey + data + privateKey, 'utf8')
    .digest('base64');
}

function isValidAmount(value) {
  if (value === undefined || value === null || value === '') return false;
  const n = Number(value);
  if (Number.isNaN(n)) return false;
  if (!Number.isFinite(n)) return false;
  if (n <= 0) return false;
  return true;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    const body = req.body || {};
    const {
      amount,
      order_id,
      description,
      customer_name,
      customer_email,
      customer_phone,
      cart,
    } = body;

    if (!isValidAmount(amount)) {
      console.warn('[PAYMENT ERROR] Invalid amount', { amount });
      return res.status(400).json({
        success: false,
        error: 'Field "amount" is required and must be a positive number.',
      });
    }

    if (!isNonEmptyString(order_id)) {
      console.warn('[PAYMENT ERROR] Invalid order_id', { order_id });
      return res.status(400).json({
        success: false,
        error: 'Field "order_id" is required and must be a non-empty string.',
      });
    }

    const numericAmount = Number(amount);

    const publicKey = process.env.EPOINT_PUBLIC_KEY;
    const privateKey = process.env.EPOINT_PRIVATE_KEY;
    const successUrl = process.env.SUCCESS_URL || 'https://you-lush.com/success';
    const errorUrl = process.env.ERROR_URL || 'https://you-lush.com/error';

    if (!publicKey || !privateKey) {
      console.error('[PAYMENT ERROR] Missing ePoint credentials in env');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error.',
      });
    }

    const safeDescription = isNonEmptyString(description)
      ? description.slice(0, 500)
      : `Order ${order_id}`;

    const payload = {
      public_key: publicKey,
      amount: numericAmount.toFixed(2),
      currency: 'AZN',
      language: 'ru',
      order_id: String(order_id).slice(0, 255),
      description: safeDescription,
      success_redirect_url: successUrl,
      error_redirect_url: errorUrl,
    };

    const jsonString = JSON.stringify(payload);
    const data = Buffer.from(jsonString, 'utf8').toString('base64');
    const signature = generateSignature(privateKey, data);

    console.log('[CREATE PAYMENT]', {
      order_id: payload.order_id,
      amount: payload.amount,
      currency: payload.currency,
      hasCustomer: Boolean(customer_email || customer_phone),
      cartItems: Array.isArray(cart) ? cart.length : 0,
    });

    const form = new URLSearchParams();
    form.append('data', data);
    form.append('signature', signature);

    const epointResponse = await axios.post(EPOINT_API_URL, form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 20000,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    const result = epointResponse.data;

    if (
      result &&
      typeof result === 'object' &&
      result.status === 'success' &&
      isNonEmptyString(result.redirect_url)
    ) {
      console.log('[PAYMENT SUCCESS]', {
        order_id: payload.order_id,
        transaction: result.transaction,
      });

      return res.status(200).json({
        success: true,
        redirect_url: result.redirect_url,
        transaction: result.transaction,
        status: result.status,
      });
    }

    console.error('[PAYMENT ERROR] ePoint returned non-success', {
      order_id: payload.order_id,
      httpStatus: epointResponse.status,
      epointStatus: result?.status,
      message: result?.message,
    });

    return res.status(502).json({
      success: false,
      error: result?.message || 'Failed to create payment at ePoint',
      status: result?.status || 'error',
      transaction: result?.transaction,
    });
  } catch (error) {
    const errPayload = {
      message: error.message,
      code: error.code,
      httpStatus: error.response?.status,
      epointBody: error.response?.data,
    };

    console.error('[PAYMENT ERROR] Exception', errPayload);

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        success: false,
        error: 'ePoint did not respond in time. Please try again.',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error while creating payment.',
    });
  }
}
