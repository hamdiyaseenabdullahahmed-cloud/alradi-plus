// =================================================================
// ⚡ الرعدي أونلاين - AlRadi Online - السيرفر الرئيسي v3.0
// متجر فاخر متكامل | لوحة تحكم | فواتير PDF | WebSocket | تقارير
// متوافق مع Render.com و GitHub - لا يحتاج Terminal
// =================================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');

const app = express();

// ============ Middleware ============
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'طلبات كثيرة، حاول لاحقاً' } });
app.use('/api/', limiter);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ قاعدة البيانات ============
let dbConnected = false;
let DB;

class LocalDB {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  _read(collection) {
    const file = path.join(this.dataDir, `${collection}.json`);
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
  }

  _write(collection, data) {
    const file = path.join(this.dataDir, `${collection}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  collection(name) {
    const self = this;
    return {
      find: (query = {}) => {
        let data = self._read(name);
        if (query._id) data = data.filter(i => i._id === query._id);
        if (query.email) data = data.filter(i => i.email === query.email);
        if (query.phone) data = data.filter(i => i.phone === query.phone);
        if (query.role) data = data.filter(i => i.role === query.role);
        if (query.code) data = data.filter(i => i.code === query.code);
        if (query.status && query.status !== 'all') data = data.filter(i => i.status === query.status);
        if (query.category) data = data.filter(i => i.category === query.category);
        if (query.isActive !== undefined) data = data.filter(i => i.isActive === query.isActive);
        if (query.type) data = data.filter(i => i.type === query.type);
        if (query.$or) {
          data = data.filter(i => query.$or.some(c => {
            if (c.name?.$regex) return new RegExp(c.name.$regex, c.name.$options || 'i').test(i.name || '');
            if (c.description?.$regex) return new RegExp(c.description.$regex, c.description.$options || 'i').test(i.description || '');
            if (c.tags?.$regex) return (i.tags || []).some(t => new RegExp(c.tags.$regex, c.tags.$options || 'i').test(t));
            return false;
          }));
        }
        if (query.price?.$gte) data = data.filter(i => i.price >= query.price.$gte);
        if (query.price?.$lte) data = data.filter(i => i.price <= query.price.$lte);
        if (query['flashSale.isActive'] !== undefined) data = data.filter(i => i.flashSale?.isActive === true);
        if (query.createdAt?.$gte) data = data.filter(i => new Date(i.createdAt) >= new Date(query.createdAt.$gte));
        return {
          sort: (s) => { const k = Object.keys(s)[0]; data.sort((a,b) => s[k]===-1 ? (b[k]||0)-(a[k]||0) : (a[k]||0)-(b[k]||0)); return { toArray: async () => data, limit: (n) => data.slice(0,n) }; },
          toArray: async () => data,
          limit: (n) => data.slice(0,n),
          skip: (n) => data.slice(n)
        };
      },
      findOne: async (query) => { const r = await this.collection(name).find(query); const d = await r.toArray(); return d[0] || null; },
      insertOne: async (doc) => {
        const data = self._read(name);
        const newDoc = { _id: uuidv4(), ...doc, createdAt: doc.createdAt || new Date(), updatedAt: new Date() };
        data.push(newDoc);
        self._write(name, data);
        return newDoc;
      },
      updateOne: async (query, update) => {
        const data = self._read(name);
        const idx = data.findIndex(i => {
          if (query._id) return i._id === query._id;
          if (query.code) return i.code === query.code;
          if (query.type) return i.type === query.type;
          return false;
        });
        if (idx > -1) {
          if (update.$set) Object.assign(data[idx], update.$set, { updatedAt: new Date() });
          if (update.$inc) { Object.keys(update.$inc).forEach(k => data[idx][k] = (data[idx][k]||0) + update.$inc[k]); data[idx].updatedAt = new Date(); }
          self._write(name, data);
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      },
      deleteOne: async (query) => {
        let data = self._read(name);
        const idx = data.findIndex(i => i._id === query._id || i.code === query.code);
        if (idx > -1) { data.splice(idx, 1); self._write(name, data); return { deletedCount: 1 }; }
        return { deletedCount: 0 };
      },
      countDocuments: async (query = {}) => { const r = await this.collection(name).find(query); const d = await r.toArray(); return d.length; },
      aggregate: async (pipeline) => {
        let data = self._read(name);
        for (const stage of pipeline) {
          if (stage.$match) {
            data = data.filter(i => {
              if (stage.$match.status?.$ne) return i.status !== stage.$match.status.$ne;
              if (stage.$match.createdAt?.$gte) return new Date(i.createdAt) >= new Date(stage.$match.createdAt.$gte);
              return true;
            });
          }
          if (stage.$group) {
            const g = {};
            data.forEach(i => {
              const d = new Date(i.createdAt).toISOString().split('T')[0];
              if (!g[d]) g[d] = { _id: d, orders: 0, revenue: 0 };
              g[d].orders++;
              g[d].revenue += i.pricing?.total || 0;
              g[d].averageOrder = g[d].revenue / g[d].orders;
            });
            data = Object.values(g);
          }
          if (stage.$sort) data.sort((a,b) => a._id.localeCompare(b._id));
        }
        return { toArray: async () => data };
      }
    };
  }
}

async function connectDB() {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      dbConnected = true;
      console.log('✅ MongoDB متصل');
      DB = mongoose;
    } else {
      console.log('💾 استخدام التخزين المحلي');
      DB = new LocalDB();
    }
  } catch (e) {
    console.log('💾 استخدام التخزين المحلي (MongoDB غير متاح)');
    DB = new LocalDB();
  }
}

// ============ أدوات المصادقة ============
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { req.user = null; return next(); }
  try {
    req.user = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'alradi-secret-2024');
    next();
  } catch { req.user = null; next(); }
}

function adminRequired(req, res, next) {
  if (!req.user || !['admin','superadmin','manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
  }
  next();
}

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { req.user = null; return next(); }
  try { req.user = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'alradi-secret-2024'); } catch { req.user = null; }
  next();
}

app.use(authMiddleware);

// ============ API: المصادقة ============
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;
    if (!fullName || !email || !phone || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    
    const exists = await DB.collection('users').findOne({ email });
    if (exists) return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
    
    const hashed = await bcrypt.hash(password, 10);
    const user = await DB.collection('users').insertOne({
      fullName, email, phone, password: hashed, role: 'customer',
      addresses: [], preferences: { locale: 'ar', currency: 'SAR', theme: 'dark-gold', notifications: { email: true, push: true, whatsapp: true } },
      loyaltyPoints: 0, loyaltyTier: 'bronze', twoFactorEnabled: false, isActive: true
    });
    
    const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET || 'alradi-secret-2024', { expiresIn: '30d' });
    
    res.status(201).json({ success: true, token, user: { id: user._id, fullName, email, phone, role: 'customer', loyaltyPoints: 0, loyaltyTier: 'bronze', preferences: user.preferences } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'فشل التسجيل' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await DB.collection('users').findOne({ email });
    if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    
    const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET || 'alradi-secret-2024', { expiresIn: '30d' });
    
    await DB.collection('users').updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
    
    res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, loyaltyPoints: user.loyaltyPoints || 0, loyaltyTier: user.loyaltyTier || 'bronze', preferences: user.preferences } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'فشل تسجيل الدخول' }); }
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
  const user = await DB.collection('users').findOne({ _id: req.user.id });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ success: true, data: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, loyaltyPoints: user.loyaltyPoints || 0, loyaltyTier: user.loyaltyTier || 'bronze', preferences: user.preferences, addresses: user.addresses, createdAt: user.createdAt } });
});

// ============ API: المنتجات ============
app.get('/api/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, minPrice, maxPrice, sort = '-createdAt', featured, flashSale } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    if (featured) query.isFeatured = true;
    if (flashSale) query['flashSale.isActive'] = true;
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }, { tags: { $regex: search, $options: 'i' } }];
    if (minPrice) query.price = { ...query.price, $gte: parseFloat(minPrice) };
    if (maxPrice) query.price = { ...query.price, $lte: parseFloat(maxPrice) };
    
    let result = await DB.collection('products').find(query);
    let items = await result.toArray();
    const total = items.length;
    
    items.sort((a, b) => sort.startsWith('-') ? (b[sort.slice(1)]||0) - (a[sort.slice(1)]||0) : (a[sort]||0) - (b[sort]||0));
    items = items.slice((page-1)*limit, page*limit);
    
    res.json({ success: true, data: items, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/limit) } });
  } catch (e) { console.error(e); res.json({ success: true, data: [], pagination: { page:1, limit:20, total:0, pages:0 } }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await DB.collection('products').findOne({ _id: req.params.id });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    
    const related = await DB.collection('products').find({ category: product.category, isActive: true });
    const relatedArr = (await related.toArray()).filter(p => p._id !== product._id).slice(0, 4);
    
    res.json({ success: true, data: { ...product, relatedProducts: relatedArr } });
  } catch (e) { res.status(500).json({ error: 'فشل جلب المنتج' }); }
});

app.post('/api/products', adminRequired, async (req, res) => {
  try {
    const product = await DB.collection('products').insertOne({
      ...req.body, sku: req.body.sku || 'SKU-'+uuidv4().substring(0,8),
      isActive: true, images: req.body.images || [],
      ratings: { average: 0, count: 0 }, reviews: [], stock: req.body.stock || 0
    });
    res.status(201).json({ success: true, data: product });
  } catch (e) { res.status(500).json({ error: 'فشل إضافة المنتج' }); }
});

app.put('/api/products/:id', adminRequired, async (req, res) => {
  try {
    await DB.collection('products').updateOne({ _id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    res.json({ success: true, message: 'تم تحديث المنتج' });
  } catch (e) { res.status(500).json({ error: 'فشل تحديث المنتج' }); }
});

app.delete('/api/products/:id', adminRequired, async (req, res) => {
  try {
    await DB.collection('products').updateOne({ _id: req.params.id }, { $set: { isActive: false } });
    res.json({ success: true, message: 'تم حذف المنتج' });
  } catch (e) { res.status(500).json({ error: 'فشل حذف المنتج' }); }
});

// ============ API: السلة (محفوظة عند العميل) ============
app.post('/api/cart/validate', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'السلة فارغة' });
    
    const validated = [];
    const unavailable = [];
    
    for (const item of items) {
      const product = await DB.collection('products').findOne({ _id: item.productId });
      if (!product || product.stock < item.quantity) {
        unavailable.push({ productId: item.productId, name: item.name, available: product?.stock || 0 });
      } else {
        validated.push({
          productId: product._id, name: product.name, sku: product.sku,
          image: product.images?.[0]?.url || '', price: product.flashSale?.isActive ? product.price * (1 - product.flashSale.discountPercentage/100) : product.price,
          quantity: item.quantity, maxQuantity: product.stock, discount: 0,
          subtotal: (product.flashSale?.isActive ? product.price * (1 - product.flashSale.discountPercentage/100) : product.price) * item.quantity
        });
      }
    }
    
    res.json({ success: true, data: { validated, unavailable } });
  } catch (e) { res.status(500).json({ error: 'فشل التحقق من السلة' }); }
});

// ============ API: إتمام الطلب ============
app.post('/api/checkout', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    
    const { items, shippingAddress, shippingType = 'internal', paymentMethod = 'cod', couponCode, notes, signature } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'السلة فارغة' });
    
    const user = await DB.collection('users').findOne({ _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    
    // التحقق من المخزون
    for (const item of items) {
      const product = await DB.collection('products').findOne({ _id: item.productId });
      if (!product || product.stock < item.quantity) return res.status(400).json({ error: `${item.name} غير متوفر بالكمية المطلوبة` });
    }
    
    // خصم المخزون
    for (const item of items) {
      await DB.collection('products').updateOne({ _id: item.productId }, { $inc: { stock: -item.quantity } });
    }
    
    // حساب التكاليف
    const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    
    // جلب إعدادات الشحن
    const shippingSettings = await DB.collection('settings').findOne({ type: 'shipping' });
    let shippingRate = shippingType === 'internal' ? 0.05 : 0.10;
    if (shippingSettings?.data) {
      if (shippingType === 'internal') shippingRate = (shippingSettings.data.internalRate || 5) / 100;
      else shippingRate = (shippingSettings.data.externalRate || 10) / 100;
    }
    const shippingCost = subtotal * shippingRate;
    
    // الكوبون
    let discountAmount = 0;
    let couponData = null;
    if (couponCode) {
      const coupon = await DB.collection('coupons').findOne({ code: couponCode, isActive: true });
      if (coupon) {
        discountAmount = coupon.discountType === 'percentage' ? subtotal * (coupon.discountValue/100) : coupon.discountValue;
        couponData = { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount };
        await DB.collection('coupons').updateOne({ code: couponCode }, { $inc: { usedCount: 1 } });
      }
    }
    
    // الضريبة
    const taxRate = 15;
    const taxableAmount = subtotal - discountAmount;
    const tax = taxableAmount * (taxRate/100);
    const total = taxableAmount + tax + shippingCost;
    
    // الحصول على شروط الاسترجاع
    const returnSettings = await DB.collection('settings').findOne({ type: 'return_policy' });
    const returnPolicyText = returnSettings?.data?.text || 'الاستبدال مسموح خلال 14 يوماً بشرط عدم وجود تلف مصنعي. لا يتم استرجاع المبلغ في حالات سوء الاستخدام.';
    const returnWindow = returnSettings?.data?.window || 14;
    
    // إنشاء الطلب
    const orderNumber = `R3D-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
    
    const order = await DB.collection('orders').insertOne({
      orderNumber, user: req.user.id, items,
      shipping: { type: shippingType, address: shippingAddress || {}, ratePercentage: shippingRate*100, cost: shippingCost, estimatedDays: shippingType==='internal'?3:14 },
      coupon: couponData,
      pricing: { subtotal, shippingCost, discount: discountAmount, tax, taxRate, total, currency: 'SAR' },
      payment: { method: paymentMethod, status: paymentMethod==='cod'?'pending':'pending' },
      status: 'pending',
      statusHistory: [{ status: 'pending', note: 'تم إنشاء الطلب', updatedAt: new Date() }],
      returnPolicy: { eligible: true, returnWindow, conditions: returnPolicyText },
      invoice: {
        pdfUrl: `/api/invoice/${orderNumber}`,
        signatureImageUrl: signature || null,
        signatureHash: signature ? require('crypto').createHash('sha256').update(signature).digest('hex') : null,
        termsVersion: 'v2.0',
        generatedAt: new Date()
      },
      fraudCheck: { isFlagged: false, riskScore: 0, reasons: [], checkedAt: new Date() },
      notes, ipAddress: req.ip, userAgent: req.get('user-agent'), isArchived: false,
      createdAt: new Date(), updatedAt: new Date()
    });
    
    // نقاط الولاء
    const points = Math.floor(total / 10);
    await DB.collection('users').updateOne({ _id: req.user.id }, { $inc: { loyaltyPoints: points } });
    const updatedUser = await DB.collection('users').findOne({ _id: req.user.id });
    let tier = 'bronze';
    if (updatedUser.loyaltyPoints >= 2000) tier = 'platinum';
    else if (updatedUser.loyaltyPoints >= 1000) tier = 'gold';
    else if (updatedUser.loyaltyPoints >= 500) tier = 'silver';
    await DB.collection('users').updateOne({ _id: req.user.id }, { $set: { loyaltyTier: tier } });
    
    // إرسال بريد
    if (process.env.SMTP_HOST && user.email) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT) || 465, secure: true,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        await transporter.sendMail({
          from: `"الرعدي أونلاين" <${process.env.SMTP_FROM}>`, to: user.email,
          subject: `✅ تأكيد الطلب #${orderNumber}`,
          html: `<div dir="rtl" style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9;">
            <h1 style="color:#C9A84C;">⚡ الرعدي أونلاين</h1>
            <h2>تم تأكيد طلبك بنجاح!</h2>
            <p><strong>رقم الطلب:</strong> ${orderNumber}</p>
            <p><strong>الإجمالي:</strong> ${total.toFixed(2)} ر.س</p>
            <p><strong>طريقة الدفع:</strong> ${paymentMethod === 'cod' ? 'الدفع عند الاستلام' : 'بطاقة ائتمان'}</p>
            <p><strong>التوصيل المتوقع:</strong> ${shippingType === 'internal' ? '3-5 أيام' : '7-14 يوم'}</p>
            <hr>
            <p style="color:#666;">شكراً لتسوقك مع الرعدي أونلاين ❤️</p>
          </div>`
        });
      } catch (e) { console.log('لم يتم إرسال البريد:', e.message); }
    }
    
    // تسجيل النشاط
    await DB.collection('audit_logs').insertOne({
      userId: req.user.id, action: 'CREATE_ORDER', details: `إنشاء طلب #${orderNumber}`,
      targetTable: 'orders', targetId: order._id, newValue: { total, status: 'pending' },
      ipAddress: req.ip, createdAt: new Date()
    });
    
    res.status(201).json({
      success: true, message: '🎉 تم إنشاء الطلب بنجاح',
      data: {
        orderNumber, orderId: order._id, total,
        invoiceUrl: `/api/invoice/${orderNumber}`,
        estimatedDelivery: new Date(Date.now() + (shippingType==='internal'?3:14)*86400000),
        loyaltyPointsEarned: points, newLoyaltyTier: tier
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'فشل إتمام الطلب' }); }
});

// ============ API: الفاتورة PDF ============
app.get('/api/invoice/:orderNumber', async (req, res) => {
  try {
    const order = await DB.collection('orders').findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    
    const user = await DB.collection('users').findOne({ _id: order.user });
    
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `فاتورة - ${order.orderNumber}`, Author: 'الرعدي أونلاين' } });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Invoice-${order.orderNumber}.pdf`);
    doc.pipe(res);
    
    // رأس الفاتورة
    doc.fontSize(28).fillColor('#C9A84C').text('⚡ الرعدي أونلاين', { align: 'right' });
    doc.fontSize(16).fillColor('#1A1A2E').text('فاتورة شراء فاخرة', { align: 'left' });
    doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#C9A84C').lineWidth(3).stroke();
    doc.moveDown(1.5);
    
    // بيانات العميل والطلب
    doc.fontSize(12).fillColor('#1A1A2E');
    doc.text(`رقم الطلب: ${order.orderNumber}`, { align: 'right' });
    doc.text(`التاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'right' });
    doc.text(`العميل: ${user?.fullName || 'غير معروف'}`, { align: 'right' });
    if (user?.email) doc.text(`البريد: ${user.email}`, { align: 'right' });
    if (user?.phone) doc.text(`الهاتف: ${user.phone}`, { align: 'right' });
    if (order.shipping?.address?.street) doc.text(`العنوان: ${order.shipping.address.street}`, { align: 'right' });
    doc.text(`طريقة الدفع: ${order.payment?.method === 'cod' ? 'الدفع عند الاستلام' : 'بطاقة ائتمان'}`, { align: 'right' });
    doc.text(`طريقة الشحن: ${order.shipping?.type === 'internal' ? 'داخلي' : 'دولي'}`, { align: 'right' });
    doc.moveDown();
    
    // جدول المنتجات
    doc.fontSize(14).fillColor('#C9A84C').text('📦 المنتجات', { align: 'right' });
    doc.moveDown(0.5);
    
    // رأس الجدول
    doc.rect(50, doc.y, 495, 25).fill('#1A1A2E');
    doc.fontSize(10).fillColor('#FFFFFF');
    doc.text('المنتج', 370, doc.y - 18, { width: 170, align: 'right' });
    doc.text('الكمية', 260, doc.y - 18, { width: 70, align: 'center' });
    doc.text('السعر', 180, doc.y - 18, { width: 70, align: 'center' });
    doc.text('المجموع', 60, doc.y - 18, { width: 70, align: 'center' });
    doc.moveDown(1.5);
    
    (order.items || []).forEach((item, i) => {
      const y = doc.y;
      if (i % 2 === 0) doc.rect(50, y - 5, 495, 25).fill('#F9F9F9');
      doc.fontSize(9).fillColor('#333333');
      doc.text(item.name, 370, y, { width: 170, align: 'right' });
      doc.text(item.quantity.toString(), 260, y, { width: 70, align: 'center' });
      doc.text(`${item.price} ر.س`, 180, y, { width: 70, align: 'center' });
      doc.text(`${item.subtotal || item.price * item.quantity} ر.س`, 60, y, { width: 70, align: 'center' });
      doc.moveDown(1.2);
    });
    
    doc.moveDown();
    
    // المجاميع
    doc.moveTo(300, doc.y).lineTo(545, doc.y).strokeColor('#C9A84C').lineWidth(1).stroke();
    doc.moveDown(0.5);
    
    const pricing = order.pricing || {};
    doc.fontSize(10).fillColor('#333');
    doc.text(`المجموع الفرعي: ${(pricing.subtotal || 0).toFixed(2)} ر.س`, { align: 'right' });
    doc.text(`تكلفة الشحن: ${(pricing.shippingCost || 0).toFixed(2)} ر.س (${order.shipping?.ratePercentage || 0}%)`, { align: 'right' });
    if (pricing.discount > 0) doc.text(`الخصم: -${pricing.discount.toFixed(2)} ر.س`, { align: 'right' });
    doc.text(`الضريبة (${pricing.taxRate || 15}%): ${(pricing.tax || 0).toFixed(2)} ر.س`, { align: 'right' });
    
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor('#C9A84C');
    doc.text(`الإجمالي النهائي: ${(pricing.total || 0).toFixed(2)} ر.س`, { align: 'right' });
    doc.moveDown(1.5);
    
    // شروط الاسترجاع
    const policyY = doc.y;
    doc.rect(40, policyY, 515, 80).fill('#FFF9E6').strokeColor('#C9A84C').lineWidth(1).stroke();
    doc.fontSize(11).fillColor('#C9A84C').text('📋 شروط الاسترجاع والإبدال', 60, policyY + 10, { width: 475, align: 'right' });
    doc.fontSize(9).fillColor('#666666').text(order.returnPolicy?.conditions || 'الاستبدال مسموح خلال 14 يوماً بشرط عدم وجود تلف.', 60, policyY + 35, { width: 475, align: 'right' });
    doc.moveDown(5);
    
    // QR Code
    try {
      const qrData = await QRCode.toDataURL(JSON.stringify({ orderNumber: order.orderNumber, total: pricing.total, store: 'الرعدي أونلاين', date: order.createdAt }));
      doc.image(qrData, 50, doc.y, { width: 80 });
      doc.fontSize(8).fillColor('#999').text('📱 امسح للتحقق من الفاتورة', 50, doc.y + 85, { width: 80, align: 'center' });
    } catch (e) {}
    
    // توقيع
    doc.moveDown(6);
    doc.fontSize(12).fillColor('#1A1A2E');
    doc.text('توقيع المستلم:', { align: 'right' });
    doc.moveTo(350, doc.y + 10).lineTo(545, doc.y + 10).strokeColor('#999').lineWidth(1).stroke();
    doc.text('ختم المتجر: ⚡ الرعدي أونلاين', 50, doc.y, { align: 'left' });
    
    // تذييل
    doc.fontSize(8).fillColor('#999').text('شكراً لتسوقك مع الرعدي أونلاين - نتمنى لك تجربة مميزة', 50, doc.page.height - 80, { width: 495, align: 'center' });
    doc.text('للاستفسارات: support@alradi.com | واتساب: +966XXXXXXXXX', 50, doc.page.height - 60, { width: 495, align: 'center' });
    
    doc.end();
  } catch (e) { console.error(e); res.status(500).json({ error: 'فشل إنشاء الفاتورة' }); }
});

// ============ API: الكوبونات ============
app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, cartTotal } = req.body;
    const coupon = await DB.collection('coupons').findOne({ code, isActive: true });
    if (!coupon) return res.status(400).json({ error: 'الكوبون غير صالح أو منتهي' });
    if (cartTotal < (coupon.minOrderAmount || 0)) return res.status(400).json({ error: `الحد الأدنى للطلب ${coupon.minOrderAmount} ر.س` });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'الكوبون نفذ' });
    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) return res.status(400).json({ error: 'الكوبون منتهي الصلاحية' });
    
    const discount = coupon.discountType === 'percentage' ? cartTotal * (coupon.discountValue/100) : coupon.discountValue;
    res.json({ success: true, data: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discount } });
  } catch (e) { res.status(500).json({ error: 'فشل التحقق من الكوبون' }); }
});

app.get('/api/coupons', adminRequired, async (req, res) => {
  try {
    const result = await DB.collection('coupons').find({});
    res.json({ success: true, data: await result.toArray() });
  } catch (e) { res.json({ success: true, data: [] }); }
});

app.post('/api/coupons', adminRequired, async (req, res) => {
  try {
    const coupon = await DB.collection('coupons').insertOne({ ...req.body, isActive: true, usedCount: 0, createdAt: new Date() });
    res.status(201).json({ success: true, data: coupon });
  } catch (e) { res.status(500).json({ error: 'فشل إضافة الكوبون' }); }
});

app.delete('/api/coupons/:code', adminRequired, async (req, res) => {
  try {
    await DB.collection('coupons').updateOne({ code: req.params.code }, { $set: { isActive: false } });
    res.json({ success: true, message: 'تم تعطيل الكوبون' });
  } catch (e) { res.status(500).json({ error: 'فشل حذف الكوبون' }); }
});

// ============ API: لوحة تحكم المدير ============
app.get('/api/admin/stats', adminRequired, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [allOrders, allProducts, allCustomers] = await Promise.all([
      DB.collection('orders').find({}), DB.collection('products').find({}), DB.collection('users').find({ role: 'customer' })
    ]);
    const orders = await allOrders.toArray();
    const products = await allProducts.toArray();
    const customers = await allCustomers.toArray();
    
    const activeOrders = orders.filter(o => o.status !== 'cancelled');
    const todayOrders = orders.filter(o => new Date(o.createdAt) >= today);
    const monthOrders = orders.filter(o => new Date(o.createdAt) >= monthStart);
    
    const totalRevenue = activeOrders.reduce((s,o) => s + (o.pricing?.total||0), 0);
    const todayRevenue = todayOrders.filter(o=>o.status!=='cancelled').reduce((s,o) => s + (o.pricing?.total||0), 0);
    const monthRevenue = monthOrders.filter(o=>o.status!=='cancelled').reduce((s,o) => s + (o.pricing?.total||0), 0);
    
    const recentOrders = orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
    const lowStockProducts = products.filter(p => p.stock <= 5 && p.isActive);
    
    res.json({
      success: true,
      data: {
        totalOrders: orders.length, todayOrders: todayOrders.length, monthOrders: monthOrders.length,
        totalRevenue, todayRevenue, monthRevenue,
        totalCustomers: customers.length, totalProducts: products.length,
        lowStockProducts: lowStockProducts.length, recentOrders
      }
    });
  } catch (e) { console.error(e); res.json({ success: true, data: { totalOrders:0,todayOrders:0,totalRevenue:0,todayRevenue:0,totalCustomers:0,totalProducts:0,lowStockProducts:0,recentOrders:[] } }); }
});

app.get('/api/admin/reports', adminRequired, async (req, res) => {
  try {
    const { type = 'sales', period = 'daily' } = req.query;
    if (type === 'sales') {
      const result = await DB.collection('orders').aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: period==='daily'?'%Y-%m-%d':'%Y-%m', date: '$createdAt' } }, orders: { $sum: 1 }, revenue: { $sum: '$pricing.total' }, averageOrder: { $avg: '$pricing.total' } } },
        { $sort: { _id: 1 } }
      ]);
      res.json({ success: true, data: await result.toArray() });
    } else if (type === 'products') {
      const result = await DB.collection('products').find({ isActive: true });
      const products = await result.toArray();
      res.json({ success: true, data: products.sort((a,b) => (b.salesCount||0) - (a.salesCount||0)).slice(0, 20) });
    } else {
      const result = await DB.collection('products').find({ isActive: true, stock: { $lte: 10 } });
      res.json({ success: true, data: await result.toArray() });
    }
  } catch (e) { res.json({ success: true, data: [] }); }
});

// ============ API: الإعدادات ============
app.get('/api/admin/settings/:type', adminRequired, async (req, res) => {
  try {
    const setting = await DB.collection('settings').findOne({ type: req.params.type });
    res.json({ success: true, data: setting?.data || null });
  } catch (e) { res.json({ success: true, data: null }); }
});

app.put('/api/admin/settings', adminRequired, async (req, res) => {
  try {
    const { type, data } = req.body;
    const existing = await DB.collection('settings').findOne({ type });
    if (existing) {
      await DB.collection('settings').updateOne({ type }, { $set: { data, updatedAt: new Date() } });
    } else {
      await DB.collection('settings').insertOne({ type, data, createdAt: new Date(), updatedAt: new Date() });
    }
    res.json({ success: true, message: 'تم حفظ الإعدادات' });
  } catch (e) { res.status(500).json({ error: 'فشل حفظ الإعدادات' }); }
});

// ============ API: الطلبات (للمدير) ============
app.get('/api/orders', adminRequired, async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;
    const result = await DB.collection('orders').find(query);
    const data = await result.toArray();
    data.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data });
  } catch (e) { res.json({ success: true, data: [] }); }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await DB.collection('orders').findOne({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    const user = await DB.collection('users').findOne({ _id: order.user });
    res.json({ success: true, data: { ...order, user: user ? { fullName: user.fullName, email: user.email, phone: user.phone } : null } });
  } catch (e) { res.status(500).json({ error: 'فشل جلب الطلب' }); }
});

app.put('/api/orders/:id/status', adminRequired, async (req, res) => {
  try {
    const { status, note } = req.body;
    const order = await DB.collection('orders').findOne({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    
    const statusHistory = order.statusHistory || [];
    statusHistory.push({ status, note: note || '', updatedBy: req.user.id, updatedAt: new Date() });
    
    await DB.collection('orders').updateOne({ _id: req.params.id }, { $set: { status, statusHistory, updatedAt: new Date() } });
    res.json({ success: true, message: 'تم تحديث حالة الطلب' });
  } catch (e) { res.status(500).json({ error: 'فشل تحديث حالة الطلب' }); }
});

app.get('/api/orders/user/:userId', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const result = await DB.collection('orders').find({ user: req.params.userId });
    const data = await result.toArray();
    data.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data });
  } catch (e) { res.json({ success: true, data: [] }); }
});

// ============ API: العملاء ============
app.get('/api/users', adminRequired, async (req, res) => {
  try {
    const { role } = req.query;
    const query = {};
    if (role) query.role = role;
    const result = await DB.collection('users').find(query);
    res.json({ success: true, data: await result.toArray() });
  } catch (e) { res.json({ success: true, data: [] }); }
});

// ============ API: رفع الملفات ============
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'uploads', req.body?.type || 'general');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4().substring(0,8)}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.post('/api/upload', upload.array('files', 20), async (req, res) => {
  try {
    const files = (req.files || []).map(f => ({
      url: `/uploads/${req.body?.type || 'general'}/${f.filename}`,
      originalName: f.originalname, size: f.size, type: f.mimetype
    }));
    
    // تحويل الصور إلى WebP
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        try {
          const inputPath = path.join(__dirname, file.url);
          const webpPath = inputPath.replace(/\.[^.]+$/, '.webp');
          await sharp(inputPath).resize(1200, 1200, { fit: 'inside' }).webp({ quality: 80 }).toFile(webpPath);
          file.webpUrl = file.url.replace(/\.[^.]+$/, '.webp');
        } catch (e) {}
      }
    }
    
    res.json({ success: true, data: files });
  } catch (e) { res.status(500).json({ error: 'فشل رفع الملفات' }); }
});

// ============ الصفحات ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// معالجة 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'المسار غير موجود' });
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ بذرة البيانات الأولية ============
async function seedData() {
  try {
    const count = await DB.collection('products').countDocuments();
    if (count > 0) return;
    
    console.log('🌱 إضافة البيانات التجريبية...');
    
    const products = [
      { name: '📱 ساعة ذكية فاخرة Pro Max', description: 'ساعة ذكية بمميزات متطورة: شاشة AMOLED، مقاومة للماء، GPS، مراقبة الصحة، عمر بطارية 14 يوم', price: 599, comparePrice: 899, stock: 50, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', type: 'main' }], ratings: { average: 4.5, count: 120 }, flashSale: { isActive: true, discountPercentage: 30, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, isFeatured: true },
      { name: '🎧 سماعات لاسلكية بريميوم ANC', description: 'سماعات بإلغاء الضوضاء النشط، جودة صوت Hi-Res، عمر بطارية 30 ساعة، مقاومة للماء IPX5', price: 349, stock: 100, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', type: 'main' }], ratings: { average: 4.2, count: 85 }, isFeatured: true },
      { name: '🧴 عطر شرقي فاخر 100ml', description: 'عطر بتركيبة شرقية أصيلة: العود، المسك، العنبر، الورد، الزعفران. يدوم 12 ساعة', price: 450, comparePrice: 600, stock: 30, category: 'عطور', images: [{ url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400', type: 'main' }], ratings: { average: 4.8, count: 200 } },
      { name: '👜 حقيبة يد جلد طبيعي', description: 'حقيبة جلد طبيعي 100%، صناعة يدوية، متوفرة بعدة ألوان، ضمان 5 سنوات', price: 799, stock: 15, category: 'أزياء', images: [{ url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400', type: 'main' }], ratings: { average: 4.0, count: 45 } },
      { name: '🏠 سجاد يدوي تقليدي فاخر', description: 'سجاد منسوج يدوياً من الصوف الطبيعي، نقوش تقليدية، مقاس 2×3 متر', price: 1200, stock: 8, category: 'منزل', images: [{ url: 'https://images.unsplash.com/photo-1600166898405-da9535204843?w=400', type: 'main' }], ratings: { average: 4.6, count: 30 } },
      { name: '☕ جهاز قهوة احترافي', description: 'جهاز قهوة إيطالي، ضغط 15 بار، طاحونة مدمجة، شاشة LCD، خزان 2 لتر', price: 899, stock: 20, category: 'منزل', images: [{ url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400', type: 'main' }], ratings: { average: 4.3, count: 67 } },
      { name: '🕶️ نظارة شمسية فاخرة', description: 'نظارة بإطار ذهبي عيار 18، عدسات بولارايد، حماية UV 400، علبة جلد فاخرة', price: 650, stock: 40, category: 'أزياء', images: [{ url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400', type: 'main' }], ratings: { average: 4.1, count: 55 } },
      { name: '📱 هاتف ذكي متطور Ultra', description: 'أحدث إصدار: شاشة 6.8" 120Hz، كاميرا 200MP، بطارية 5000mAh، شحن سريع 65W', price: 2999, comparePrice: 3499, stock: 12, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400', type: 'main' }], ratings: { average: 4.7, count: 310 }, flashSale: { isActive: true, discountPercentage: 15, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, isFeatured: true },
      { name: '💍 طقم مجوهرات فاخر', description: 'طقم ذهب عيار 21: عقد، أقراط، سوار، خاتم. تصميم حصري', price: 4500, stock: 5, category: 'أزياء', images: [{ url: 'https://images.unsplash.com/photo-1515562141567-917efd3dfc5c?w=400', type: 'main' }], ratings: { average: 5.0, count: 15 } },
      { name: '🎮 جهاز ألعاب محمول', description: 'شاشة 7" OLED، معالج قوي، 512GB تخزين، دعم WiFi 6، بطارية 8 ساعات', price: 1899, stock: 25, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=400', type: 'main' }], ratings: { average: 4.4, count: 90 } }
    ];
    
    for (const p of products) {
      await DB.collection('products').insertOne({ ...p, sku: 'SKU-'+uuidv4().substring(0,8), isActive: true, reviews: [], tags: [p.category], createdAt: new Date(), updatedAt: new Date() });
    }
    
    // كوبونات
    await DB.collection('coupons').insertOne({ code: 'WELCOME10', discountType: 'percentage', discountValue: 10, minOrderAmount: 100, maxUses: 1000, usedCount: 0, isActive: true, description: 'خصم 10% للعملاء الجدد', expiryDate: new Date(Date.now()+365*86400000), createdAt: new Date() });
    await DB.collection('coupons').insertOne({ code: 'FLASH50', discountType: 'fixed', discountValue: 50, minOrderAmount: 500, maxUses: 500, usedCount: 0, isActive: true, description: 'خصم 50 ريال على الطلبات فوق 500', expiryDate: new Date(Date.now()+30*86400000), createdAt: new Date() });
    await DB.collection('coupons').insertOne({ code: 'VIP25', discountType: 'percentage', discountValue: 25, minOrderAmount: 1000, maxUses: 100, usedCount: 0, isActive: true, description: 'خصم 25% للعملاء المميزين', expiryDate: new Date(Date.now()+90*86400000), createdAt: new Date() });
    
    // مدير
    const adminPass = await bcrypt.hash('admin123', 10);
    await DB.collection('users').insertOne({ fullName: 'مدير النظام', email: 'admin@alradi.com', phone: '+966500000000', password: adminPass, role: 'admin', loyaltyPoints: 9999, loyaltyTier: 'platinum', isActive: true, preferences: { locale: 'ar', currency: 'SAR', theme: 'dark-gold', notifications: { email: true, push: true, whatsapp: true } }, createdAt: new Date() });
    
    // إعدادات افتراضية
    await DB.collection('settings').insertOne({ type: 'store', data: { storeName: 'الرعدي أونلاين', storeSlogan: 'تسوق فاخر بلا حدود', primaryColor: '#C9A84C', secondaryColor: '#1A1A2E', bgColor: '#0F0F1A', textColor: '#FFFFFF' }, createdAt: new Date() });
    await DB.collection('settings').insertOne({ type: 'shipping', data: { internalRate: 5, externalRate: 10, freeShippingThreshold: 500 }, createdAt: new Date() });
    await DB.collection('settings').insertOne({ type: 'return_policy', data: { text: 'الاستبدال مسموح خلال 14 يوماً من تاريخ الاستلام بشرط أن يكون المنتج بحالته الأصلية وعدم وجود تلف ناتج عن سوء الاستخدام. لا يتم استرجاع المبلغ نقداً إلا في حالات العيب المصنعي المثبت.', window: 14 }, createdAt: new Date() });
    
    console.log('✅ تم إضافة البيانات التجريبية');
    console.log('👑 المدير: admin@alradi.com / admin123');
    console.log('🎫 كوبونات: WELCOME10 | FLASH50 | VIP25');
  } catch (e) { console.error('خطأ في البيانات التجريبية:', e); }
}

// ============ تنظيف دوري ============
cron.schedule('0 */6 * * *', async () => {
  console.log('🔄 تنظيف دوري...');
  try {
    const products = await DB.collection('products').find({ isActive: true });
    const allProducts = await products.toArray();
    const lowStock = allProducts.filter(p => p.stock <= 5);
    if (lowStock.length > 0) {
      console.log(`⚠️ ${lowStock.length} منتجات منخفضة المخزون`);
    }
  } catch (e) {}
});

// ============ بدء التشغيل ============
const PORT = process.env.PORT || 3000;

async function start() {
  // إنشاء المجلدات
  ['public', 'uploads', 'uploads/products', 'uploads/general', 'uploads/invoices', 'data', 'backups'].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
  
  await connectDB();
  await seedData();
  
  app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   ⚡ الرعدي أونلاين - AlRadi Online v3.0  ║');
    console.log(`║   🚀 المتجر: http://localhost:${PORT}        ║`);
    console.log(`║   👑 الإدارة: http://localhost:${PORT}/admin ║`);
    console.log('║   👤 admin@alradi.com | admin123           ║');
    console.log('╚════════════════════════════════════════════╝');
  });
}

start().catch(console.error);
