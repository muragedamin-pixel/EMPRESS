require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── In-memory payment status store ──────────────────────────────────────────
// In production you'd use a database, but this works fine for Railway
const paymentStore = {};

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get OAuth token from Safaricom Daraja API
 */
async function getDarajaToken() {
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_ENV } = process.env;
  const baseUrl = MPESA_ENV === 'live'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');

  const res = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  return { token: res.data.access_token, baseUrl };
}

/**
 * Generate the Base64-encoded password for STK Push
 * Format: Base64(Shortcode + Passkey + Timestamp)
 */
function generatePassword(timestamp) {
  const { MPESA_SHORTCODE, MPESA_PASSKEY } = process.env;
  const raw = `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString('base64');
}

/**
 * Format phone number to 254XXXXXXXXX
 */
function formatPhone(phone) {
  let p = phone.replace(/\s+/g, '').replace(/[^0-9]/g, '');
  if (p.startsWith('0'))  p = '254' + p.slice(1);
  if (p.startsWith('+')) p = p.slice(1);
  return p;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'PRE LOVED server is running 🎉' });
});

/**
 * POST /stk-push
 * Body: { phone, amount, itemName }
 * Initiates an M-Pesa STK Push to the customer's phone
 */
app.post('/stk-push', async (req, res) => {
  const { phone, amount, itemName } = req.body;

  if (!phone || !amount || !itemName) {
    return res.status(400).json({ success: false, message: 'phone, amount and itemName are required.' });
  }

  const formattedPhone = formatPhone(phone);
  if (formattedPhone.length < 12) {
    return res.status(400).json({ success: false, message: 'Invalid phone number.' });
  }

  try {
    const { token, baseUrl } = await getDarajaToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14); // YYYYMMDDHHmmss

    const password   = generatePassword(timestamp);
    const shortcode  = process.env.MPESA_SHORTCODE;
    const callbackUrl = `${process.env.RAILWAY_URL}/callback`;

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(Number(amount)),
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: itemName.slice(0, 12),
      TransactionDesc: `PRE LOVED - ${itemName}`.slice(0, 13),
    };

    const stkRes = await axios.post(
      `${baseUrl}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const { CheckoutRequestID, ResponseCode, ResponseDescription } = stkRes.data;

    if (ResponseCode !== '0') {
      return res.status(400).json({ success: false, message: ResponseDescription });
    }

    // Store initial pending status
    paymentStore[CheckoutRequestID] = { status: 'pending', itemName, amount };

    return res.json({
      success: true,
      checkoutRequestId: CheckoutRequestID,
      message: 'STK Push sent. Ask customer to enter their M-Pesa PIN.',
    });

  } catch (err) {
    console.error('[STK Push Error]', err?.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: err?.response?.data?.errorMessage || 'Failed to initiate payment.',
    });
  }
});

/**
 * POST /callback
 * Safaricom posts payment result here after customer enters PIN
 */
app.post('/callback', (req, res) => {
  const body = req.body?.Body?.stkCallback;

  if (!body) {
    console.warn('[Callback] Unexpected payload:', JSON.stringify(req.body));
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = body;

  console.log(`[Callback] ${CheckoutRequestID} — ResultCode: ${ResultCode} — ${ResultDesc}`);

  if (ResultCode === 0) {
    // Payment successful — extract transaction details
    const items = CallbackMetadata?.Item || [];
    const get   = (name) => items.find(i => i.Name === name)?.Value;

    paymentStore[CheckoutRequestID] = {
      status:    'success',
      mpesaCode: get('MpesaReceiptNumber'),
      amount:    get('Amount'),
      phone:     get('PhoneNumber'),
      date:      get('TransactionDate'),
    };

    console.log(`[Payment SUCCESS] Receipt: ${get('MpesaReceiptNumber')} | Amount: ${get('Amount')}`);
  } else {
    paymentStore[CheckoutRequestID] = {
      status:  'failed',
      message: ResultDesc,
    };
    console.log(`[Payment FAILED] ${ResultDesc}`);
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

/**
 * GET /status/:checkoutRequestId
 * Frontend polls this to know if payment succeeded
 */
app.get('/status/:checkoutRequestId', (req, res) => {
  const { checkoutRequestId } = req.params;
  const record = paymentStore[checkoutRequestId];

  if (!record) {
    return res.json({ status: 'pending' });
  }

  return res.json(record);
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PRE LOVED server running on port ${PORT}`);
  console.log(`Environment: ${process.env.MPESA_ENV || 'sandbox'}`);
});
