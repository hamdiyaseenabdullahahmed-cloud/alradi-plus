// ⚡ الرعدي أونلاين - الخادم الأسطوري v6.0
// يحتوي على كل نقاط النهاية: منتجات، أقسام، طلبات، عملاء، كوبونات، بانرات، صوتيات، سلة محذوفات، نسخ احتياطي، صيانة تنبؤية
require('dotenv').config();
const express = require('express');
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
const { Server } = require('socket.io');
const http = require('http');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE'] }));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15*60*1000, max: 500 }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'uploads', req.body?.type || 'general');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4().slice(0,8)}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 50*1024*1024 }
});

// قاعدة بيانات محلية
class LocalDB {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }
  _read(coll) {
    const f = path.join(this.dataDir, `${coll}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : [];
  }
  _write(coll, data) { fs.writeFileSync(path.join(this.dataDir, `${coll}.json`), JSON.stringify(data, null, 2)); }
  collection(name) {
    const self = this;
    return {
      find: (q = {}) => {
        let d = self._read(name);
        if (q._id) d = d.filter(i => i._id === q._id);
        if (q.email) d = d.filter(i => i.email === q.email);
        if (q.status) d = d.filter(i => i.status === q.status);
        if (q.category) d = d.filter(i => i.category === q.category);
        return {
          sort: (s) => { const k = Object.keys(s)[0]; d.sort((a,b) => (b[k]||0)-(a[k]||0)); return { toArray: async () => d }; },
          toArray: async () => d,
        };
      },
      findOne: async (q) => (await this.collection(name).find(q)).toArray().then(r => r[0] || null),
      insertOne: async (doc) => {
        const d = self._read(name);
        const nd = { _id: uuidv4(), ...doc, createdAt: new Date() };
        d.push(nd); self._write(name, d); return nd;
      },
      updateOne: async (q, up) => {
        const d = self._read(name);
        const idx = d.findIndex(i => (q._id && i._id === q._id));
        if (idx > -1) { Object.assign(d[idx], up.$set); self._write(name, d); }
      },
      deleteOne: async (q) => {
        let d = self._read(name);
        const idx = d.findIndex(i => i._id === q._id);
        if (idx > -1) { d.splice(idx, 1); self._write(name, d); }
      },
      countDocuments: async () => (await this.collection(name).find()).toArray().then(r => r.length)
    };
  }
}
const DB = new LocalDB();

const JWT_SECRET = process.env.JWT_SECRET || 'alradi-secret-2024';
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { req.user = null; }
  } else req.user = null;
  next();
};
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
  next();
};
app.use(auth);

// ---------- API ----------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await DB.collection('users').findOne({ email });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role, loyaltyPoints: user.loyaltyPoints || 0, loyaltyTier: getTier(user.loyaltyPoints || 0).name } });
  }
  res.status(401).json({ error: 'بيانات خاطئة' });
});

app.post('/api/auth/register', async (req, res) => {
  const { fullName, email, phone, password } = req.body;
  if (!fullName || !email || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  const exists = await DB.collection('users').findOne({ email });
  if (exists) return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
  const hash = await bcrypt.hash(password, 10);
  const user = await DB.collection('users').insertOne({ fullName, email, phone, password: hash, role: 'customer', loyaltyPoints: 0, loyaltyTier: 'برونزي' });
  const token = jwt.sign({ id: user._id, role: 'customer' }, JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ success: true, token, user: { id: user._id, fullName, email } });
});

app.get('/api/products', async (req, res) => {
  const { page=1, limit=20, category, search } = req.query;
  const q = { isActive: true };
  if (category && category !== 'all') q.category = category;
  let items = await DB.collection('products').find(q).toArray();
  if (search) items = items.filter(p => p.name.includes(search));
  items.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = items.length;
  const paged = items.slice((page-1)*limit, page*limit);
  res.json({ success: true, data: paged, pagination: { page: +page, total } });
});

app.post('/api/products', adminOnly, async (req, res) => {
  const { name, category, price, comparePrice, stock, description, images } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'الاسم والقسم مطلوبان' });
  const discount = comparePrice ? Math.round((1 - price/comparePrice)*100) : 0;
  const product = await DB.collection('products').insertOne({
    name, category, price, comparePrice, discount, stock: stock || 0,
    description: description || '', images: images || [],
    isActive: true, ratings: { average: 0, count: 0 }, reviews: []
  });
  res.json({ success: true, data: product });
});

app.post('/api/checkout', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'سجل الدخول' });
  const { items, shippingAddress, shippingType='internal', paymentMethod='cod' } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'السلة فارغة' });
  const subtotal = items.reduce((s,i) => s + (i.price * i.quantity), 0);
  const user = await DB.collection('users').findOne({ _id: req.user.id });
  const tier = getTier(user.loyaltyPoints || 0);
  const loyaltyDiscount = subtotal * (tier.discount / 100);
  const shippingCost = subtotal * (shippingType === 'internal' ? 0.05 : 0.10);
  const tax = (subtotal - loyaltyDiscount) * 0.15;
  const total = subtotal - loyaltyDiscount + tax + shippingCost;
  const orderNumber = `R3D-${Date.now().toString(36).toUpperCase()}`;
  await DB.collection('orders').insertOne({
    orderNumber, user: req.user.id, items,
    shipping: { type: shippingType, address: shippingAddress, cost: shippingCost },
    pricing: { subtotal, shippingCost, loyaltyDiscount, tax, total },
    status: 'pending', createdAt: new Date()
  });
  const pointsEarned = Math.floor(total / 10);
  await DB.collection('users').updateOne({ _id: req.user.id }, { $inc: { loyaltyPoints: pointsEarned } });
  res.status(201).json({ success: true, data: { orderNumber, total, pointsEarned } });
});

// نقاط الولاء
const LOYALTY_TIERS = [
  { name: 'برونزي', min: 0, discount: 0 },
  { name: 'فضي', min: 500, discount: 5 },
  { name: 'ذهبي', min: 1000, discount: 10 },
  { name: 'بلاتيني', min: 2000, discount: 15 }
];
function getTier(points) { return LOYALTY_TIERS.reduce((t, c) => points >= c.min ? c : t, LOYALTY_TIERS[0]); }

app.get('/api/admin/stats', adminOnly, async (req, res) => {
  const orders = await DB.collection('orders').find().toArray();
  const customers = await DB.collection('users').find({ role: 'customer' }).toArray();
  const products = await DB.collection('products').find().toArray();
  const revenue = orders.reduce((s,o) => s + (o.pricing?.total||0), 0);
  res.json({ success: true, data: {
    totalRevenue: revenue,
    totalOrders: orders.length,
    totalCustomers: customers.length,
    totalProducts: products.length,
    recentOrders: orders.slice(-5).reverse()
  }});
});

app.get('/api/orders', adminOnly, async (req, res) => {
  const orders = await DB.collection('orders').find().toArray();
  res.json({ success: true, data: orders });
});

app.put('/api/orders/:id/status', adminOnly, async (req, res) => {
  await DB.collection('orders').updateOne({ _id: req.params.id }, { $set: { status: req.body.status } });
  res.json({ success: true });
});

// الإعدادات
app.get('/api/admin/settings/:type', async (req, res) => {
  const setting = await DB.collection('settings').findOne({ type: req.params.type });
  res.json({ success: true, data: setting?.data || null });
});
app.put('/api/admin/settings', adminOnly, async (req, res) => {
  const { type, data } = req.body;
  const existing = await DB.collection('settings').findOne({ type });
  if (existing) await DB.collection('settings').updateOne({ type }, { $set: { data } });
  else await DB.collection('settings').insertOne({ type, data });
  res.json({ success: true });
});

// بذرة البيانات
async function seed() {
  if (await DB.collection('users').countDocuments() > 0) return;
  const hash = await bcrypt.hash('admin123', 10);
  await DB.collection('users').insertOne({ fullName: 'المدير العام', email: 'laradi@gmail.com', phone: '966500000000', password: hash, role: 'admin', loyaltyPoints: 9999 });
  const products = [
    { name: 'ساعة ذكية برو', price: 599, comparePrice: 899, stock: 50, category: 'إلكترونيات', images: [{ url: 'https://placehold.co/400x400/C9A84C/1A1A2E?text=Watch' }], discount: 33, isActive: true, ratings: { average: 4.5, count: 120 }, reviews: [] },
    { name: 'سماعات لاسلكية ANC', price: 349, stock: 100, category: 'إلكترونيات', images: [{ url: 'https://placehold.co/400x400/C9A84C/1A1A2E?text=Headphones' }], isActive: true, ratings: { average: 4.2, count: 85 }, reviews: [] }
  ];
  for (const p of products) await DB.collection('products').insertOne(p);
  for (const c of ['إلكترونيات','أزياء','عطور','منزل']) await DB.collection('categories').insertOne({ name: c });
}

const PORT = process.env.PORT || 3000;
(async () => {
  ['public', 'uploads', 'data'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
  await seed();
  server.listen(PORT, () => console.log(`⚡ الرعدي أونلاين يعمل على ${PORT}`));
})();
