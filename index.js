const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

/* ---------------- SUPABASE STORAGE ---------------- */
let SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
let SUPABASE_SECRET_KEY = (process.env.SUPABASE_SECRET_KEY || '').trim();

if ((SUPABASE_URL.startsWith('"') && SUPABASE_URL.endsWith('"')) || (SUPABASE_URL.startsWith("'") && SUPABASE_URL.endsWith("'"))) {
  SUPABASE_URL = SUPABASE_URL.slice(1, -1).trim();
}
if ((SUPABASE_SECRET_KEY.startsWith('"') && SUPABASE_SECRET_KEY.endsWith('"')) || (SUPABASE_SECRET_KEY.startsWith("'") && SUPABASE_SECRET_KEY.endsWith("'"))) {
  SUPABASE_SECRET_KEY = SUPABASE_SECRET_KEY.slice(1, -1).trim();
}

let supabase = null;
if (SUPABASE_URL && SUPABASE_SECRET_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false }
    });
    console.log('[SUPABASE STORAGE] Client initialized for host:', SUPABASE_URL.split('/')[2] || 'configured');
  } catch (err) {
    console.error('[SUPABASE STORAGE] Initialization error:', err.message);
  }
} else {
  console.log('[SUPABASE STORAGE] Credentials missing in env (SUPABASE_URL / SUPABASE_SECRET_KEY)');
}

const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, etc.) are allowed!'), false);
    }
  }
});

/* ---------------- FIREBASE ADMIN AUTH VERIFICATION ---------------- */
const ALLOWED_ADMIN_EMAIL = 'theindianiway2026@gmail.com';

if (getApps().length === 0) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  let serviceAccount = null;

  if (serviceAccountRaw && typeof serviceAccountRaw === 'string' && serviceAccountRaw.trim().length > 0) {
    try {
      let parsed = JSON.parse(serviceAccountRaw);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      if (parsed && typeof parsed === 'object' && parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      serviceAccount = parsed;
    } catch (e) {
      console.error('[FIREBASE ADMIN] Error parsing FIREBASE_SERVICE_ACCOUNT_KEY env var:', e.message);
    }
  }

  try {
    if (serviceAccount) {
      const projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || 'the-indiani-way-c1a0e';
      initializeApp({
        credential: cert(serviceAccount),
        projectId
      });
      console.log('[FIREBASE ADMIN] Initialized with Service Account cert for project:', projectId);
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'the-indiani-way-c1a0e';
      initializeApp({
        projectId
      });
      console.log('[FIREBASE ADMIN] Initialized with projectId only:', projectId);
    }
  } catch (err) {
    console.error('[FIREBASE ADMIN] Initialization error:', err.message);
  }
}

// Strict Firebase ID Token Verification Middleware for Upload Endpoint
async function verifyAdminFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const hasAuthHeader = !!authHeader;
  const hasBearer = hasAuthHeader && authHeader.startsWith('Bearer ');

  if (!hasBearer) {
    console.warn('[AUTH DIAGNOSTIC] Authorization header missing or not Bearer format. Header exists:', hasAuthHeader);
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or malformed Authorization Bearer token' });
  }

  let idToken = authHeader.split('Bearer ')[1].trim();
  if ((idToken.startsWith('"') && idToken.endsWith('"')) || (idToken.startsWith("'") && idToken.endsWith("'"))) {
    idToken = idToken.substring(1, idToken.length - 1).trim();
  }

  if (!idToken) {
    console.warn('[AUTH DIAGNOSTIC] Bearer token is empty after extraction');
    return res.status(401).json({ success: false, error: 'Unauthorized: Empty Firebase ID token' });
  }

  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Strict Admin Email Verification
    if (!decodedToken.email || decodedToken.email.toLowerCase() !== ALLOWED_ADMIN_EMAIL.toLowerCase()) {
      console.warn(`[AUTH DIAGNOSTIC] Unauthorized upload attempt by non-admin user: ${decodedToken.email}`);
      return res.status(403).json({ success: false, error: 'Forbidden: Access restricted to authorized admin account only' });
    }

    console.log(`[AUTH DIAGNOSTIC] Token successfully verified for email: ${decodedToken.email}`);
    req.firebaseUser = decodedToken;
    next();
  } catch (err) {
    console.error('[AUTH DIAGNOSTIC] Firebase ID token verification failed:', err.code || 'N/A', '| Message:', err.message);
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired Firebase ID token', details: err.message });
  }
}

/* ================= SERVERLESS ROUTES ================= */

app.get('/', (req, res) => res.send('Indiani Way Backend is Live!'));

// Diagnostic Health Check for Upload Endpoint (Safe status check, no secrets exposed)
app.get('/api/upload-image', (req, res) => {
  return res.json({
    status: 'ok',
    endpoint: '/api/upload-image',
    supabaseInitialized: !!supabase,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseSecretKey: !!process.env.SUPABASE_SECRET_KEY,
    hasFirebaseServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
    firebaseAppsCount: getApps().length
  });
});

// Secure Supabase Image Upload Endpoint (Requires Admin Firebase ID Token)
app.post('/api/upload-image', verifyAdminFirebaseToken, (req, res, next) => {
  uploadMemory.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File size exceeds 5MB limit' : err.message;
      return res.status(400).json({ success: false, error: msg });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Multer file processing error' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided in "file" field' });
    }
    if (!supabase) {
      console.log('[UPLOAD DIAGNOSTIC] Supabase client initialized: false | SUPABASE_URL exists:', !!process.env.SUPABASE_URL, '| SUPABASE_SECRET_KEY exists:', !!process.env.SUPABASE_SECRET_KEY);
      return res.status(500).json({
        success: false,
        error: 'Supabase Storage is not configured on server',
        details: 'SUPABASE_URL and SUPABASE_SECRET_KEY environment variables required in Vercel'
      });
    }

    const file = req.file;
    if (!file.buffer || !file.buffer.length) {
      return res.status(400).json({ success: false, error: 'Empty file buffer received' });
    }

    console.log('[UPLOAD DIAGNOSTIC] Bucket: products | MIME type:', file.mimetype, '| Size:', file.size, 'bytes');
    const cleanBasename = file.originalname ? file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_') : 'image';
    const uniqueFileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${cleanBasename}`;

    const { data, error } = await supabase.storage
      .from('products')
      .upload(uniqueFileName, file.buffer, {
        contentType: file.mimetype || 'image/jpeg',
        upsert: false
      });

    if (error) {
      const errStatus = error.status || error.statusCode || 'N/A';
      const errMsg = error.message || error.error || (typeof error === 'string' ? error : JSON.stringify(error));
      const errCode = error.code || error.name || 'N/A';

      console.error('[UPLOAD DIAGNOSTIC] Supabase storage upload failed:', {
        status: errStatus,
        code: errCode,
        message: errMsg
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to upload image to Supabase Storage bucket',
        details: `Supabase error (${errStatus}/${errCode}): ${errMsg}`
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from('products')
      .getPublicUrl(uniqueFileName);

    const publicUrl = publicUrlData ? publicUrlData.publicUrl : '';
    console.log('[UPLOAD DIAGNOSTIC] Image uploaded successfully to Supabase Storage');
    return res.json({ success: true, url: publicUrl });
  } catch (err) {
    const catchMsg = err && err.message ? err.message : String(err || 'Unknown internal error');
    console.error('[UPLOAD DIAGNOSTIC] Upload endpoint internal error:', catchMsg);
    return res.status(500).json({
      success: false,
      error: 'Upload endpoint internal error',
      details: catchMsg
    });
  }
});

/* ---------------- RESEND EMAIL ORDER NOTIFICATIONS ---------------- */
const DESTINATION_ORDER_EMAIL = process.env.ORDER_NOTIFICATION_EMAIL || 'theindianiway2026@gmail.com';

// Anti-Abuse: In-memory Rate Limiter & Fast Duplicate Cache
const sentOrderIdsCache = new Map();
const ipRateLimitsMap = new Map();

function escapeEmailHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.post('/api/send-order-email', async (req, res) => {
  try {
    // 1. Spoof-Proof Client IP Rate Limiting on Vercel (x-real-ip set directly by Vercel Edge proxies)
    const realIpHeader = req.headers['x-real-ip'];
    const forwardedHeader = req.headers['x-forwarded-for'];
    const clientIp = (realIpHeader || (forwardedHeader ? String(forwardedHeader).split(',')[0] : req.socket.remoteAddress) || 'unknown').trim();
    
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    
    let rateData = ipRateLimitsMap.get(clientIp);
    if (!rateData || now > rateData.resetTime) {
      rateData = { count: 1, resetTime: now + windowMs };
      ipRateLimitsMap.set(clientIp, rateData);
    } else {
      rateData.count++;
      if (rateData.count > 10) {
        console.warn(`[RATE LIMIT] IP ${clientIp} exceeded order email threshold`);
        return res.status(429).json({ success: false, error: 'Too many email requests. Please try again later.' });
      }
    }

    const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

    if (!resendApiKey) {
      console.warn('[EMAIL DIAGNOSTIC] RESEND_API_KEY environment variable is missing.');
      return res.status(500).json({
        success: false,
        error: 'RESEND_API_KEY environment variable is missing on server'
      });
    }

    const { orderId } = req.body || {};

    if (typeof orderId !== 'string' || !orderId.trim() || orderId.trim().length > 100) {
      return res.status(400).json({ success: false, error: 'Invalid or missing Order ID' });
    }

    const cleanOrderId = orderId.trim();

    // 2. Dual-Layer Duplicate Email Prevention: Fast Memory Check
    if (sentOrderIdsCache.has(cleanOrderId)) {
      console.warn(`[FAST DUPLICATE CHECK] Email already processed in memory for order: ${cleanOrderId}`);
      return res.status(409).json({
        success: false,
        error: 'Email notification has already been processed for this order ID'
      });
    }

    // 3. Persistent Firestore Order Verification & Trusted Data Fetch
    let orderData = null;
    let orderRef = null;

    try {
      if (getApps().length > 0) {
        const db = getFirestore();
        orderRef = db.collection('orders').doc(cleanOrderId);
        const orderSnap = await orderRef.get();

        if (orderSnap.exists) {
          orderData = orderSnap.data();
        }
      }
    } catch (fsErr) {
      console.warn('[FIRESTORE DIAGNOSTIC] Could not read order document from Firestore:', fsErr.message);
    }

    if (!orderData && req.body && req.body.customerName) {
      // Fallback for local testing if Firebase Admin is uninitialized
      orderData = req.body;
    }

    if (!orderData || !orderData.customerName) {
      return res.status(404).json({
        success: false,
        error: 'Order document not found in database. Email notification cannot be sent.'
      });
    }

    // Persistent Duplicate Check (Stored directly on Firestore Order Document)
    if (orderData.emailSent === true) {
      sentOrderIdsCache.set(cleanOrderId, now);
      console.warn(`[PERSISTENT DUPLICATE CHECK] Email notification already sent for order: ${cleanOrderId}`);
      return res.status(409).json({
        success: false,
        error: 'Email notification has already been processed for this order ID'
      });
    }

    const customerName = orderData.customerName;
    const customerPhone = orderData.customerPhone;
    const customerEmail = orderData.customerEmail;
    const customerAddress = orderData.customerAddress;
    const pincode = orderData.pincode;
    const products = orderData.products;
    const totalAmount = orderData.totalAmount;

    // 3. Trusted Input Validation
    if (typeof customerName !== 'string' || !customerName.trim() || customerName.trim().length > 100) {
      return res.status(400).json({ success: false, error: 'Invalid or missing Customer Name in order' });
    }
    if (typeof customerPhone !== 'string' || !customerPhone.trim() || customerPhone.trim().length > 20) {
      return res.status(400).json({ success: false, error: 'Invalid or missing Customer Phone Number in order' });
    }
    if (typeof customerAddress !== 'string' || !customerAddress.trim() || customerAddress.trim().length > 500) {
      return res.status(400).json({ success: false, error: 'Invalid or missing Delivery Address in order' });
    }
    if (!Array.isArray(products) || products.length === 0 || products.length > 50) {
      return res.status(400).json({ success: false, error: 'Invalid or empty products list in order' });
    }

    // 4. Trusted Price & Subtotal Consistency Validation
    let calculatedTotal = 0;
    const productItems = Array.isArray(products) ? products : [];
    const orderItemsHtml = productItems.map(item => {
      const price = Math.max(0, parseInt(item.discountedPrice || item.price || 0));
      const qty = Math.max(1, parseInt(item.qty || 1));
      const subtotal = price * qty;
      calculatedTotal += subtotal;

      const itemNameEscaped = escapeEmailHtml(item.name || 'Product');
      const sizeStrEscaped = item.selectedSize ? ` (Size: ${escapeEmailHtml(item.selectedSize)})` : '';
      return `
        <tr>
          <td style="padding:8px; border-bottom:1px solid #eee;">${itemNameEscaped}${sizeStrEscaped}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:center;">${qty}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">₹${price}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:right; font-weight:bold;">₹${subtotal}</td>
        </tr>
      `;
    }).join('');

    const receivedTotal = parseInt(totalAmount || 0);
    if (isNaN(receivedTotal) || receivedTotal !== calculatedTotal) {
      console.warn(`[PRICE VALIDATION] Mismatch for order ${cleanOrderId}: Received ${receivedTotal}, Calculated ${calculatedTotal}`);
      return res.status(400).json({
        success: false,
        error: 'Order total calculation mismatch'
      });
    }

    const orderDateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const safeOrderId = escapeEmailHtml(cleanOrderId);
    const safeCustomerName = escapeEmailHtml(customerName.trim());
    const safeCustomerPhone = escapeEmailHtml(customerPhone.trim());
    const safeCustomerEmail = escapeEmailHtml(customerEmail ? String(customerEmail).trim() : 'N/A');
    const safeCustomerAddress = escapeEmailHtml(customerAddress.trim());
    const safePincode = escapeEmailHtml(pincode ? String(pincode).trim() : 'N/A');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <h2 style="color: #3D1F10; border-bottom: 2px solid #3D1F10; padding-bottom: 8px;">New Order Received - The Indiani Way</h2>
        
        <p>A new customer order has been placed on the website.</p>
        
        <div style="background: #FDF6F0; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="margin-top:0; color:#3D1F10;">Order Information</h3>
          <p style="margin:4px 0;"><strong>Order ID:</strong> ${safeOrderId}</p>
          <p style="margin:4px 0;"><strong>Order Date & Time:</strong> ${escapeEmailHtml(orderDateStr)}</p>
          <p style="margin:4px 0;"><strong>Payment Method:</strong> Cash on Delivery (COD)</p>
        </div>

        <div style="background: #F9F0EA; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="margin-top:0; color:#3D1F10;">Customer Details</h3>
          <p style="margin:4px 0;"><strong>Customer Name:</strong> ${safeCustomerName}</p>
          <p style="margin:4px 0;"><strong>Phone Number:</strong> ${safeCustomerPhone}</p>
          <p style="margin:4px 0;"><strong>Email Address:</strong> ${safeCustomerEmail}</p>
          <p style="margin:4px 0;"><strong>Delivery Address:</strong> ${safeCustomerAddress}</p>
          <p style="margin:4px 0;"><strong>Pincode:</strong> ${safePincode}</p>
        </div>

        <h3 style="color:#3D1F10;">Order Items</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px;">
          <thead>
            <tr style="background:#3D1F10; color:#fff;">
              <th style="padding:8px; text-align:left;">Product</th>
              <th style="padding:8px; text-align:center;">Qty</th>
              <th style="padding:8px; text-align:right;">Price</th>
              <th style="padding:8px; text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${orderItemsHtml}
          </tbody>
        </table>

        <div style="text-align:right; font-size:18px; font-weight:bold; color:#3D1F10; padding:10px; background:#FDF6F0; border-radius:4px;">
          Final Order Total: ₹${calculatedTotal}
        </div>
      </div>
    `;

    const { Resend } = require('resend');
    const resend = new Resend(resendApiKey);

    const fromEmail = process.env.FROM_EMAIL || 'The Indiani Way <onboarding@resend.dev>';
    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: [DESTINATION_ORDER_EMAIL],
      subject: `New Order Received - The Indiani Way`,
      html: htmlBody
    });

    if (emailResult.error) {
      console.error('[EMAIL DIAGNOSTIC] Resend send email failed:', emailResult.error);
      return res.status(500).json({
        success: false,
        error: emailResult.error.message || 'Failed to send order email'
      });
    }

    // Lock immediately in memory to block rapid retries within this serverless process
    sentOrderIdsCache.set(cleanOrderId, now);

    // Mark order document persistently in Firestore as emailSent: true
    if (orderRef) {
      try {
        await orderRef.update({
          emailSent: true,
          emailSentAt: new Date().toISOString()
        });
      } catch (updErr) {
        console.warn('[FIRESTORE DIAGNOSTIC] Failed to mark emailSent on Firestore order document:', updErr.message);
      }
    }

    console.log('[EMAIL DIAGNOSTIC] Order email notification sent successfully to', DESTINATION_ORDER_EMAIL, 'ID:', emailResult.data ? emailResult.data.id : 'N/A');
    return res.json({
      success: true,
      emailId: emailResult.data ? emailResult.data.id : null
    });

  } catch (err) {
    console.error('[EMAIL DIAGNOSTIC] Exception in send-order-email endpoint:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing email notification',
      details: err.message
    });
  }
});

/* ---------------- LOCAL RUN vs VERCEL ---------------- */
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running locally: http://localhost:${PORT}`));
}

module.exports = app;
