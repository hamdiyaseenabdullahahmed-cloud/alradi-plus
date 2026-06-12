// ⚡ الرعدي أونلاين – الخادم الأسطوري v10.0 FINAL
// 🦅 جميع الحقوق محفوظة – الرعدي أونلاين 2024
// =============================================
// ☁️ التخزين: MongoDB Atlas (سحابي حقيقي)
// 💾 الاحتياط: تخزين محلي تلقائي عند فشل الاتصال
// =============================================

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
const http = require('http');
const archiver = require('archiver');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ==================== إعدادات مهمة ====================
app.set('trust proxy', 1);

// ==================== Middleware ====================
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization','X-Offline-Data'] }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, message: { error: 'طلبات كثيرة' } }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== Multer ====================
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(__dirname, 'uploads', req.body?.type || 'general');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4().slice(0,8)}${path.extname(file.originalname)}`)
    }),
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ==================== MongoDB + LocalDB ====================
const JWT_SECRET = process.env.JWT_SECRET || 'alradi-super-secret-key-2024';
let DB;

class LocalDB {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    }
    _read(coll) { const f = path.join(this.dataDir, `${coll}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : []; }
    _write(coll, data) { fs.writeFileSync(path.join(this.dataDir, `${coll}.json`), JSON.stringify(data, null, 2)); }
    collection(name) {
        const self = this;
        return {
            find: (q = {}) => {
                let d = self._read(name);
                if (q._id) d = d.filter(i => i._id === q._id);
                if (q.email) d = d.filter(i => i.email === q.email);
                if (q.phone) d = d.filter(i => i.phone === q.phone);
                if (q.role) d = d.filter(i => i.role === q.role);
                if (q.code) d = d.filter(i => i.code === q.code);
                if (q.status && q.status !== 'all') d = d.filter(i => i.status === q.status);
                if (q.category) d = d.filter(i => i.category === q.category);
                if (q.isActive !== undefined) d = d.filter(i => i.isActive === q.isActive);
                if (q.type) d = d.filter(i => i.type === q.type);
                return {
                    sort: (s) => { const k = Object.keys(s)[0]; d.sort((a,b) => s[k]===-1 ? ((b[k]||0)-(a[k]||0)) : ((a[k]||0)-(b[k]||0))); return { toArray: async () => d, limit: (n) => d.slice(0,n) }; },
                    toArray: async () => d, limit: (n) => d.slice(0,n), skip: (n) => d.slice(n)
                };
            },
            findOne: async (q) => (await this.collection(name).find(q)).toArray().then(r => r[0] || null),
            insertOne: async (doc) => { const d = self._read(name); const nd = { _id: uuidv4(), ...doc, createdAt: doc.createdAt || new Date(), updatedAt: new Date() }; d.push(nd); self._write(name, d); return nd; },
            updateOne: async (q, up) => {
                const d = self._read(name);
                const idx = d.findIndex(i => (q._id && i._id === q._id) || (q.code && i.code === q.code) || (q.type && i.type === q.type));
                if (idx > -1) { if (up.$set) Object.assign(d[idx], up.$set, { updatedAt: new Date() }); if (up.$inc) { Object.keys(up.$inc).forEach(k => d[idx][k] = (d[idx][k]||0) + up.$inc[k]); } self._write(name, d); return { modifiedCount: 1 }; }
                return { modifiedCount: 0 };
            },
            deleteOne: async (q) => { let d = self._read(name); const idx = d.findIndex(i => i._id === q._id || i.code === q.code); if (idx > -1) { d.splice(idx, 1); self._write(name, d); return { deletedCount: 1 }; } return { deletedCount: 0 }; },
            countDocuments: async (q = {}) => (await this.collection(name).find(q)).toArray().then(r => r.length),
        };
    }
}

function useLocalDB() {
    const db = new LocalDB();
    const collections = ['users','products','orders','coupons','categories','settings','banners','sounds','audit_logs','trash','otp_codes','rfq_requests','chat_messages','competitors'];
    DB = {};
    collections.forEach(c => DB[c] = db.collection(c));
    DB.connected = false;
}

async function connectDB() {
    const uri = process.env.MONGODB_URI || 'mongodb+srv://alradi:alradi12345@cluster0.njjwehg.mongodb.net/alradi_store?retryWrites=true&w=majority&appName=Cluster0';
    try {
        await mongoose.connect(uri);
        console.log('✅ MongoDB Atlas متصل بنجاح – alradi_store');
        
        const schemas = {
            users: new mongoose.Schema({ fullName: String, email: String, phone: String, password: String, role: { type: String, default: 'customer' }, loyaltyPoints: { type: Number, default: 0 }, loyaltyTier: { type: String, default: 'برونزي' }, isActive: { type: Boolean, default: true }, preferences: mongoose.Schema.Types.Mixed, addresses: [mongoose.Schema.Types.Mixed], lastLogin: Date, totalSpent: { type: Number, default: 0 } }, { timestamps: true, strict: false }),
            products: new mongoose.Schema({}, { timestamps: true, strict: false }),
            orders: new mongoose.Schema({}, { timestamps: true, strict: false }),
            coupons: new mongoose.Schema({}, { timestamps: true, strict: false }),
            categories: new mongoose.Schema({}, { timestamps: true, strict: false }),
            settings: new mongoose.Schema({}, { timestamps: true, strict: false }),
            banners: new mongoose.Schema({}, { timestamps: true, strict: false }),
            sounds: new mongoose.Schema({}, { timestamps: true, strict: false }),
            audit_logs: new mongoose.Schema({}, { timestamps: true, strict: false }),
            trash: new mongoose.Schema({}, { timestamps: true, strict: false }),
            otp_codes: new mongoose.Schema({}, { timestamps: true, strict: false }),
            rfq_requests: new mongoose.Schema({}, { timestamps: true, strict: false }),
            chat_messages: new mongoose.Schema({}, { timestamps: true, strict: false }),
            competitors: new mongoose.Schema({}, { timestamps: true, strict: false })
        };
        
        DB = {};
        Object.keys(schemas).forEach(name => DB[name] = mongoose.model(name.charAt(0).toUpperCase() + name.slice(1), schemas[name]));
        DB.connected = true;
        console.log('📦 جميع نماذج MongoDB جاهزة');
    } catch (error) {
        console.log('❌ MongoDB غير متاح:', error.message);
        console.log('💾 استخدام التخزين المحلي');
        useLocalDB();
    }
}

// ==================== Middleware ====================
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) { req.user = null; return next(); }
    try { req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET); next(); } catch { req.user = null; next(); }
}
function adminRequired(req, res, next) {
    if (!req.user || !['admin','superadmin','manager'].includes(req.user.role)) return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
    next();
}
app.use(authMiddleware);

// ==================== الولاء ====================
const LOYALTY_TIERS = [
    { name: 'برونزي', min: 0, discount: 0 },
    { name: 'فضي', min: 500, discount: 5 },
    { name: 'ذهبي', min: 1000, discount: 10 },
    { name: 'بلاتيني', min: 2000, discount: 15 }
];
function getTier(points) { return LOYALTY_TIERS.reduce((t, c) => points >= c.min ? c : t, LOYALTY_TIERS[0]); }

// ==================== API: المصادقة ====================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, phone, password } = req.body;
        if (!fullName || !email || !phone || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        const exists = await DB.users.findOne({ $or: [{ email }, { phone }] });
        if (exists) return res.status(400).json({ error: 'البريد أو الهاتف مسجل مسبقاً' });
        const hash = await bcrypt.hash(password, 12);
        const user = await DB.users.insertOne({ fullName, email, phone, password: hash, role: 'customer', loyaltyPoints: 0, loyaltyTier: 'برونزي', isActive: true, preferences: { locale: 'ar', currency: 'SAR', theme: 'dark' }, addresses: [], totalSpent: 0 });
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        res.status(201).json({ success: true, token, user: { id: user._id, fullName, email, phone, role: 'customer', loyaltyPoints: 0, loyaltyTier: 'برونزي' } });
    } catch (e) { console.error(e); res.status(500).json({ error: 'فشل التسجيل' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await DB.users.findOne({ $or: [{ email }, { phone: email }] });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        await DB.users.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
        const tier = getTier(user.loyaltyPoints || 0);
        await DB.audit_logs.insertOne({ userId: user._id, action: 'LOGIN', details: `تسجيل دخول ${user.fullName}`, ipAddress: req.ip, createdAt: new Date() });
        res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, loyaltyPoints: user.loyaltyPoints || 0, loyaltyTier: tier.name, discountPercent: tier.discount, preferences: user.preferences, addresses: user.addresses } });
    } catch (e) { console.error(e); res.status(500).json({ error: 'فشل تسجيل الدخول' }); }
});

app.get('/api/user/profile', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const user = await DB.users.findOne({ _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const tier = getTier(user.loyaltyPoints || 0);
    res.json({ success: true, data: { ...user, password: undefined, loyaltyTier: tier.name, discountPercent: tier.discount } });
});

// ==================== API: الأقسام ====================
app.get('/api/categories', async (req, res) => {
    const cats = await DB.categories.find({ isActive: true }).toArray();
    res.json({ success: true, data: cats });
});

// ==================== API: المنتجات ====================
app.get('/api/products', async (req, res) => {
    const { page=1, limit=20, category, search, sort='-createdAt', featured, flashSale } = req.query;
    const q = { isActive: true };
    if (category && category !== 'all') q.category = category;
    if (featured) q.isFeatured = true;
    if (flashSale) q['flashSale.isActive'] = true;
    let items = await DB.products.find(q).toArray();
    if (search) { const term = search.toLowerCase(); items = items.filter(p => p.name?.toLowerCase().includes(term) || p.description?.toLowerCase().includes(term) || (p.tags || []).some(t => t.toLowerCase().includes(term))); }
    const total = items.length;
    items.sort((a,b) => { if (sort === 'price-asc') return a.price - b.price; if (sort === 'price-desc') return b.price - a.price; return new Date(b.createdAt) - new Date(a.createdAt); });
    const paged = items.slice((page-1)*limit, page*limit);
    res.json({ success: true, data: paged, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total/limit) } });
});

app.get('/api/products/:id', async (req, res) => {
    const product = await DB.products.findOne({ _id: req.params.id });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    const related = await DB.products.find({ category: product.category, isActive: true, _id: { $ne: product._id } }).limit(6).toArray();
    res.json({ success: true, data: { ...product, relatedProducts: related } });
});

app.post('/api/products', adminRequired, async (req, res) => {
    const { name, category, price, comparePrice, stock, description, images, tags, isFeatured } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'الاسم والقسم مطلوبان' });
    const discount = comparePrice && comparePrice > 0 ? Math.round((1 - price/comparePrice)*100) : 0;
    const product = await DB.products.insertOne({ name, category, price, comparePrice, discount, stock: stock || 0, description: description || '', images: images || [], tags: tags || [], isActive: true, isFeatured: isFeatured || false, ratings: { average: 0, count: 0 }, reviews: [], salesCount: 0, createdAt: new Date(), updatedAt: new Date() });
    await DB.audit_logs.insertOne({ userId: req.user.id, action: 'CREATE_PRODUCT', details: `إضافة منتج: ${name}`, targetTable: 'products', targetId: product._id, ipAddress: req.ip, createdAt: new Date() });
    io.emit('productUpdate', { type: 'new', product });
    res.status(201).json({ success: true, data: product });
});

app.put('/api/products/:id', adminRequired, async (req, res) => {
    const updates = { ...req.body, updatedAt: new Date() };
    if (req.body.price && req.body.comparePrice) updates.discount = Math.round((1 - req.body.price/req.body.comparePrice)*100);
    await DB.products.updateOne({ _id: req.params.id }, { $set: updates });
    res.json({ success: true, message: 'تم تحديث المنتج' });
});

app.delete('/api/products/:id', adminRequired, async (req, res) => {
    const product = await DB.products.findOne({ _id: req.params.id });
    if (product) { await DB.trash.insertOne({ ...product, deletedAt: new Date(), originalCollection: 'products' }); await DB.products.deleteOne({ _id: req.params.id }); }
    await DB.audit_logs.insertOne({ userId: req.user.id, action: 'DELETE_PRODUCT', details: `حذف منتج: ${product?.name}`, targetTable: 'products', targetId: req.params.id, ipAddress: req.ip, createdAt: new Date() });
    res.json({ success: true, message: 'تم نقل المنتج إلى سلة المحذوفات' });
});

// ==================== API: السلة والدفع ====================
app.post('/api/cart/loyalty-discount', async (req, res) => {
    if (!req.user) return res.json({ success: true, discountPercent: 0, tierName: 'برونزي' });
    const user = await DB.users.findOne({ _id: req.user.id });
    const tier = getTier(user?.loyaltyPoints || 0);
    res.json({ success: true, discountPercent: tier.discount, tierName: tier.name });
});

app.post('/api/checkout', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const { items, shippingAddress, shippingType='internal', paymentMethod='cod', couponCode, notes } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'السلة فارغة' });
    const user = await DB.users.findOne({ _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    for (const item of items) { const product = await DB.products.findOne({ _id: item.productId }); if (!product || product.stock < item.quantity) return res.status(400).json({ error: `${item.name} غير متوفر` }); }
    for (const item of items) await DB.products.updateOne({ _id: item.productId }, { $inc: { stock: -item.quantity, salesCount: item.quantity } });
    const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    const tier = getTier(user.loyaltyPoints || 0);
    const loyaltyDiscount = subtotal * (tier.discount / 100);
    const shippingCost = subtotal * (shippingType === 'internal' ? 0.05 : 0.10);
    let couponDiscount = 0;
    if (couponCode) { const coupon = await DB.coupons.findOne({ code: couponCode, isActive: true }); if (coupon) { couponDiscount = coupon.discountType === 'percentage' ? subtotal * (coupon.discountValue/100) : coupon.discountValue; await DB.coupons.updateOne({ code: couponCode }, { $inc: { usedCount: 1 } }); } }
    const totalDiscount = loyaltyDiscount + couponDiscount;
    const tax = (subtotal - totalDiscount) * 0.15;
    const total = subtotal - totalDiscount + tax + shippingCost;
    const orderNumber = `R3D-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
    await DB.orders.insertOne({ orderNumber, user: req.user.id, items, shipping: { type: shippingType, address: shippingAddress || {}, cost: shippingCost }, pricing: { subtotal, shippingCost, discount: totalDiscount, loyaltyDiscount, couponDiscount, tax, total, currency: 'SAR' }, payment: { method: paymentMethod, status: paymentMethod==='cod'?'pending':'pending' }, status: 'pending', statusHistory: [{ status: 'pending', note: 'تم إنشاء الطلب', updatedAt: new Date() }], notes, ipAddress: req.ip, createdAt: new Date(), updatedAt: new Date() });
    const pointsEarned = Math.floor(total / 10);
    await DB.users.updateOne({ _id: req.user.id }, { $inc: { loyaltyPoints: pointsEarned, totalSpent: total } });
    const newTier = getTier((user.loyaltyPoints||0) + pointsEarned);
    await DB.audit_logs.insertOne({ userId: req.user.id, action: 'CREATE_ORDER', details: `طلب #${orderNumber}`, ipAddress: req.ip, createdAt: new Date() });
    io.emit('newOrder', { orderNumber, total, customer: user.fullName, createdAt: new Date() });
    res.status(201).json({ success: true, message: 'تم الطلب', data: { orderNumber, total, pointsEarned, newTier: newTier.name } });
});

// ==================== API: الفاتورة ====================
app.get('/api/invoice/:orderNumber', async (req, res) => {
    const order = await DB.orders.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    const user = await DB.users.findOne({ _id: order.user });
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.fontSize(28).fillColor('#C9A84C').text('🦅 الرعدي أونلاين', { align: 'right' });
    doc.fontSize(16).fillColor('#333').text('فاتورة شراء', { align: 'left' });
    doc.moveDown();
    doc.fontSize(12).fillColor('#333').text(`رقم: ${order.orderNumber}`, { align: 'right' });
    doc.text(`العميل: ${user?.fullName || 'غير معروف'}`, { align: 'right' });
    doc.text(`التاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-SA')}`, { align: 'right' });
    doc.moveDown();
    (order.items || []).forEach((item, i) => doc.text(`${i+1}. ${item.name} - ${item.quantity} × ${item.price} = ${(item.price*item.quantity).toFixed(2)} ر.س`, { align: 'right' }));
    doc.moveDown();
    doc.fontSize(18).fillColor('#C9A84C').text(`الإجمالي: ${(order.pricing?.total || 0).toFixed(2)} ر.س`, { align: 'right' });
    try { const qr = await QRCode.toDataURL(JSON.stringify({ order: order.orderNumber })); doc.image(qr, 50, doc.y+20, { width: 80 }); } catch(e) {}
    doc.end();
});

app.get('/api/invoice/:orderNumber/qr', async (req, res) => {
    const order = await DB.orders.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'غير موجود' });
    const qrImage = await QRCode.toDataURL(JSON.stringify({ orderNumber: order.orderNumber, total: order.pricing?.total, status: order.status }));
    res.json({ success: true, qrCode: qrImage });
});

// ==================== API: الكوبونات ====================
app.post('/api/coupons/validate', async (req, res) => {
    const { code, cartTotal } = req.body;
    const coupon = await DB.coupons.findOne({ code, isActive: true });
    if (!coupon) return res.status(400).json({ error: 'الكوبون غير صالح' });
    const discount = coupon.discountType === 'percentage' ? cartTotal * (coupon.discountValue/100) : coupon.discountValue;
    res.json({ success: true, data: { code: coupon.code, discount } });
});

app.get('/api/coupons', adminRequired, async (req, res) => { res.json({ success: true, data: await DB.coupons.find().toArray() }); });
app.post('/api/coupons', adminRequired, async (req, res) => { const coupon = await DB.coupons.insertOne({ ...req.body, usedCount: 0, isActive: true, createdAt: new Date() }); res.status(201).json({ success: true, data: coupon }); });
app.delete('/api/coupons/:code', adminRequired, async (req, res) => { await DB.coupons.updateOne({ code: req.params.code }, { $set: { isActive: false } }); res.json({ success: true, message: 'تم التعطيل' }); });

// ==================== API: الإحصائيات ====================
app.get('/api/admin/stats', adminRequired, async (req, res) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const [allOrders, allProducts, allCustomers] = await Promise.all([DB.orders.find().toArray(), DB.products.find().toArray(), DB.users.find({ role: 'customer' }).toArray()]);
    const activeOrders = allOrders.filter(o => o.status !== 'cancelled');
    const todayOrders = allOrders.filter(o => new Date(o.createdAt) >= today);
    const predictedOutOfStock = allProducts.filter(p => p.isActive && p.stock > 0).map(p => {
        const dailyRate = (p.salesCount || 1) / Math.max(1, Math.ceil((new Date() - new Date(p.createdAt)) / 86400000));
        const daysUntilEmpty = dailyRate > 0 ? Math.floor(p.stock / dailyRate) : 999;
        return { id: p._id, name: p.name, stock: p.stock, dailyRate: Math.round(dailyRate * 10) / 10, daysUntilEmpty };
    }).filter(p => p.daysUntilEmpty <= 14).sort((a,b) => a.daysUntilEmpty - b.daysUntilEmpty);
    res.json({ success: true, data: {
        totalRevenue: activeOrders.reduce((s,o) => s + (o.pricing?.total||0), 0),
        todayRevenue: todayOrders.filter(o=>o.status!=='cancelled').reduce((s,o) => s + (o.pricing?.total||0), 0),
        totalOrders: allOrders.length, todayOrders: todayOrders.length,
        totalCustomers: allCustomers.length, totalProducts: allProducts.length,
        lowStockProducts: allProducts.filter(p => p.stock <= 5).length,
        bestSellingProducts: allProducts.sort((a,b) => (b.salesCount||0) - (a.salesCount||0)).slice(0,10),
        predictedOutOfStock,
        recentOrders: allOrders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0,15)
    }});
});

app.get('/api/admin/reports', adminRequired, async (req, res) => {
    const { type='sales', period='daily' } = req.query;
    if (type === 'sales') {
        const result = await DB.orders.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: { $dateToString: { format: period==='daily'?'%Y-%m-%d':'%Y-%m', date: '$createdAt' } }, orders: { $sum: 1 }, revenue: { $sum: '$pricing.total' }, averageOrder: { $avg: '$pricing.total' } } },
            { $sort: { _id: 1 } }
        ]);
        res.json({ success: true, data: await result.toArray() });
    } else if (type === 'products') {
        const products = await DB.products.find({ isActive: true }).toArray();
        res.json({ success: true, data: products.sort((a,b) => (b.salesCount||0) - (a.salesCount||0)).slice(0,30) });
    } else {
        const products = await DB.products.find({ isActive: true, stock: { $lte: 10 } }).toArray();
        res.json({ success: true, data: products });
    }
});

// ==================== API: الطلبات ====================
app.get('/api/orders', adminRequired, async (req, res) => {
    const { status } = req.query; const q = {}; if (status && status !== 'all') q.status = status;
    const orders = await DB.orders.find(q).toArray(); orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: orders });
});

app.put('/api/orders/:id/status', adminRequired, async (req, res) => {
    const { status } = req.body;
    const order = await DB.orders.findOne({ _id: req.params.id });
    const history = order?.statusHistory || [];
    history.push({ status, updatedBy: req.user.id, updatedAt: new Date() });
    await DB.orders.updateOne({ _id: req.params.id }, { $set: { status, statusHistory: history, updatedAt: new Date() } });
    res.json({ success: true, message: 'تم التحديث' });
});

// ==================== API: العملاء ====================
app.get('/api/users', adminRequired, async (req, res) => { const { role } = req.query; const q = {}; if (role) q.role = role; res.json({ success: true, data: await DB.users.find(q).toArray() }); });
app.get('/api/users/:id', adminRequired, async (req, res) => {
    const user = await DB.users.findOne({ _id: req.params.id });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const orders = await DB.orders.find({ user: req.params.id }).toArray();
    res.json({ success: true, data: { ...user, password: undefined, orders: orders.length, totalSpent: orders.reduce((s,o) => s + (o.pricing?.total||0), 0) } });
});

// ==================== API: سلة المحذوفات ====================
app.get('/api/trash', adminRequired, async (req, res) => { res.json({ success: true, data: await DB.trash.find().toArray() }); });
app.post('/api/trash/restore/:id', adminRequired, async (req, res) => { const item = await DB.trash.findOne({ _id: req.params.id }); if (item) { await DB[item.originalCollection].insertOne({ ...item, _id: item._id }); await DB.trash.deleteOne({ _id: req.params.id }); } res.json({ success: true, message: 'تمت الاستعادة' }); });
app.delete('/api/trash/:id', adminRequired, async (req, res) => { await DB.trash.deleteOne({ _id: req.params.id }); res.json({ success: true, message: 'تم الحذف النهائي' }); });

// ==================== API: سجل النشاطات ====================
app.get('/api/audit-logs', adminRequired, async (req, res) => { const logs = await DB.audit_logs.find().toArray(); logs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); res.json({ success: true, data: logs }); });

// ==================== API: الإعدادات ====================
app.get('/api/admin/settings/:type', adminRequired, async (req, res) => { const setting = await DB.settings.findOne({ type: req.params.type }); res.json({ success: true, data: setting?.data || null }); });
app.put('/api/admin/settings', adminRequired, async (req, res) => { const { type, data } = req.body; const existing = await DB.settings.findOne({ type }); if (existing) await DB.settings.updateOne({ type }, { $set: { data, updatedAt: new Date() } }); else await DB.settings.insertOne({ type, data, createdAt: new Date() }); res.json({ success: true, message: 'تم الحفظ' }); });

// ==================== API: البانرات ====================
app.get('/api/banners', async (req, res) => { res.json({ success: true, data: await DB.banners.find({ isActive: true }).toArray() }); });
app.post('/api/banners', adminRequired, async (req, res) => { const banner = await DB.banners.insertOne({ ...req.body, isActive: true, createdAt: new Date() }); res.status(201).json({ success: true, data: banner }); });
app.delete('/api/banners/:id', adminRequired, async (req, res) => { await DB.banners.updateOne({ _id: req.params.id }, { $set: { isActive: false } }); res.json({ success: true, message: 'تم التعطيل' }); });

// ==================== API: الصوتيات ====================
app.get('/api/sounds', adminRequired, async (req, res) => { res.json({ success: true, data: await DB.sounds.find().toArray() }); });
app.post('/api/sounds', adminRequired, upload.single('file'), async (req, res) => { const sound = await DB.sounds.insertOne({ name: req.body.name, url: `/uploads/sounds/${req.file.filename}`, type: req.body.type || 'effect', createdAt: new Date() }); res.status(201).json({ success: true, data: sound }); });

// ==================== API: رفع الملفات ====================
app.post('/api/upload', upload.array('files', 20), async (req, res) => { const files = (req.files || []).map(f => ({ url: `/uploads/${req.body?.type || 'general'}/${f.filename}`, originalName: f.originalname, size: f.size, type: f.mimetype })); res.json({ success: true, data: files }); });

// ==================== API: التفاوض ====================
app.post('/api/rfq', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const { productId, quantity, proposedPrice, message } = req.body;
    const product = await DB.products.findOne({ _id: productId });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    const rfq = await DB.rfq_requests.insertOne({ user: req.user.id, productId, productName: product.name, quantity, proposedPrice, originalPrice: product.price, message, status: 'pending', createdAt: new Date() });
    io.emit('newRFQ', rfq);
    res.status(201).json({ success: true, data: rfq });
});

app.get('/api/rfq', adminRequired, async (req, res) => { const rfqs = await DB.rfq_requests.find().toArray(); rfqs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); res.json({ success: true, data: rfqs }); });
app.put('/api/rfq/:id', adminRequired, async (req, res) => { await DB.rfq_requests.updateOne({ _id: req.params.id }, { $set: { status: req.body.status, updatedAt: new Date() } }); res.json({ success: true, message: 'تم التحديث' }); });

// ==================== API: المنافسين ====================
app.get('/api/admin/competitors', adminRequired, async (req, res) => { res.json({ success: true, data: await DB.competitors.find().toArray() }); });
app.post('/api/admin/competitors', adminRequired, async (req, res) => { const competitor = await DB.competitors.insertOne({ ...req.body, createdAt: new Date() }); res.status(201).json({ success: true, data: competitor }); });
app.put('/api/admin/competitors/:id', adminRequired, async (req, res) => { await DB.competitors.updateOne({ _id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } }); res.json({ success: true, message: 'تم التحديث' }); });
app.delete('/api/admin/competitors/:id', adminRequired, async (req, res) => { await DB.competitors.deleteOne({ _id: req.params.id }); res.json({ success: true, message: 'تم الحذف' }); });

// ==================== API: الصيانة التنبؤية ====================
app.get('/api/admin/maintenance-alerts', adminRequired, async (req, res) => {
    const orders = await DB.orders.find().toArray();
    const alerts = [];
    const now = new Date();
    orders.forEach(order => {
        if (order.maintenanceReminders) {
            order.maintenanceReminders.forEach(r => {
                if (!r.notified && new Date(r.dueDate) > now) {
                    alerts.push({ orderNumber: order.orderNumber, product: r.productName, dueDate: r.dueDate, daysLeft: Math.ceil((new Date(r.dueDate) - now)/86400000) });
                }
            });
        }
    });
    alerts.sort((a,b) => a.daysLeft - b.daysLeft);
    res.json({ success: true, data: alerts });
});

// ==================== API: النسخ الاحتياطي ====================
app.post('/api/backup', adminRequired, async (req, res) => {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const dir = path.join(__dirname, 'backups', timestamp);
    fs.mkdirSync(dir, { recursive: true });
    const output = fs.createWriteStream(path.join(dir, 'backup.zip'));
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);
    archive.directory(path.join(__dirname, 'data'), 'data');
    archive.directory(path.join(__dirname, 'uploads'), 'uploads');
    await archive.finalize();
    res.json({ success: true, path: `/backups/${timestamp}/backup.zip` });
});

// ==================== API: البحث المرئي والصوتي ====================
app.post('/api/search/visual', upload.single('image'), async (req, res) => { res.json({ success: true, data: await DB.products.find({ isActive: true }).limit(20).toArray() }); });
app.post('/api/search/voice', upload.single('audio'), async (req, res) => { res.json({ success: true, data: await DB.products.find({ isActive: true }).limit(20).toArray() }); });

// ==================== API: OTP ====================
app.post('/api/auth/otp/send', async (req, res) => {
    const { phone } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await DB.otp_codes.insertOne({ phone, code: otp, expiresAt: new Date(Date.now() + 10 * 60000), used: false });
    console.log(`📱 OTP: ${otp}`);
    res.json({ success: true, message: 'تم إرسال الرمز' });
});

app.post('/api/auth/otp/verify', async (req, res) => {
    const { phone, code } = req.body;
    const record = await DB.otp_codes.findOne({ phone, code, used: false });
    if (!record || new Date(record.expiresAt) < new Date()) return res.status(400).json({ error: 'رمز غير صالح' });
    await DB.otp_codes.updateOne({ _id: record._id }, { $set: { used: true } });
    let user = await DB.users.findOne({ phone });
    if (!user) { const hash = await bcrypt.hash('otp-'+phone, 10); user = await DB.users.insertOne({ fullName: 'مستخدم', email: `user-${phone}@alradi.com`, phone, password: hash, role: 'customer', loyaltyPoints: 0, loyaltyTier: 'برونزي', isActive: true }); }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, phone: user.phone } });
});

// ==================== API: المراجعات ====================
app.post('/api/products/:id/reviews', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const { rating, comment } = req.body;
    const product = await DB.products.findOne({ _id: req.params.id });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    const review = { user: req.user.id, rating, comment, createdAt: new Date() };
    product.reviews = product.reviews || [];
    product.reviews.push(review);
    const avg = product.reviews.reduce((s,r) => s + r.rating, 0) / product.reviews.length;
    await DB.products.updateOne({ _id: req.params.id }, { $set: { reviews: product.reviews, 'ratings.average': avg, 'ratings.count': product.reviews.length } });
    res.json({ success: true, data: review });
});

// ==================== WebSocket ====================
io.on('connection', (socket) => {
    socket.on('join', (room) => socket.join(room));
    socket.on('chat message', async (msg) => { const messageData = { id: uuidv4(), sender: msg.sender, text: msg.text, timestamp: new Date() }; io.emit('chat message', messageData); await DB.chat_messages.insertOne(messageData); });
});

// ==================== تنظيف دوري ====================
cron.schedule('0 0 * * *', async () => {
    const oldOTPs = await DB.otp_codes.find({ expiresAt: { $lte: new Date().toISOString() } }).toArray();
    for (const otp of oldOTPs) await DB.otp_codes.deleteOne({ _id: otp._id });
});

// ==================== بذرة البيانات ====================
async function seed() {
    const userCount = await DB.users.countDocuments();
    if (userCount > 0) return;
    const adminHash = await bcrypt.hash('admin123', 12);
    await DB.users.insertOne({ fullName: 'مدير النظام', email: 'alradi@gmail.com', phone: '+966500000000', password: adminHash, role: 'admin', loyaltyPoints: 9999, loyaltyTier: 'بلاتيني', isActive: true, preferences: { locale: 'ar', currency: 'SAR', theme: 'dark' }, addresses: [], totalSpent: 0 });
    const products = [
        { name: '📱 ساعة ذكية فاخرة Pro Max', price: 599, comparePrice: 899, stock: 50, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', type: 'main' }], discount: 33, isActive: true, isFeatured: true, ratings: { average: 4.5, count: 120 }, salesCount: 45, tags: ['ساعة','ذكية'] },
        { name: '🎧 سماعات لاسلكية بريميوم ANC', price: 349, stock: 100, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', type: 'main' }], isActive: true, isFeatured: true, ratings: { average: 4.2, count: 85 }, salesCount: 72, tags: ['سماعات','لاسلكية'] },
        { name: '🧴 عطر شرقي فاخر 100ml', price: 450, comparePrice: 600, stock: 30, category: 'عطور', images: [{ url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400', type: 'main' }], discount: 25, isActive: true, ratings: { average: 4.8, count: 200 }, salesCount: 150, tags: ['عطر','شرقي'] }
    ];
    for (const p of products) await DB.products.insertOne({ ...p, createdAt: new Date(), updatedAt: new Date() });
    await DB.coupons.insertOne({ code: 'WELCOME10', discountType: 'percentage', discountValue: 10, minOrderAmount: 100, usedCount: 0, isActive: true });
    const categories = ['إلكترونيات','أزياء','عطور','منزل','ساعات','أحذية','رياضة','كتب'];
    const icons = { 'إلكترونيات':'📱','أزياء':'👗','عطور':'🧴','منزل':'🏠','ساعات':'⌚','أحذية':'👠','رياضة':'⚽','كتب':'📚' };
    for (const c of categories) await DB.categories.insertOne({ name: c, icon: icons[c] || '📦', isActive: true });
    await DB.settings.insertOne({ type: 'store', data: { storeName: 'الرعدي أونلاين', storeSlogan: 'سوق اليمن الأول', primaryColor: '#C9A84C' }, createdAt: new Date() });
    await DB.settings.insertOne({ type: 'shipping', data: { internalRate: 5, externalRate: 10, freeShippingThreshold: 500 }, createdAt: new Date() });
    await DB.settings.insertOne({ type: 'return_policy', data: { text: 'الاستبدال مسموح خلال 14 يوماً', window: 14 }, createdAt: new Date() });
    console.log('✅ تم إضافة البيانات الافتراضية');
    console.log('👑 alradi@gmail.com / admin123');
}

// ==================== الصفحات ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => { if (!req.path.startsWith('/api/')) res.sendFile(path.join(__dirname, 'public', 'index.html')); else res.status(404).json({ error: 'المسار غير موجود' }); });

// ==================== بدء التشغيل ====================
const PORT = process.env.PORT || 3000;
(async () => {
    ['public','uploads','uploads/logo','uploads/products','uploads/sounds','uploads/banners','uploads/general','data','backups'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
    await connectDB();
    await seed();
    server.listen(PORT, () => {
        console.log('╔══════════════════════════════════════════╗');
        console.log('║   🦅 الرعدي أونلاين – v10.0 FINAL        ║');
        console.log('║   ☁️  MongoDB Atlas | 💾 Local Backup     ║');
        console.log(`║   🌐 http://localhost:${PORT}              ║`);
        console.log(`║   👑 http://localhost:${PORT}/admin        ║`);
        console.log('║   👤 alradi@gmail.com / admin123         ║');
        console.log('╚══════════════════════════════════════════╝');
    });
})();
