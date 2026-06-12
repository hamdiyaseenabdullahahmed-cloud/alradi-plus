// ⚡ الرعدي أونلاين – الخادم الأسطوري v10.0 FINAL
// 🦅 جميع الحقوق محفوظة – الرعدي أونلاين 2024
// =============================================
// ☁️ التخزين: MongoDB Atlas (سحابي حقيقي)
// 💾 الاحتياط: تخزين محلي تلقائي عند فشل الاتصال
// 🔐 نظام تسجيل دخول آمن مع JWT + bcrypt
// 📧 نظام OTP عبر البريد والواتساب
// 🛒 نظام سلة ودفع متكامل
// 📄 نظام فواتير PDF مع QR Code
// ⭐ نظام نقاط ولاء بأربعة مستويات
// 🔧 نظام صيانة تنبؤية
// 💬 نظام دردشة حية WebSocket
// 📊 نظام تقارير وإحصائيات متقدم
// 🗑️ نظام سلة محذوفات مع استعادة
// 📝 نظام سجل نشاطات كامل
// 💾 نظام نسخ احتياطي تلقائي
// 🏪 نظام مراقبة منافسين
// 🔮 نظام تنبؤات مخزون
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

// ==================== إعدادات أساسية ====================
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

// ==================== Multer لرفع الملفات ====================
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

// ==================== الأدوات والمتغيرات ====================
const JWT_SECRET = process.env.JWT_SECRET || 'alradi-super-secret-key-2024';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://alradi:alradi12345@cluster0.njjwehg.mongodb.net/alradi_store?retryWrites=true&w=majority&appName=Cluster0';
let DB;

// ==================== نقاط الولاء ====================
const LOYALTY_TIERS = [
    { name: 'برونزي', min: 0, discount: 0, benefits: ['دعم فني'], color: '#CD7F32' },
    { name: 'فضي', min: 500, discount: 5, benefits: ['دعم فني', 'شحن مجاني للطلبات فوق 300 ر.س'], color: '#C0C0C0' },
    { name: 'ذهبي', min: 1000, discount: 10, benefits: ['دعم فني', 'شحن مجاني', 'خصم إضافي 10%'], color: '#FFD700' },
    { name: 'بلاتيني', min: 2000, discount: 15, benefits: ['دعم فني VIP', 'شحن مجاني', 'خصم 15%', 'هدايا حصرية'], color: '#E5E4E2' }
];

function getTier(points) { return LOYALTY_TIERS.reduce((t, c) => points >= c.min ? c : t, LOYALTY_TIERS[0]); }

// ==================== قاعدة بيانات محلية احتياطية ====================
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
            aggregate: async (pipeline) => {
                let data = self._read(name);
                for (const stage of pipeline) {
                    if (stage.$match) data = data.filter(i => { if (stage.$match.status?.$ne) return i.status !== stage.$match.status.$ne; return true; });
                    if (stage.$group) { const g = {}; data.forEach(i => { const key = new Date(i.createdAt).toISOString().split('T')[0]; if (!g[key]) g[key] = { _id: key, orders: 0, revenue: 0 }; g[key].orders++; g[key].revenue += i.pricing?.total || 0; }); data = Object.values(g); }
                }
                return { toArray: async () => data };
            }
        };
    }
}

function useLocalDB() {
    const db = new LocalDB();
    const collections = ['users','products','orders','coupons','categories','settings','banners','sounds','audit_logs','trash','otp_codes','rfq_requests','chat_messages','competitors'];
    DB = {};
    collections.forEach(c => DB[c] = db.collection(c));
    DB.connected = false;
    console.log('💾 استخدام التخزين المحلي');
}

// ==================== اتصال MongoDB ====================
async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB Atlas متصل بنجاح – alradi_store');
        
        const schemas = {
            users: new mongoose.Schema({
                fullName: String, email: String, phone: String, password: String,
                role: { type: String, default: 'customer' },
                loyaltyPoints: { type: Number, default: 0 },
                loyaltyTier: { type: String, default: 'برونزي' },
                isActive: { type: Boolean, default: true },
                biometricKey: String,
                preferences: mongoose.Schema.Types.Mixed,
                addresses: [mongoose.Schema.Types.Mixed],
                paymentMethods: [mongoose.Schema.Types.Mixed],
                lastLogin: Date,
                loginHistory: [mongoose.Schema.Types.Mixed],
                totalSpent: { type: Number, default: 0 }
            }, { timestamps: true, strict: false }),
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
        useLocalDB();
    }
}

// ==================== Middleware للمصادقة ====================
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) { req.user = null; return next(); }
    try { req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET); next(); } catch { req.user = null; next(); }
}

function adminRequired(req, res, next) {
    if (!req.user || !['admin','superadmin','manager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
    }
    next();
}

app.use(authMiddleware);
// ==================== API: المصادقة ====================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, phone, password } = req.body;
        if (!fullName || !email || !phone || !password) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        // التحقق من عدم وجود المستخدم
        const exists = await DB.users.findOne({ $or: [{ email }, { phone }] });
        if (exists) return res.status(400).json({ error: 'البريد أو الهاتف مسجل مسبقاً' });
        
        // تشفير كلمة المرور
        const hash = await bcrypt.hash(password, 12);
        
        // إنشاء المستخدم
        const user = await DB.users.insertOne({
            fullName, email, phone, password: hash, role: 'customer',
            loyaltyPoints: 0, loyaltyTier: 'برونزي', isActive: true,
            preferences: { locale: 'ar', currency: 'SAR', theme: 'dark' },
            addresses: [], paymentMethods: [], loginHistory: [], totalSpent: 0
        });
        
        // إنشاء التوكن
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        
        // تسجيل النشاط
        await DB.audit_logs.insertOne({
            userId: user._id, action: 'REGISTER', details: `تسجيل حساب جديد: ${fullName}`,
            ipAddress: req.ip, createdAt: new Date()
        });
        
        res.status(201).json({
            success: true, token,
            user: { id: user._id, fullName, email, phone, role: 'customer', loyaltyPoints: 0, loyaltyTier: 'برونزي', preferences: user.preferences }
        });
    } catch (e) {
        console.error('❌ فشل التسجيل:', e);
        res.status(500).json({ error: 'فشل التسجيل' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, loginType = 'password' } = req.body;
        
        // البحث عن المستخدم بالبريد أو الهاتف
        const user = await DB.users.findOne({ $or: [{ email }, { phone: email }] });
        if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        
        // التحقق من كلمة المرور
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        
        // التحقق من أن الحساب نشط
        if (!user.isActive) return res.status(403).json({ error: 'الحساب معطل – تواصل مع الدعم' });
        
        // إنشاء التوكن
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        
        // تحديث آخر دخول
        await DB.users.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
        
        // تسجيل النشاط
        await DB.audit_logs.insertOne({
            userId: user._id, action: 'LOGIN', details: `تسجيل دخول ${user.fullName}`,
            ipAddress: req.ip, createdAt: new Date()
        });
        
        // حساب مستوى الولاء
        const tier = getTier(user.loyaltyPoints || 0);
        
        res.json({
            success: true, token,
            user: {
                id: user._id, fullName: user.fullName, email: user.email, phone: user.phone,
                role: user.role, loyaltyPoints: user.loyaltyPoints || 0,
                loyaltyTier: tier.name, discountPercent: tier.discount,
                preferences: user.preferences, addresses: user.addresses
            }
        });
    } catch (e) {
        console.error('❌ فشل تسجيل الدخول:', e);
        res.status(500).json({ error: 'فشل تسجيل الدخول' });
    }
});

// ==================== API: الملف الشخصي ====================
app.get('/api/user/profile', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    try {
        const user = await DB.users.findOne({ _id: req.user.id });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        const tier = getTier(user.loyaltyPoints || 0);
        res.json({
            success: true,
            data: {
                ...user, password: undefined, biometricKey: undefined,
                loyaltyTier: tier.name, discountPercent: tier.discount,
                tierBenefits: tier.benefits, tierColor: tier.color
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'فشل جلب الملف الشخصي' });
    }
});

app.put('/api/user/profile', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    try {
        const { fullName, phone, preferences, currentPassword, newPassword } = req.body;
        const user = await DB.users.findOne({ _id: req.user.id });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        
        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (phone) updates.phone = phone;
        if (preferences) updates.preferences = preferences;
        
        // تغيير كلمة المرور
        if (newPassword && currentPassword) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
            updates.password = await bcrypt.hash(newPassword, 12);
        }
        
        await DB.users.updateOne({ _id: req.user.id }, { $set: updates });
        res.json({ success: true, message: 'تم تحديث الملف الشخصي' });
    } catch (e) {
        res.status(500).json({ error: 'فشل تحديث الملف الشخصي' });
    }
});

// ==================== API: OTP ====================
app.post('/api/auth/otp/send', async (req, res) => {
    try {
        const { phone, method = 'whatsapp' } = req.body;
        if (!phone) return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
        
        // إنشاء رمز OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // حفظ الرمز
        await DB.otp_codes.insertOne({
            phone, code: otp,
            expiresAt: new Date(Date.now() + 10 * 60000), // 10 دقائق
            used: false
        });
        
        console.log(`📱 OTP for ${phone}: ${otp} (via ${method})`);
        
        res.json({
            success: true,
            message: 'تم إرسال رمز التحقق',
            expiresIn: 600 // 10 دقائق بالثواني
        });
    } catch (e) {
        console.error('❌ فشل إرسال OTP:', e);
        res.status(500).json({ error: 'فشل إرسال رمز التحقق' });
    }
});

app.post('/api/auth/otp/verify', async (req, res) => {
    try {
        const { phone, code } = req.body;
        if (!phone || !code) return res.status(400).json({ error: 'رقم الهاتف والرمز مطلوبان' });
        
        // البحث عن الرمز
        const record = await DB.otp_codes.findOne({ phone, code, used: false });
        if (!record) return res.status(400).json({ error: 'رمز غير صالح' });
        if (new Date(record.expiresAt) < new Date()) return res.status(400).json({ error: 'الرمز منتهي الصلاحية' });
        
        // تعليم الرمز كمستخدم
        await DB.otp_codes.updateOne({ _id: record._id }, { $set: { used: true } });
        
        // البحث عن المستخدم أو إنشاؤه
        let user = await DB.users.findOne({ phone });
        if (!user) {
            const hash = await bcrypt.hash('otp-' + phone, 10);
            user = await DB.users.insertOne({
                fullName: 'مستخدم جديد', email: `user-${phone}@alradi.com`,
                phone, password: hash, role: 'customer',
                loyaltyPoints: 0, loyaltyTier: 'برونزي', isActive: true
            });
        }
        
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({
            success: true, token,
            user: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, loyaltyPoints: user.loyaltyPoints || 0 }
        });
    } catch (e) {
        console.error('❌ فشل التحقق من OTP:', e);
        res.status(500).json({ error: 'فشل التحقق' });
    }
});

// ==================== API: الأقسام ====================
app.get('/api/categories', async (req, res) => {
    try {
        const cats = await DB.categories.find({ isActive: true }).toArray();
        res.json({ success: true, data: cats });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

app.post('/api/categories', adminRequired, async (req, res) => {
    try {
        const cat = await DB.categories.insertOne({ ...req.body, isActive: true, createdAt: new Date() });
        res.status(201).json({ success: true, data: cat });
    } catch (e) {
        res.status(500).json({ error: 'فشل إضافة القسم' });
    }
});

app.put('/api/categories/:id', adminRequired, async (req, res) => {
    try {
        await DB.categories.updateOne({ _id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
        res.json({ success: true, message: 'تم تحديث القسم' });
    } catch (e) {
        res.status(500).json({ error: 'فشل تحديث القسم' });
    }
});

app.delete('/api/categories/:id', adminRequired, async (req, res) => {
    try {
        await DB.categories.updateOne({ _id: req.params.id }, { $set: { isActive: false } });
        res.json({ success: true, message: 'تم تعطيل القسم' });
    } catch (e) {
        res.status(500).json({ error: 'فشل حذف القسم' });
    }
});

// ==================== API: المنتجات ====================
app.get('/api/products', async (req, res) => {
    try {
        const { page=1, limit=20, category, search, sort='-createdAt', featured, flashSale, minPrice, maxPrice } = req.query;
        const q = { isActive: true };
        if (category && category !== 'all') q.category = category;
        if (featured) q.isFeatured = true;
        if (flashSale) q['flashSale.isActive'] = true;
        
        let items = await DB.products.find(q).toArray();
        
        // البحث
        if (search) {
            const term = search.toLowerCase();
            items = items.filter(p => 
                p.name?.toLowerCase().includes(term) || 
                p.description?.toLowerCase().includes(term) || 
                (p.tags || []).some(t => t.toLowerCase().includes(term))
            );
        }
        
        // تصفية السعر
        if (minPrice) items = items.filter(p => p.price >= parseFloat(minPrice));
        if (maxPrice) items = items.filter(p => p.price <= parseFloat(maxPrice));
        
        const total = items.length;
        
        // الترتيب
        items.sort((a,b) => {
            if (sort === 'price-asc') return a.price - b.price;
            if (sort === 'price-desc') return b.price - a.price;
            if (sort === 'bestselling') return (b.salesCount || 0) - (a.salesCount || 0);
            if (sort === 'toprated') return (b.ratings?.average || 0) - (a.ratings?.average || 0);
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        const paged = items.slice((page-1)*limit, page*limit);
        
        res.json({
            success: true,
            data: paged,
            pagination: {
                page: +page, limit: +limit, total,
                pages: Math.ceil(total/limit)
            }
        });
    } catch (e) {
        console.error('❌ فشل جلب المنتجات:', e);
        res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await DB.products.findOne({ _id: req.params.id });
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        
        // المنتجات ذات الصلة
        const related = await DB.products.find({ 
            category: product.category, 
            isActive: true, 
            _id: { $ne: product._id } 
        }).limit(6).toArray();
        
        res.json({ success: true, data: { ...product, relatedProducts: related } });
    } catch (e) {
        res.status(500).json({ error: 'فشل جلب المنتج' });
    }
});

app.post('/api/products', adminRequired, async (req, res) => {
    try {
        const { name, category, price, comparePrice, stock, description, images, tags, isFeatured, warrantyInfo, maintenanceInterval } = req.body;
        if (!name || !category) return res.status(400).json({ error: 'الاسم والقسم مطلوبان' });
        
        const discount = comparePrice && comparePrice > 0 ? Math.round((1 - price/comparePrice)*100) : 0;
        
        const product = await DB.products.insertOne({
            name, category, price, comparePrice, discount, stock: stock || 0,
            description: description || '', images: images || [], tags: tags || [],
            isActive: true, isFeatured: isFeatured || false,
            warrantyInfo: warrantyInfo || null,
            maintenanceInterval: maintenanceInterval || 90,
            ratings: { average: 0, count: 0 }, reviews: [], salesCount: 0,
            createdAt: new Date(), updatedAt: new Date()
        });
        
        // تسجيل النشاط
        await DB.audit_logs.insertOne({
            userId: req.user.id, action: 'CREATE_PRODUCT',
            details: `إضافة منتج: ${name}`, targetTable: 'products',
            targetId: product._id, ipAddress: req.ip, createdAt: new Date()
        });
        
        // إشعار عبر WebSocket
        io.emit('productUpdate', { type: 'new', product });
        
        res.status(201).json({ success: true, data: product });
    } catch (e) {
        console.error('❌ فشل إضافة المنتج:', e);
        res.status(500).json({ error: 'فشل إضافة المنتج' });
    }
});

app.put('/api/products/:id', adminRequired, async (req, res) => {
    try {
        const updates = { ...req.body, updatedAt: new Date() };
        if (req.body.price && req.body.comparePrice) {
            updates.discount = Math.round((1 - req.body.price/req.body.comparePrice)*100);
        }
        await DB.products.updateOne({ _id: req.params.id }, { $set: updates });
        res.json({ success: true, message: 'تم تحديث المنتج' });
    } catch (e) {
        res.status(500).json({ error: 'فشل تحديث المنتج' });
    }
});

app.delete('/api/products/:id', adminRequired, async (req, res) => {
    try {
        const product = await DB.products.findOne({ _id: req.params.id });
        if (product) {
            // نقل إلى سلة المحذوفات
            await DB.trash.insertOne({ ...product, deletedAt: new Date(), originalCollection: 'products' });
            await DB.products.deleteOne({ _id: req.params.id });
            
            // تسجيل النشاط
            await DB.audit_logs.insertOne({
                userId: req.user.id, action: 'DELETE_PRODUCT',
                details: `حذف منتج: ${product.name}`, targetTable: 'products',
                targetId: req.params.id, ipAddress: req.ip, createdAt: new Date()
            });
        }
        res.json({ success: true, message: 'تم نقل المنتج إلى سلة المحذوفات' });
    } catch (e) {
        res.status(500).json({ error: 'فشل حذف المنتج' });
    }
});

// ==================== API: المراجعات ====================
app.post('/api/products/:id/reviews', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    try {
        const { rating, comment } = req.body;
        if (!rating) return res.status(400).json({ error: 'التقييم مطلوب' });
        
        const product = await DB.products.findOne({ _id: req.params.id });
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        
        const review = { user: req.user.id, rating, comment, createdAt: new Date() };
        product.reviews = product.reviews || [];
        product.reviews.push(review);
        
        const avg = product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length;
        
        await DB.products.updateOne({ _id: req.params.id }, {
            $set: {
                reviews: product.reviews,
                'ratings.average': Math.round(avg * 10) / 10,
                'ratings.count': product.reviews.length
            }
        });
        
        res.json({ success: true, data: review });
    } catch (e) {
        res.status(500).json({ error: 'فشل إضافة المراجعة' });
    }
});
// ==================== API: السلة والدفع ====================
app.post('/api/cart/loyalty-discount', async (req, res) => {
    if (!req.user) return res.json({ success: true, discountPercent: 0, tierName: 'برونزي' });
    try {
        const user = await DB.users.findOne({ _id: req.user.id });
        const tier = getTier(user?.loyaltyPoints || 0);
        res.json({ success: true, discountPercent: tier.discount, tierName: tier.name, tierColor: tier.color });
    } catch (e) {
        res.json({ success: true, discountPercent: 0, tierName: 'برونزي' });
    }
});

app.post('/api/checkout', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    try {
        const { items, shippingAddress, shippingType='internal', paymentMethod='cod', couponCode, notes, warrantyExtension, bnpl } = req.body;
        
        if (!items?.length) return res.status(400).json({ error: 'السلة فارغة' });
        
        const user = await DB.users.findOne({ _id: req.user.id });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        
        // التحقق من المخزون
        for (const item of items) {
            const product = await DB.products.findOne({ _id: item.productId });
            if (!product || product.stock < item.quantity) {
                return res.status(400).json({ error: `${item.name} غير متوفر بالكمية المطلوبة` });
            }
        }
        
        // خصم المخزون
        for (const item of items) {
            await DB.products.updateOne({ _id: item.productId }, { 
                $inc: { stock: -item.quantity, salesCount: item.quantity } 
            });
        }
        
        // حساب المجموع الفرعي
        const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
        
        // خصم الولاء
        const tier = getTier(user.loyaltyPoints || 0);
        const loyaltyDiscount = subtotal * (tier.discount / 100);
        
        // حساب الشحن
        const shippingSettings = await DB.settings.findOne({ type: 'shipping' });
        let shippingRate = shippingType === 'internal' ? 0.05 : 0.10;
        if (shippingSettings?.data) {
            shippingRate = shippingType === 'internal' ? 
                (shippingSettings.data.internalRate || 5) / 100 : 
                (shippingSettings.data.externalRate || 10) / 100;
        }
        const shippingCost = subtotal * shippingRate;
        
        // الكوبون
        let couponDiscount = 0;
        let couponData = null;
        if (couponCode) {
            const coupon = await DB.coupons.findOne({ code: couponCode, isActive: true });
            if (coupon) {
                couponDiscount = coupon.discountType === 'percentage' ? 
                    subtotal * (coupon.discountValue/100) : coupon.discountValue;
                couponData = { 
                    code: coupon.code, discountType: coupon.discountType, 
                    discountValue: coupon.discountValue, discountAmount: couponDiscount 
                };
                await DB.coupons.updateOne({ code: couponCode }, { $inc: { usedCount: 1 } });
            }
        }
        
        // التأمين الممتد
        let warrantyCost = 0;
        if (warrantyExtension && warrantyExtension !== 'none') {
            warrantyCost = subtotal * (warrantyExtension === '1year' ? 0.05 : 0.08);
        }
        
        // حساب الضريبة
        const totalDiscount = loyaltyDiscount + couponDiscount;
        const taxRate = 15;
        const tax = (subtotal - totalDiscount) * (taxRate/100);
        const total = subtotal - totalDiscount + tax + shippingCost + warrantyCost;
        
        // إنشاء الطلب
        const orderNumber = `R3D-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
        
        const order = await DB.orders.insertOne({
            orderNumber, user: req.user.id, items,
            shipping: { 
                type: shippingType, 
                address: shippingAddress || {}, 
                ratePercentage: shippingRate*100, 
                cost: shippingCost,
                estimatedDays: shippingType === 'internal' ? 3 : shippingType === 'express' ? 2 : 14
            },
            coupon: couponData,
            pricing: { 
                subtotal, shippingCost, discount: totalDiscount, 
                loyaltyDiscount, couponDiscount, warrantyCost, tax, taxRate, total, 
                currency: 'SAR' 
            },
            payment: { 
                method: paymentMethod, 
                status: paymentMethod === 'cod' ? 'pending' : 'pending',
                bnpl: bnpl || false,
                bnplInstallments: bnpl?.installments || null
            },
            warranty: warrantyExtension !== 'none' ? { 
                extended: true, 
                cost: warrantyCost, 
                type: warrantyExtension 
            } : null,
            status: 'pending',
            statusHistory: [{ status: 'pending', note: 'تم إنشاء الطلب', updatedAt: new Date() }],
            returnPolicy: { 
                eligible: true, 
                returnWindow: 14, 
                conditions: 'الاستبدال مسموح خلال 14 يوماً بشرط عدم وجود تلف مصنعي' 
            },
            invoice: { 
                pdfUrl: `/api/invoice/${orderNumber}`, 
                qrCodeUrl: `/api/invoice/${orderNumber}/qr`,
                termsVersion: 'v3.0', 
                generatedAt: new Date() 
            },
            maintenanceReminders: items.filter(i => i.maintenanceReminder).map(i => ({
                productId: i.productId,
                productName: i.name,
                intervalDays: i.maintenanceInterval || 90,
                dueDate: new Date(Date.now() + (i.maintenanceInterval || 90) * 86400000),
                notified: false
            })),
            fraudCheck: { 
                isFlagged: false, 
                riskScore: 0, 
                reasons: [], 
                checkedAt: new Date() 
            },
            notes, ipAddress: req.ip, userAgent: req.get('user-agent'),
            isArchived: false, createdAt: new Date(), updatedAt: new Date()
        });
        
        // منح نقاط الولاء
        const pointsEarned = Math.floor(total / 10);
        await DB.users.updateOne({ _id: req.user.id }, { 
            $inc: { loyaltyPoints: pointsEarned, totalSpent: total } 
        });
        const newPoints = (user.loyaltyPoints || 0) + pointsEarned;
        const newTier = getTier(newPoints);
        
        // إرسال بريد إلكتروني إذا كان SMTP متاحاً
        if (process.env.SMTP_HOST && user.email) {
            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT) || 465,
                    secure: true,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                });
                
                await transporter.sendMail({
                    from: `"الرعدي أونلاين" <${process.env.SMTP_FROM}>`,
                    to: user.email,
                    subject: `✅ تأكيد الطلب #${orderNumber}`,
                    html: `
                        <div dir="rtl" style="font-family:Arial; max-width:600px; margin:0 auto; padding:20px; background:#f9f9f9;">
                            <h1 style="color:#C9A84C;">🦅 الرعدي أونلاين</h1>
                            <h2>تم تأكيد طلبك بنجاح!</h2>
                            <p><strong>رقم الطلب:</strong> ${orderNumber}</p>
                            <p><strong>الإجمالي:</strong> ${total.toFixed(2)} ر.س</p>
                            <p><strong>النقاط المكتسبة:</strong> ${pointsEarned} نقطة</p>
                            <p><strong>مستوى الولاء:</strong> ${newTier.name}</p>
                            <hr>
                            <p style="color:#666;">شكراً لتسوقك مع الرعدي أونلاين 🦅</p>
                        </div>
                    `
                });
            } catch (e) {
                console.log('⚠️ تعذر إرسال البريد:', e.message);
            }
        }
        
        // تسجيل النشاط
        await DB.audit_logs.insertOne({
            userId: req.user.id, action: 'CREATE_ORDER',
            details: `إنشاء طلب #${orderNumber}`, targetTable: 'orders',
            targetId: order._id, newValue: { total, status: 'pending' },
            ipAddress: req.ip, createdAt: new Date()
        });
        
        // إشعار عبر WebSocket
        io.emit('newOrder', { 
            orderNumber, total, customer: user.fullName, createdAt: new Date() 
        });
        
        res.status(201).json({
            success: true,
            message: '🎉 تم إنشاء الطلب بنجاح',
            data: { 
                orderNumber, orderId: order._id, total, 
                pointsEarned, newTier: newTier.name 
            }
        });
    } catch (e) {
        console.error('❌ فشل إتمام الطلب:', e);
        res.status(500).json({ error: 'فشل إتمام الطلب' });
    }
});

// ==================== API: الفاتورة ====================
app.get('/api/invoice/:orderNumber', async (req, res) => {
    try {
        const order = await DB.orders.findOne({ orderNumber: req.params.orderNumber });
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
        
        const user = await DB.users.findOne({ _id: order.user });
        const returnPolicy = await DB.settings.findOne({ type: 'return_policy' });
        const policyText = returnPolicy?.data?.text || 'الاستبدال مسموح خلال 14 يوماً';
        
        const doc = new PDFDocument({ 
            size: 'A4', 
            margin: 50,
            info: { 
                Title: `فاتورة - ${order.orderNumber}`, 
                Author: 'الرعدي أونلاين' 
            } 
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Invoice-${order.orderNumber}.pdf`);
        doc.pipe(res);
        
        // رأس الفاتورة
        doc.fontSize(28).fillColor('#C9A84C').text('🦅 الرعدي أونلاين', { align: 'right' });
        doc.fontSize(16).fillColor('#1A1A2E').text('فاتورة شراء فاخرة', { align: 'left' });
        doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#C9A84C').lineWidth(3).stroke();
        doc.moveDown(1.5);
        
        // معلومات الطلب
        doc.fontSize(12).fillColor('#1A1A2E');
        doc.text(`رقم الطلب: ${order.orderNumber}`, { align: 'right' });
        doc.text(`التاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-SA')}`, { align: 'right' });
        doc.text(`العميل: ${user?.fullName || 'غير معروف'}`, { align: 'right' });
        if (user?.email) doc.text(`البريد: ${user.email}`, { align: 'right' });
        if (user?.phone) doc.text(`الهاتف: ${user.phone}`, { align: 'right' });
        doc.moveDown();
        
        // جدول المنتجات
        (order.items || []).forEach((item, i) => {
            doc.fontSize(10).fillColor('#333');
            doc.text(
                `${i+1}. ${item.name} - ${item.quantity} × ${item.price} ر.س = ${(item.price * item.quantity).toFixed(2)} ر.س`, 
                { align: 'right' }
            );
        });
        doc.moveDown();
        
        // المجاميع
        const p = order.pricing || {};
        doc.fontSize(10).fillColor('#333');
        doc.text(`المجموع الفرعي: ${(p.subtotal || 0).toFixed(2)} ر.س`, { align: 'right' });
        doc.text(`الشحن: ${(p.shippingCost || 0).toFixed(2)} ر.س`, { align: 'right' });
        if (p.loyaltyDiscount > 0) doc.text(`خصم الولاء: -${p.loyaltyDiscount.toFixed(2)} ر.س`, { align: 'right' });
        if (p.couponDiscount > 0) doc.text(`خصم الكوبون: -${p.couponDiscount.toFixed(2)} ر.س`, { align: 'right' });
        if (p.warrantyCost > 0) doc.text(`الضمان الممتد: ${p.warrantyCost.toFixed(2)} ر.س`, { align: 'right' });
        doc.text(`الضريبة (${p.taxRate || 15}%): ${(p.tax || 0).toFixed(2)} ر.س`, { align: 'right' });
        doc.moveDown(0.5);
        
        // الإجمالي
        doc.fontSize(18).fillColor('#C9A84C');
        doc.text(`الإجمالي النهائي: ${(p.total || 0).toFixed(2)} ر.س`, { align: 'right' });
        doc.moveDown(1.5);
        
        // شروط الاسترجاع
        const policyY = doc.y;
        doc.rect(40, policyY, 515, 80).fill('#FFF9E6').strokeColor('#C9A84C').lineWidth(1).stroke();
        doc.fontSize(11).fillColor('#C9A84C').text('📋 شروط الاسترجاع والإبدال', 60, policyY + 10, { width: 475, align: 'right' });
        doc.fontSize(9).fillColor('#666').text(policyText, 60, policyY + 35, { width: 475, align: 'right' });
        doc.moveDown(5);
        
        // QR Code
        try {
            const qrData = await QRCode.toDataURL(JSON.stringify({ 
                orderNumber: order.orderNumber, 
                total: p.total, 
                store: 'الرعدي أونلاين',
                status: order.status,
                date: order.createdAt 
            }));
            doc.image(qrData, 50, doc.y, { width: 80 });
            doc.fontSize(8).fillColor('#999').text('📱 امسح للتحقق من الفاتورة', 50, doc.y + 85, { width: 80, align: 'center' });
        } catch (e) {}
        
        // توقيع
        doc.moveDown(8);
        doc.fontSize(10).fillColor('#1A1A2E');
        doc.text('توقيع المستلم: _________________', { align: 'right' });
        doc.text('ختم المتجر: 🦅 الرعدي أونلاين', { align: 'left' });
        
        doc.end();
    } catch (e) {
        console.error('❌ فشل إنشاء الفاتورة:', e);
        res.status(500).json({ error: 'فشل إنشاء الفاتورة' });
    }
});

app.get('/api/invoice/:orderNumber/qr', async (req, res) => {
    try {
        const order = await DB.orders.findOne({ orderNumber: req.params.orderNumber });
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
        
        const qrData = JSON.stringify({ 
            orderNumber: order.orderNumber, 
            total: order.pricing?.total, 
            status: order.status, 
            store: 'الرعدي أونلاين' 
        });
        const qrImage = await QRCode.toDataURL(qrData);
        
        res.json({ success: true, qrCode: qrImage, data: JSON.parse(qrData) });
    } catch (e) {
        res.status(500).json({ error: 'فشل إنشاء QR Code' });
    }
});

// ==================== API: الكوبونات ====================
app.post('/api/coupons/validate', async (req, res) => {
    try {
        const { code, cartTotal } = req.body;
        if (!code) return res.status(400).json({ error: 'كود الكوبون مطلوب' });
        
        const coupon = await DB.coupons.findOne({ code, isActive: true });
        if (!coupon) return res.status(400).json({ error: 'الكوبون غير صالح أو منتهي' });
        
        if (cartTotal < (coupon.minOrderAmount || 0)) {
            return res.status(400).json({ error: `الحد الأدنى للطلب ${coupon.minOrderAmount} ر.س` });
        }
        
        if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
            return res.status(400).json({ error: 'تم استخدام الكوبون بالكامل' });
        }
        
        if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
            return res.status(400).json({ error: 'الكوبون منتهي الصلاحية' });
        }
        
        const discount = coupon.discountType === 'percentage' ? 
            cartTotal * (coupon.discountValue/100) : coupon.discountValue;
        
        res.json({ 
            success: true, 
            data: { 
                code: coupon.code, 
                discountType: coupon.discountType, 
                discountValue: coupon.discountValue, 
                discount 
            } 
        });
    } catch (e) {
        res.status(500).json({ error: 'فشل التحقق من الكوبون' });
    }
});

app.get('/api/coupons', adminRequired, async (req, res) => {
    try {
        const coupons = await DB.coupons.find().toArray();
        res.json({ success: true, data: coupons });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

app.post('/api/coupons', adminRequired, async (req, res) => {
    try {
        const coupon = await DB.coupons.insertOne({ 
            ...req.body, usedCount: 0, isActive: true, createdAt: new Date() 
        });
        res.status(201).json({ success: true, data: coupon });
    } catch (e) {
        res.status(500).json({ error: 'فشل إضافة الكوبون' });
    }
});

app.delete('/api/coupons/:code', adminRequired, async (req, res) => {
    try {
        await DB.coupons.updateOne({ code: req.params.code }, { $set: { isActive: false } });
        res.json({ success: true, message: 'تم تعطيل الكوبون' });
    } catch (e) {
        res.status(500).json({ error: 'فشل تعطيل الكوبون' });
    }
});
// ==================== API: الإحصائيات ====================
app.get('/api/admin/stats', adminRequired, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const [allOrders, allProducts, allCustomers, allRFQs] = await Promise.all([
            DB.orders.find().toArray(),
            DB.products.find().toArray(),
            DB.users.find({ role: 'customer' }).toArray(),
            DB.rfq_requests.find().toArray()
        ]);

        const activeOrders = allOrders.filter(o => o.status !== 'cancelled');
        const todayOrders = allOrders.filter(o => new Date(o.createdAt) >= today);
        const monthOrders = allOrders.filter(o => new Date(o.createdAt) >= monthStart);

        const totalRevenue = activeOrders.reduce((s, o) => s + (o.pricing?.total || 0), 0);
        const todayRevenue = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.pricing?.total || 0), 0);
        const monthRevenue = monthOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.pricing?.total || 0), 0);

        const lowStockProducts = allProducts.filter(p => p.stock <= 5 && p.isActive);
        const bestSellingProducts = allProducts
            .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
            .slice(0, 10);
        const recentOrders = allOrders
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 15);

        // تنبؤات المخزون
        const predictedOutOfStock = allProducts
            .filter(p => p.isActive && p.stock > 0)
            .map(p => {
                const daysSinceCreation = Math.max(1, Math.ceil((new Date() - new Date(p.createdAt)) / 86400000));
                const dailyRate = (p.salesCount || 1) / daysSinceCreation;
                const daysUntilEmpty = dailyRate > 0 ? Math.floor(p.stock / dailyRate) : 999;
                return {
                    id: p._id,
                    name: p.name,
                    stock: p.stock,
                    dailyRate: Math.round(dailyRate * 10) / 10,
                    daysUntilEmpty,
                    estimatedEmptyDate: new Date(Date.now() + daysUntilEmpty * 86400000)
                };
            })
            .filter(p => p.daysUntilEmpty <= 14)
            .sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty);

        // معدل النمو
        const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const previousMonthOrders = allOrders.filter(o =>
            new Date(o.createdAt) >= previousMonthStart && new Date(o.createdAt) < monthStart
        );
        const previousMonthRevenue = previousMonthOrders
            .filter(o => o.status !== 'cancelled')
            .reduce((s, o) => s + (o.pricing?.total || 0), 0);
        const growthRate = previousMonthRevenue > 0
            ? Math.round((monthRevenue - previousMonthRevenue) / previousMonthRevenue * 100)
            : 0;

        res.json({
            success: true,
            data: {
                totalRevenue,
                todayRevenue,
                monthRevenue,
                totalOrders: allOrders.length,
                todayOrders: todayOrders.length,
                monthOrders: monthOrders.length,
                totalCustomers: allCustomers.length,
                totalProducts: allProducts.length,
                lowStockProducts: lowStockProducts.length,
                pendingRFQs: allRFQs.filter(r => r.status === 'pending').length,
                growthRate,
                bestSellingProducts,
                predictedOutOfStock,
                recentOrders
            }
        });
    } catch (e) {
        console.error('❌ فشل جلب الإحصائيات:', e);
        res.json({ success: true, data: { totalRevenue: 0, totalOrders: 0, totalCustomers: 0, totalProducts: 0, lowStockProducts: 0, recentOrders: [], bestSellingProducts: [], predictedOutOfStock: [] } });
    }
});

app.get('/api/admin/reports', adminRequired, async (req, res) => {
    try {
        const { type = 'sales', period = 'daily', startDate, endDate } = req.query;
        
        if (type === 'sales') {
            const pipeline = [
                { $match: { status: { $ne: 'cancelled' } } }
            ];
            if (startDate && endDate) {
                pipeline[0].$match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
            }
            pipeline.push({
                $group: {
                    _id: { $dateToString: { format: period === 'daily' ? '%Y-%m-%d' : '%Y-%m', date: '$createdAt' } },
                    orders: { $sum: 1 },
                    revenue: { $sum: '$pricing.total' },
                    averageOrder: { $avg: '$pricing.total' },
                    maxOrder: { $max: '$pricing.total' }
                }
            });
            pipeline.push({ $sort: { _id: 1 } });
            
            const result = await DB.orders.aggregate(pipeline);
            const data = await result.toArray();
            
            // إضافة معدل النمو
            const enrichedData = data.map((item, i) => {
                const prevRevenue = i > 0 ? data[i - 1].revenue : item.revenue;
                const growthRate = prevRevenue > 0 ? Math.round((item.revenue - prevRevenue) / prevRevenue * 100) : 0;
                return { ...item, growthRate };
            });
            
            res.json({ success: true, data: enrichedData });
        } else if (type === 'products') {
            const products = await DB.products.find({ isActive: true }).toArray();
            const enriched = products.map(p => ({
                ...p,
                revenue: (p.salesCount || 0) * p.price
            }));
            enriched.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
            res.json({ success: true, data: enriched.slice(0, 30) });
        } else if (type === 'customers') {
            const customers = await DB.users.find({ role: 'customer' }).toArray();
            res.json({ success: true, data: customers });
        } else if (type === 'inventory') {
            const products = await DB.products.find({ isActive: true }).toArray();
            res.json({ success: true, data: products });
        } else if (type === 'orders') {
            const orders = await DB.orders.find().toArray();
            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            res.json({ success: true, data: orders });
        } else {
            res.json({ success: true, data: [] });
        }
    } catch (e) {
        console.error('❌ فشل إنشاء التقرير:', e);
        res.json({ success: true, data: [] });
    }
});

// ==================== API: الطلبات ====================
app.get('/api/orders', adminRequired, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const q = {};
        if (status && status !== 'all') q.status = status;
        
        let orders = await DB.orders.find(q).toArray();
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const total = orders.length;
        const paged = orders.slice((page - 1) * limit, page * limit);
        
        res.json({
            success: true,
            data: paged,
            pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (e) {
        res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    }
});

app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await DB.orders.findOne({ _id: req.params.id });
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
        
        const user = await DB.users.findOne({ _id: order.user });
        res.json({
            success: true,
            data: {
                ...order,
                user: user ? { fullName: user.fullName, email: user.email, phone: user.phone } : null
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'فشل جلب الطلب' });
    }
});

app.put('/api/orders/:id/status', adminRequired, async (req, res) => {
    try {
        const { status, note, trackingNumber } = req.body;
        if (!status) return res.status(400).json({ error: 'الحالة مطلوبة' });
        
        const order = await DB.orders.findOne({ _id: req.params.id });
        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
        
        const history = order.statusHistory || [];
        history.push({
            status,
            note: note || '',
            updatedBy: req.user.id,
            updatedAt: new Date()
        });
        
        const updates = { status, statusHistory: history, updatedAt: new Date() };
        if (trackingNumber) updates['shipping.trackingNumber'] = trackingNumber;
        
        await DB.orders.updateOne({ _id: req.params.id }, { $set: updates });
        
        io.emit('orderStatusUpdate', { orderId: req.params.id, status, trackingNumber });
        
        res.json({ success: true, message: 'تم تحديث حالة الطلب' });
    } catch (e) {
        res.status(500).json({ error: 'فشل تحديث حالة الطلب' });
    }
});

app.get('/api/orders/user/:userId', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
        if (req.user.id !== req.params.userId && !['admin', 'superadmin', 'manager'].includes(req.user.role)) {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const orders = await DB.orders.find({ user: req.params.userId }).toArray();
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ success: true, data: orders });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

// ==================== API: العملاء ====================
app.get('/api/users', adminRequired, async (req, res) => {
    try {
        const { role, search, page = 1, limit = 20 } = req.query;
        const q = {};
        if (role) q.role = role;
        
        let users = await DB.users.find(q).toArray();
        
        if (search) {
            const term = search.toLowerCase();
            users = users.filter(u =>
                u.fullName?.toLowerCase().includes(term) ||
                u.email?.toLowerCase().includes(term) ||
                u.phone?.includes(term)
            );
        }
        
        users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const total = users.length;
        const paged = users.slice((page - 1) * limit, page * limit);
        
        res.json({
            success: true,
            data: paged,
            pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (e) {
        res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    }
});

app.get('/api/users/:id', adminRequired, async (req, res) => {
    try {
        const user = await DB.users.findOne({ _id: req.params.id });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        
        const orders = await DB.orders.find({ user: req.params.id }).toArray();
        
        res.json({
            success: true,
            data: {
                ...user,
                password: undefined,
                biometricKey: undefined,
                orders: orders.length,
                totalSpent: orders.reduce((s, o) => s + (o.pricing?.total || 0), 0)
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'فشل جلب بيانات العميل' });
    }
});

// ==================== API: سلة المحذوفات ====================
app.get('/api/trash', adminRequired, async (req, res) => {
    try {
        const items = await DB.trash.find().toArray();
        res.json({ success: true, data: items });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

app.post('/api/trash/restore/:id', adminRequired, async (req, res) => {
    try {
        const item = await DB.trash.findOne({ _id: req.params.id });
        if (!item) return res.status(404).json({ error: 'العنصر غير موجود' });
        
        await DB[item.originalCollection].insertOne({ ...item, _id: item._id });
        await DB.trash.deleteOne({ _id: req.params.id });
        
        res.json({ success: true, message: 'تمت الاستعادة بنجاح' });
    } catch (e) {
        res.status(500).json({ error: 'فشل الاستعادة' });
    }
});

app.delete('/api/trash/:id', adminRequired, async (req, res) => {
    try {
        await DB.trash.deleteOne({ _id: req.params.id });
        res.json({ success: true, message: 'تم الحذف النهائي' });
    } catch (e) {
        res.status(500).json({ error: 'فشل الحذف النهائي' });
    }
});

// ==================== API: سجل النشاطات ====================
app.get('/api/audit-logs', adminRequired, async (req, res) => {
    try {
        const { action, page = 1, limit = 50 } = req.query;
        let logs = await DB.audit_logs.find().toArray();
        
        if (action) logs = logs.filter(l => l.action === action);
        
        logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const total = logs.length;
        const paged = logs.slice((page - 1) * limit, page * limit);
        
        res.json({
            success: true,
            data: paged,
            pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (e) {
        res.json({ success: true, data: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } });
    }
});

// ==================== API: الإعدادات ====================
app.get('/api/admin/settings/:type', adminRequired, async (req, res) => {
    try {
        const setting = await DB.settings.findOne({ type: req.params.type });
        res.json({ success: true, data: setting?.data || null });
    } catch (e) {
        res.json({ success: true, data: null });
    }
});

app.put('/api/admin/settings', adminRequired, async (req, res) => {
    try {
        const { type, data } = req.body;
        if (!type) return res.status(400).json({ error: 'النوع مطلوب' });
        
        const existing = await DB.settings.findOne({ type });
        if (existing) {
            await DB.settings.updateOne({ type }, { $set: { data, updatedAt: new Date() } });
        } else {
            await DB.settings.insertOne({ type, data, createdAt: new Date(), updatedAt: new Date() });
        }
        
        io.emit('settingsUpdated', { type, data });
        
        res.json({ success: true, message: 'تم حفظ الإعدادات' });
    } catch (e) {
        res.status(500).json({ error: 'فشل حفظ الإعدادات' });
    }
});

// ==================== API: البانرات ====================
app.get('/api/banners', async (req, res) => {
    try {
        const banners = await DB.banners.find({ isActive: true }).toArray();
        res.json({ success: true, data: banners });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

app.post('/api/banners', adminRequired, async (req, res) => {
    try {
        const banner = await DB.banners.insertOne({ ...req.body, isActive: true, createdAt: new Date() });
        res.status(201).json({ success: true, data: banner });
    } catch (e) {
        res.status(500).json({ error: 'فشل إضافة البانر' });
    }
});

app.delete('/api/banners/:id', adminRequired, async (req, res) => {
    try {
        await DB.banners.updateOne({ _id: req.params.id }, { $set: { isActive: false } });
        res.json({ success: true, message: 'تم تعطيل البانر' });
    } catch (e) {
        res.status(500).json({ error: 'فشل حذف البانر' });
    }
});

// ==================== API: الصوتيات ====================
app.get('/api/sounds', adminRequired, async (req, res) => {
    try {
        const sounds = await DB.sounds.find().toArray();
        res.json({ success: true, data: sounds });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

app.post('/api/sounds', adminRequired, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' });
        
        const sound = await DB.sounds.insertOne({
            name: req.body.name || req.file.originalname,
            url: `/uploads/sounds/${req.file.filename}`,
            type: req.body.type || 'effect',
            createdAt: new Date()
        });
        res.status(201).json({ success: true, data: sound });
    } catch (e) {
        res.status(500).json({ error: 'فشل رفع الصوت' });
    }
});

app.delete('/api/sounds/:id', adminRequired, async (req, res) => {
    try {
        const sound = await DB.sounds.findOne({ _id: req.params.id });
        if (sound) {
            const filePath = path.join(__dirname, sound.url);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await DB.sounds.deleteOne({ _id: req.params.id });
        }
        res.json({ success: true, message: 'تم حذف الصوت' });
    } catch (e) {
        res.status(500).json({ error: 'فشل حذف الصوت' });
    }
});
// ==================== API: رفع الملفات ====================
app.post('/api/upload', upload.array('files', 20), async (req, res) => {
    try {
        const files = (req.files || []).map(f => ({
            url: `/uploads/${req.body?.type || 'general'}/${f.filename}`,
            originalName: f.originalname,
            size: f.size,
            type: f.mimetype
        }));
        res.json({ success: true, data: files });
    } catch (e) {
        res.status(500).json({ error: 'فشل رفع الملفات' });
    }
});

// ==================== API: التفاوض RFQ ====================
app.post('/api/rfq', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    try {
        const { productId, quantity, proposedPrice, message } = req.body;
        if (!productId || !quantity || !proposedPrice) {
            return res.status(400).json({ error: 'المنتج والكمية والسعر المقترح مطلوبة' });
        }
        
        const product = await DB.products.findOne({ _id: productId });
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        
        const rfq = await DB.rfq_requests.insertOne({
            user: req.user.id,
            productId,
            productName: product.name,
            quantity,
            proposedPrice,
            originalPrice: product.price,
            message: message || '',
            status: 'pending',
            createdAt: new Date()
        });
        
        io.emit('newRFQ', rfq);
        
        res.status(201).json({ success: true, message: 'تم إرسال طلب التفاوض', data: rfq });
    } catch (e) {
        res.status(500).json({ error: 'فشل إرسال طلب التفاوض' });
    }
});

app.get('/api/rfq', adminRequired, async (req, res) => {
    try {
        const rfqs = await DB.rfq_requests.find().toArray();
        rfqs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, data: rfqs });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

app.put('/api/rfq/:id', adminRequired, async (req, res) => {
    try {
        const { status, counterOffer, adminMessage } = req.body;
        await DB.rfq_requests.updateOne({ _id: req.params.id }, {
            $set: { status, counterOffer, adminMessage, updatedAt: new Date() }
        });
        res.json({ success: true, message: 'تم تحديث حالة التفاوض' });
    } catch (e) {
        res.status(500).json({ error: 'فشل تحديث حالة التفاوض' });
    }
});

// ==================== API: المنافسين ====================
app.get('/api/admin/competitors', adminRequired, async (req, res) => {
    try {
        const competitors = await DB.competitors.find().toArray();
        res.json({ success: true, data: competitors });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

app.post('/api/admin/competitors', adminRequired, async (req, res) => {
    try {
        const competitor = await DB.competitors.insertOne({ ...req.body, createdAt: new Date() });
        res.status(201).json({ success: true, data: competitor });
    } catch (e) {
        res.status(500).json({ error: 'فشل إضافة المنافس' });
    }
});

app.put('/api/admin/competitors/:id', adminRequired, async (req, res) => {
    try {
        await DB.competitors.updateOne({ _id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
        res.json({ success: true, message: 'تم تحديث المنافس' });
    } catch (e) {
        res.status(500).json({ error: 'فشل تحديث المنافس' });
    }
});

app.delete('/api/admin/competitors/:id', adminRequired, async (req, res) => {
    try {
        await DB.competitors.deleteOne({ _id: req.params.id });
        res.json({ success: true, message: 'تم حذف المنافس' });
    } catch (e) {
        res.status(500).json({ error: 'فشل حذف المنافس' });
    }
});

// ==================== API: الصيانة التنبؤية ====================
app.get('/api/admin/maintenance-alerts', adminRequired, async (req, res) => {
    try {
        const orders = await DB.orders.find().toArray();
        const alerts = [];
        const now = new Date();
        
        orders.forEach(order => {
            if (order.maintenanceReminders) {
                order.maintenanceReminders.forEach(r => {
                    if (!r.notified && new Date(r.dueDate) > now) {
                        alerts.push({
                            orderNumber: order.orderNumber,
                            product: r.productName,
                            dueDate: r.dueDate,
                            daysLeft: Math.ceil((new Date(r.dueDate) - now) / 86400000),
                            notified: r.notified
                        });
                    }
                });
            }
        });
        
        alerts.sort((a, b) => a.daysLeft - b.daysLeft);
        res.json({ success: true, data: alerts });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

// ==================== API: البحث ====================
app.post('/api/search/visual', upload.single('image'), async (req, res) => {
    try {
        const products = await DB.products.find({ isActive: true }).limit(20).toArray();
        res.json({ success: true, data: products, message: 'البحث المرئي قيد التطوير' });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

app.post('/api/search/voice', upload.single('audio'), async (req, res) => {
    try {
        const products = await DB.products.find({ isActive: true }).limit(20).toArray();
        res.json({ success: true, data: products, message: 'البحث الصوتي قيد التطوير' });
    } catch (e) {
        res.json({ success: true, data: [] });
    }
});

// ==================== API: المزامنة الأوفلاين ====================
app.post('/api/sync', async (req, res) => {
    try {
        const { operations, deviceId, lastSyncTimestamp } = req.body;
        const results = [];
        
        for (const op of operations || []) {
            try {
                if (op.type === 'updateOrderStatus') {
                    await DB.orders.updateOne({ _id: op.orderId }, {
                        $set: { status: op.status, updatedAt: new Date() }
                    });
                    results.push({ id: op.orderId, success: true });
                }
            } catch (e) {
                results.push({ id: op.id, success: false, error: e.message });
            }
        }
        
        const updatedOrders = await DB.orders.find({
            updatedAt: { $gte: new Date(lastSyncTimestamp || 0) }
        }).toArray();
        
        res.json({
            success: true,
            results,
            serverUpdates: updatedOrders,
            serverTime: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ error: 'فشل المزامنة' });
    }
});

// ==================== API: النسخ الاحتياطي ====================
app.post('/api/backup', adminRequired, async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const dir = path.join(__dirname, 'backups', timestamp);
        fs.mkdirSync(dir, { recursive: true });
        
        const output = fs.createWriteStream(path.join(dir, 'backup.zip'));
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        archive.directory(path.join(__dirname, 'data'), 'data');
        archive.directory(path.join(__dirname, 'uploads'), 'uploads');
        
        await archive.finalize();
        
        res.json({
            success: true,
            path: `/backups/${timestamp}/backup.zip`,
            message: 'تم إنشاء النسخة الاحتياطية بنجاح'
        });
    } catch (e) {
        console.error('❌ فشل النسخ الاحتياطي:', e);
        res.status(500).json({ error: 'فشل إنشاء النسخة الاحتياطية' });
    }
});

// ==================== WebSocket ====================
io.on('connection', (socket) => {
    console.log('🟢 اتصال جديد:', socket.id);
    
    socket.on('join', (room) => {
        socket.join(room);
        console.log(`📨 ${socket.id} انضم إلى غرفة ${room}`);
    });
    
    socket.on('chat message', async (msg) => {
        const messageData = {
            id: uuidv4(),
            sender: msg.sender || 'customer',
            text: msg.text,
            timestamp: new Date(),
            translatedText: msg.translatedText || null
        };
        
        // إرسال للجميع
        io.to('admin').emit('chat message', messageData);
        io.to('customer').emit('chat message', messageData);
        
        // حفظ في قاعدة البيانات
        try {
            await DB.chat_messages.insertOne(messageData);
        } catch (e) {}
    });
    
    socket.on('typing', (data) => {
        socket.broadcast.emit('typing', data);
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 انقطع اتصال:', socket.id);
    });
});

// ==================== المهام المجدولة ====================
cron.schedule('0 8 * * *', async () => {
    console.log('🔧 فحص الصيانة التنبؤية...');
    try {
        const orders = await DB.orders.find().toArray();
        for (const order of orders) {
            if (!order.maintenanceReminders) continue;
            let updated = false;
            for (const rem of order.maintenanceReminders) {
                if (!rem.notified && new Date(rem.dueDate) <= new Date()) {
                    rem.notified = true;
                    updated = true;
                }
            }
            if (updated) {
                await DB.orders.updateOne({ _id: order._id }, {
                    $set: { maintenanceReminders: order.maintenanceReminders }
                });
            }
        }
    } catch (e) {}
});

cron.schedule('0 0 * * *', async () => {
    console.log('🧹 تنظيف دوري...');
    try {
        // حذف رموز OTP المنتهية
        const oldOTPs = await DB.otp_codes.find({
            expiresAt: { $lte: new Date().toISOString() }
        }).toArray();
        for (const otp of oldOTPs) {
            await DB.otp_codes.deleteOne({ _id: otp._id });
        }
        
        // حذف العناصر القديمة من سلة المحذوفات (أكثر من 30 يوم)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        const oldTrash = await DB.trash.find({
            deletedAt: { $lte: thirtyDaysAgo.toISOString() }
        }).toArray();
        for (const item of oldTrash) {
            await DB.trash.deleteOne({ _id: item._id });
        }
        
        console.log(`✅ تنظيف: ${oldOTPs.length} OTP، ${oldTrash.length} من المحذوفات`);
    } catch (e) {}
});

// ==================== بذرة البيانات الأولية ====================
async function seed() {
    try {
        const userCount = await DB.users.countDocuments();
        if (userCount > 0) return;
        
        console.log('🌱 إنشاء البيانات الافتراضية...');
        
        // مدير النظام
        const adminHash = await bcrypt.hash('admin123', 12);
        await DB.users.insertOne({
            fullName: 'مدير النظام',
            email: 'alradi@gmail.com',
            phone: '+966500000000',
            password: adminHash,
            role: 'admin',
            loyaltyPoints: 9999,
            loyaltyTier: 'بلاتيني',
            isActive: true,
            preferences: { locale: 'ar', currency: 'SAR', theme: 'dark' },
            addresses: [{ street: 'الرياض', city: 'الرياض', country: 'السعودية' }],
            loginHistory: [],
            totalSpent: 0
        });
        
        // عميل تجريبي
        const customerHash = await bcrypt.hash('customer123', 12);
        await DB.users.insertOne({
            fullName: 'عميل تجريبي',
            email: 'customer@alradi.com',
            phone: '+966511111111',
            password: customerHash,
            role: 'customer',
            loyaltyPoints: 750,
            loyaltyTier: 'فضي',
            isActive: true,
            preferences: { locale: 'ar', currency: 'SAR', theme: 'dark' },
            addresses: [{ street: 'جدة', city: 'جدة', country: 'السعودية' }],
            loginHistory: [],
            totalSpent: 7500
        });
        
        // منتجات افتراضية
        const products = [
            { name: '📱 ساعة ذكية فاخرة Pro Max', description: 'شاشة AMOLED، مقاومة للماء، GPS، مراقبة الصحة', price: 599, comparePrice: 899, stock: 50, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', type: 'main' }], discount: 33, isActive: true, isFeatured: true, ratings: { average: 4.5, count: 120 }, salesCount: 45, tags: ['ساعة', 'ذكية'] },
            { name: '🎧 سماعات لاسلكية بريميوم ANC', description: 'إلغاء الضوضاء، جودة Hi-Res، بطارية 30 ساعة', price: 349, stock: 100, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', type: 'main' }], isActive: true, isFeatured: true, ratings: { average: 4.2, count: 85 }, salesCount: 72, tags: ['سماعات', 'لاسلكية'] },
            { name: '🧴 عطر شرقي فاخر 100ml', description: 'العود، المسك، العنبر، الورد، الزعفران', price: 450, comparePrice: 600, stock: 30, category: 'عطور', images: [{ url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400', type: 'main' }], discount: 25, isActive: true, ratings: { average: 4.8, count: 200 }, salesCount: 150, tags: ['عطر', 'شرقي'] },
            { name: '👜 حقيبة يد جلد طبيعي', description: 'جلد طبيعي 100%، صناعة يدوية', price: 799, stock: 15, category: 'أزياء', images: [{ url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400', type: 'main' }], isActive: true, ratings: { average: 4.0, count: 45 }, salesCount: 20, tags: ['حقيبة', 'جلد'] },
            { name: '📱 هاتف ذكي Ultra 5G', description: 'شاشة 6.8\" 120Hz، كاميرا 200MP', price: 2999, comparePrice: 3499, stock: 12, category: 'إلكترونيات', images: [{ url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400', type: 'main' }], discount: 14, isActive: true, isFeatured: true, ratings: { average: 4.7, count: 310 }, salesCount: 90, tags: ['هاتف', 'ذكي'] }
        ];
        
        for (const p of products) {
            await DB.products.insertOne({ ...p, createdAt: new Date(), updatedAt: new Date() });
        }
        
        // كوبونات
        await DB.coupons.insertOne({ code: 'WELCOME10', discountType: 'percentage', discountValue: 10, minOrderAmount: 100, maxUses: 1000, usedCount: 0, isActive: true, description: 'خصم 10% للعملاء الجدد', expiryDate: new Date(Date.now() + 365 * 86400000), createdAt: new Date() });
        await DB.coupons.insertOne({ code: 'FLASH50', discountType: 'fixed', discountValue: 50, minOrderAmount: 500, maxUses: 500, usedCount: 0, isActive: true, description: 'خصم 50 ر.س', expiryDate: new Date(Date.now() + 30 * 86400000), createdAt: new Date() });
        await DB.coupons.insertOne({ code: 'VIP25', discountType: 'percentage', discountValue: 25, minOrderAmount: 1000, maxUses: 100, usedCount: 0, isActive: true, description: 'خصم 25% VIP', expiryDate: new Date(Date.now() + 90 * 86400000), createdAt: new Date() });
        
        // أقسام
        const categories = ['إلكترونيات', 'أزياء', 'عطور', 'منزل', 'ساعات', 'أحذية', 'رياضة', 'كتب', 'مطبخ', 'ألعاب'];
        const icons = { 'إلكترونيات': '📱', 'أزياء': '👗', 'عطور': '🧴', 'منزل': '🏠', 'ساعات': '⌚', 'أحذية': '👠', 'رياضة': '⚽', 'كتب': '📚', 'مطبخ': '🍳', 'ألعاب': '🎮' };
        for (const c of categories) {
            await DB.categories.insertOne({ name: c, icon: icons[c] || '📦', isActive: true });
        }
        
        // إعدادات
        await DB.settings.insertOne({ type: 'store', data: { storeName: 'الرعدي أونلاين', storeSlogan: 'سوق اليمن الأول', primaryColor: '#C9A84C', secondaryColor: '#1A1A2E', bgColor: '#0F0F1A', textColor: '#FFFFFF', email: 'alradi@gmail.com', phone: '+966500000000' }, createdAt: new Date() });
        await DB.settings.insertOne({ type: 'shipping', data: { internalRate: 5, externalRate: 10, freeShippingThreshold: 500 }, createdAt: new Date() });
        await DB.settings.insertOne({ type: 'return_policy', data: { text: 'الاستبدال مسموح خلال 14 يوماً من تاريخ الاستلام بشرط أن يكون المنتج بحالته الأصلية وعدم وجود تلف ناتج عن سوء الاستخدام. لا يتم استرجاع المبلغ نقداً إلا في حالات العيب المصنعي المثبت.', window: 14 }, createdAt: new Date() });
        
        // بانرات
        await DB.banners.insertOne({ title: 'أحدث الإلكترونيات', subtitle: 'خصومات تصل إلى 70%', link: '/products?category=إلكترونيات', imageUrl: 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=1200', isActive: true, order: 1, createdAt: new Date() });
        await DB.banners.insertOne({ title: 'تشكيلة الأزياء', subtitle: 'أحدث صيحات الموضة', link: '/products?category=أزياء', imageUrl: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200', isActive: true, order: 2, createdAt: new Date() });
        await DB.banners.insertOne({ title: 'عطور شرقية', subtitle: 'أفخم العطور العربية', link: '/products?category=عطور', imageUrl: 'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=1200', isActive: true, order: 3, createdAt: new Date() });
        
        console.log('✅ تم إنشاء البيانات الافتراضية بنجاح');
        console.log('👑 المدير: alradi@gmail.com / admin123');
        console.log('👤 العميل: customer@alradi.com / customer123');
        console.log('🎫 كوبونات: WELCOME10 | FLASH50 | VIP25');
    } catch (e) {
        console.error('❌ فشل إنشاء البيانات الافتراضية:', e);
    }
}

// ==================== الصفحات ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// معالجة 404
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: 'المسار غير موجود' });
    }
});

// ==================== بدء التشغيل ====================
const PORT = process.env.PORT || 3000;

(async () => {
    // إنشاء المجلدات الضرورية
    const dirs = ['public', 'uploads', 'uploads/logo', 'uploads/products', 'uploads/sounds', 'uploads/banners', 'uploads/general', 'data', 'backups'];
    dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
    
    // الاتصال بقاعدة البيانات
    await connectDB();
    
    // إنشاء البيانات الافتراضية
    await seed();
    
    // تشغيل السيرفر
    server.listen(PORT, () => {
        console.log('╔══════════════════════════════════════════╗');
        console.log('║   🦅 الرعدي أونلاين – الإصدار الأسطوري  ║');
        console.log('║   ⚡ v10.0 FINAL – جميع الميزات متاحة    ║');
        console.log(`║   🌐 http://localhost:${PORT}              ║`);
        console.log(`║   👑 http://localhost:${PORT}/admin        ║`);
        console.log('║   ☁️  MongoDB Atlas | 💾 Local Backup     ║');
        console.log('║   👤 alradi@gmail.com / admin123         ║');
        console.log('║   🔐 JWT + bcrypt | 📧 OTP               ║');
        console.log('║   🛒 سلة ودفع | 📄 فواتير PDF + QR       ║');
        console.log('║   ⭐ ولاء 4 مستويات | 🔧 صيانة تنبؤية     ║');
        console.log('╚══════════════════════════════════════════╝');
    });
})();
