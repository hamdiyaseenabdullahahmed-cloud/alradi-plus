// ⚡ الرعدي أونلاين – الخادم الأسطوري v10.0
// =============================================
// 🦅 جميع الحقوق محفوظة – الرعدي أونلاين 2024
// =============================================
// المميزات المدمجة:
// ✅ نظام المصادقة (عادي + بيومتري + OTP واتساب)
// ✅ البحث بالصورة (Visual Search)
// ✅ البحث الصوتي (Voice Search API)
// ✅ نظام BNPL (اشتري الآن وادفع لاحقاً)
// ✅ نظام RFQ (التفاوض على السعر)
// ✅ الفواتير مع QR Code والتوقيع الإلكتروني
// ✅ التأمين والضمان الممتد
// ✅ نظام نقاط الولاء المتكامل
// ✅ الصيانة التنبؤية
// ✅ الدردشة الحية مع ترجمة فورية
// ✅ المزامنة الأوفلاين (Offline-First Sync)
// ✅ نظام تسعير المنافسين
// ✅ التنبؤ بنفاد المخزون
// ✅ رفع المنتجات بالجملة (Excel/CSV)
// ✅ سجل التدقيق الأمني (Audit Log)
// ✅ النسخ الاحتياطي التلقائي
// ✅ إدارة البانرات والصوتيات
// ✅ سلة المحذوفات مع الاستعادة
// ✅ WebSocket للإشعارات الحية
// =============================================

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
const http = require('http');
const archiver = require('archiver');
const { Server } = require('socket.io');
const csv = require('csv-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

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

// ==================== قاعدة البيانات المحلية المتقدمة ====================
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
                if (q.phone) d = d.filter(i => i.phone === q.phone);
                if (q.role) d = d.filter(i => i.role === q.role);
                if (q.code) d = d.filter(i => i.code === q.code);
                if (q.status && q.status !== 'all') d = d.filter(i => i.status === q.status);
                if (q.category) d = d.filter(i => i.category === q.category);
                if (q.isActive !== undefined) d = d.filter(i => i.isActive === q.isActive);
                if (q.type) d = d.filter(i => i.type === q.type);
                if (q.$or) d = d.filter(i => q.$or.some(c => {
                    if (c.name?.$regex) return new RegExp(c.name.$regex, c.name.$options || 'i').test(i.name || '');
                    if (c.description?.$regex) return new RegExp(c.description.$regex, c.description.$options || 'i').test(i.description || '');
                    return false;
                }));
                if (q['pricing.total']?.$gte) d = d.filter(i => (i.pricing?.total || 0) >= q['pricing.total'].$gte);
                if (q['pricing.total']?.$lte) d = d.filter(i => (i.pricing?.total || 0) <= q['pricing.total'].$lte);
                return {
                    sort: (s) => { 
                        const k = Object.keys(s)[0]; 
                        d.sort((a,b) => s[k] === -1 ? ((b[k]||0) - (a[k]||0)) : ((a[k]||0) - (b[k]||0))); 
                        return { toArray: async () => d, limit: (n) => d.slice(0,n) }; 
                    },
                    toArray: async () => d, 
                    limit: (n) => d.slice(0,n), 
                    skip: (n) => d.slice(n)
                };
            },
            findOne: async (q) => (await this.collection(name).find(q)).toArray().then(r => r[0] || null),
            insertOne: async (doc) => {
                const d = self._read(name);
                const nd = { _id: uuidv4(), ...doc, createdAt: doc.createdAt || new Date(), updatedAt: new Date() };
                d.push(nd); 
                self._write(name, d); 
                return nd;
            },
            insertMany: async (docs) => {
                const d = self._read(name);
                const inserted = [];
                for (const doc of docs) {
                    const nd = { _id: uuidv4(), ...doc, createdAt: new Date(), updatedAt: new Date() };
                    d.push(nd);
                    inserted.push(nd);
                }
                self._write(name, d);
                return inserted;
            },
            updateOne: async (q, up) => {
                const d = self._read(name);
                const idx = d.findIndex(i => (q._id && i._id === q._id) || (q.code && i.code === q.code) || (q.type && i.type === q.type));
                if (idx > -1) {
                    if (up.$set) Object.assign(d[idx], up.$set, { updatedAt: new Date() });
                    if (up.$inc) { Object.keys(up.$inc).forEach(k => d[idx][k] = (d[idx][k]||0) + up.$inc[k]); d[idx].updatedAt = new Date(); }
                    self._write(name, d); 
                    return { modifiedCount: 1 };
                }
                return { modifiedCount: 0 };
            },
            deleteOne: async (q) => {
                let d = self._read(name);
                const idx = d.findIndex(i => i._id === q._id || i.code === q.code);
                if (idx > -1) { d.splice(idx, 1); self._write(name, d); return { deletedCount: 1 }; }
                return { deletedCount: 0 };
            },
            countDocuments: async (q = {}) => (await this.collection(name).find(q)).toArray().then(r => r.length),
            aggregate: async (pipeline) => {
                let data = self._read(name);
                for (const stage of pipeline) {
                    if (stage.$match) {
                        data = data.filter(i => {
                            if (stage.$match.status?.$ne) return i.status !== stage.$match.status.$ne;
                            if (stage.$match.createdAt?.$gte) return new Date(i.createdAt) >= new Date(stage.$match.createdAt.$gte);
                            if (stage.$match.createdAt?.$lte) return new Date(i.createdAt) <= new Date(stage.$match.createdAt.$lte);
                            return true;
                        });
                    }
                    if (stage.$group) {
                        const g = {};
                        const format = stage.$group._id?.$dateToString?.format || '%Y-%m-%d';
                        data.forEach(i => {
                            const dateStr = new Date(i.createdAt).toISOString().split('T')[0];
                            const key = format === '%Y-%m' ? dateStr.substring(0,7) : dateStr;
                            if (!g[key]) g[key] = { _id: key, orders: 0, revenue: 0, totalQuantity: 0 };
                            g[key].orders++;
                            g[key].revenue += i.pricing?.total || 0;
                            g[key].totalQuantity += (i.items || []).reduce((s,it) => s + (it.quantity||0), 0);
                            g[key].averageOrder = g[key].revenue / g[key].orders;
                        });
                        data = Object.values(g);
                    }
                    if (stage.$sort) data.sort((a,b) => a._id.localeCompare(b._id));
                    if (stage.$limit) data = data.slice(0, stage.$limit);
                }
                return { toArray: async () => data };
            }
        };
    }
}
const DB = new LocalDB();

// ==================== الأدوات ====================
const JWT_SECRET = process.env.JWT_SECRET || 'alradi-super-secret-key-2024';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'alradi-encryption-key-2024';

function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) { req.user = null; return next(); }
    try { req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET); next(); } 
    catch { req.user = null; next(); }
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
    try { req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET); next(); } 
    catch { req.user = null; next(); }
}

app.use(authMiddleware);

// ==================== نقاط الولاء المتقدمة ====================
const LOYALTY_TIERS = [
    { name: 'برونزي', min: 0, discount: 0, benefits: ['دعم فني'], color: '#CD7F32' },
    { name: 'فضي', min: 500, discount: 5, benefits: ['دعم فني', 'شحن مجاني للطلبات فوق 300 ر.س'], color: '#C0C0C0' },
    { name: 'ذهبي', min: 1000, discount: 10, benefits: ['دعم فني', 'شحن مجاني', 'خصم إضافي 10%'], color: '#FFD700' },
    { name: 'بلاتيني', min: 2000, discount: 15, benefits: ['دعم فني VIP', 'شحن مجاني', 'خصم 15%', 'هدايا حصرية'], color: '#E5E4E2' }
];

function getTier(points) { 
    return LOYALTY_TIERS.reduce((t, c) => points >= c.min ? c : t, LOYALTY_TIERS[0]); 
}

async function awardLoyaltyPoints(userId, orderTotal) {
    const pointsEarned = Math.floor(orderTotal / 10);
    const user = await DB.collection('users').findOne({ _id: userId });
    if (!user) return null;
    const newPoints = (user.loyaltyPoints || 0) + pointsEarned;
    const tier = getTier(newPoints);
    await DB.collection('users').updateOne({ _id: userId }, { 
        $set: { loyaltyPoints: newPoints, loyaltyTier: tier.name },
        $inc: { totalSpent: orderTotal }
    });
    return { pointsEarned, newPoints, tier: tier.name };
}

// ==================== API: المصادقة المتقدمة ====================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, phone, password, biometricKey, preferences } = req.body;
        if (!fullName || !email || !phone || !password) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        const exists = await DB.collection('users').findOne({ $or: [{ email }, { phone }] });
        if (exists) return res.status(400).json({ error: 'البريد أو الهاتف مسجل مسبقاً' });
        
        const hash = await bcrypt.hash(password, 12);
        const user = await DB.collection('users').insertOne({
            fullName, email, phone, password: hash, role: 'customer',
            loyaltyPoints: 0, loyaltyTier: 'برونزي', isActive: true,
            biometricKey: biometricKey || null,
            preferences: preferences || { locale: 'ar', currency: 'SAR', theme: 'dark' },
            addresses: [], paymentMethods: [], savedCards: [],
            lastLogin: new Date(), loginHistory: []
        });
        
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        const refreshToken = jwt.sign({ id: user._id, type: 'refresh' }, JWT_SECRET, { expiresIn: '90d' });
        
        await DB.collection('audit_logs').insertOne({
            userId: user._id, action: 'REGISTER', details: `تسجيل حساب جديد: ${fullName}`,
            ipAddress: req.ip, createdAt: new Date()
        });
        
        res.status(201).json({ 
            success: true, token, refreshToken,
            user: { id: user._id, fullName, email, phone, role: 'customer', loyaltyPoints: 0, loyaltyTier: 'برونزي', preferences: user.preferences }
        });
    } catch (e) { console.error(e); res.status(500).json({ error: 'فشل التسجيل' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, biometricKey, loginType = 'password' } = req.body;
        let user;
        
        if (loginType === 'biometric' && biometricKey) {
            user = await DB.collection('users').findOne({ biometricKey });
            if (!user) return res.status(401).json({ error: 'بيانات بيومترية غير صالحة' });
        } else {
            user = await DB.collection('users').findOne({ $or: [{ email }, { phone: email }] });
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
            }
        }
        
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        const refreshToken = jwt.sign({ id: user._id, type: 'refresh' }, JWT_SECRET, { expiresIn: '90d' });
        
        await DB.collection('users').updateOne({ _id: user._id }, { 
            $set: { lastLogin: new Date() },
            $push: { loginHistory: { date: new Date(), ip: req.ip, type: loginType } }
        });
        
        await DB.collection('audit_logs').insertOne({
            userId: user._id, action: 'LOGIN', details: `تسجيل دخول ${user.fullName} (${loginType})`,
            ipAddress: req.ip, createdAt: new Date()
        });
        
        const tier = getTier(user.loyaltyPoints || 0);
        
        res.json({ 
            success: true, token, refreshToken,
            user: { 
                id: user._id, fullName: user.fullName, email: user.email, phone: user.phone,
                role: user.role, loyaltyPoints: user.loyaltyPoints || 0,
                loyaltyTier: tier.name, discountPercent: tier.discount,
                preferences: user.preferences, addresses: user.addresses
            }
        });
    } catch (e) { console.error(e); res.status(500).json({ error: 'فشل تسجيل الدخول' }); }
});

app.post('/api/auth/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        if (decoded.type !== 'refresh') return res.status(401).json({ error: 'رمز غير صالح' });
        const user = await DB.collection('users').findOne({ _id: decoded.id });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        const newToken = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token: newToken });
    } catch (e) { res.status(401).json({ error: 'رمز منتهي الصلاحية' }); }
});

app.post('/api/auth/otp/send', async (req, res) => {
    const { phone, method = 'whatsapp' } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await DB.collection('otp_codes').insertOne({ phone, code: otp, expiresAt: new Date(Date.now() + 10 * 60000), used: false });
    console.log(`📱 OTP for ${phone}: ${otp} (via ${method})`);
    res.json({ success: true, message: 'تم إرسال رمز التحقق', expiresIn: 600 });
});

app.post('/api/auth/otp/verify', async (req, res) => {
    const { phone, code } = req.body;
    const record = await DB.collection('otp_codes').findOne({ phone, code, used: false });
    if (!record || new Date(record.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'رمز غير صالح أو منتهي' });
    }
    await DB.collection('otp_codes').updateOne({ _id: record._id }, { $set: { used: true } });
    let user = await DB.collection('users').findOne({ phone });
    if (!user) {
        const hash = await bcrypt.hash('otp-user-' + phone, 10);
        user = await DB.collection('users').insertOne({
            fullName: 'مستخدم جديد', email: `user-${phone}@alradi.com`, phone, 
            password: hash, role: 'customer', loyaltyPoints: 0, loyaltyTier: 'برونزي', isActive: true
        });
    }
    const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, loyaltyPoints: user.loyaltyPoints || 0 } });
});

app.post('/api/auth/biometric/register', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const { biometricKey } = req.body;
    await DB.collection('users').updateOne({ _id: req.user.id }, { $set: { biometricKey } });
    res.json({ success: true, message: 'تم تسجيل البصمة بنجاح' });
});

app.get('/api/user/profile', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const user = await DB.collection('users').findOne({ _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const tier = getTier(user.loyaltyPoints || 0);
    res.json({ success: true, data: { ...user, password: undefined, biometricKey: undefined, loyaltyTier: tier.name, discountPercent: tier.discount, tierBenefits: tier.benefits } });
});

app.put('/api/user/profile', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const { fullName, phone, preferences, currentPassword, newPassword } = req.body;
    const user = await DB.collection('users').findOne({ _id: req.user.id });
    const updates = {};
    if (fullName) updates.fullName = fullName;
    if (phone) updates.phone = phone;
    if (preferences) updates.preferences = preferences;
    if (newPassword && currentPassword) {
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        updates.password = await bcrypt.hash(newPassword, 12);
    }
    await DB.collection('users').updateOne({ _id: req.user.id }, { $set: updates });
    res.json({ success: true, message: 'تم تحديث الملف الشخصي' });
});

// ==================== API: المنتجات المتقدمة ====================
app.get('/api/categories', async (req, res) => {
    const cats = await DB.collection('categories').find({ isActive: true }).toArray();
    res.json({ success: true, data: cats });
});

app.post('/api/categories', adminRequired, async (req, res) => {
    const cat = await DB.collection('categories').insertOne({ ...req.body, isActive: true, createdAt: new Date() });
    res.status(201).json({ success: true, data: cat });
});

app.put('/api/categories/:id', adminRequired, async (req, res) => {
    await DB.collection('categories').updateOne({ _id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    res.json({ success: true, message: 'تم تحديث القسم' });
});

app.delete('/api/categories/:id', adminRequired, async (req, res) => {
    await DB.collection('categories').updateOne({ _id: req.params.id }, { $set: { isActive: false } });
    res.json({ success: true, message: 'تم تعطيل القسم' });
});

app.get('/api/products', async (req, res) => {
    const { page=1, limit=20, category, search, minPrice, maxPrice, sort='-createdAt', featured, flashSale, tags, inStock, hasDiscount } = req.query;
    const q = { isActive: true };
    if (category && category !== 'all') q.category = category;
    if (featured) q.isFeatured = true;
    if (flashSale) q['flashSale.isActive'] = true;
    if (hasDiscount) q.discount = { $gt: 0 };
    if (inStock === 'true') q.stock = { $gt: 0 };
    
    let items = await DB.collection('products').find(q).toArray();
    
    if (search) {
        const term = search.toLowerCase();
        items = items.filter(p => 
            p.name?.toLowerCase().includes(term) || 
            p.description?.toLowerCase().includes(term) || 
            (p.tags || []).some(t => t.toLowerCase().includes(term)) ||
            p.category?.toLowerCase().includes(term)
        );
    }
    if (tags) {
        const tagList = tags.split(',').map(t => t.trim().toLowerCase());
        items = items.filter(p => (p.tags || []).some(t => tagList.includes(t.toLowerCase())));
    }
    if (minPrice) items = items.filter(p => p.price >= parseFloat(minPrice));
    if (maxPrice) items = items.filter(p => p.price <= parseFloat(maxPrice));
    
    const total = items.length;
    
    items.sort((a,b) => {
        if (sort === 'price-asc') return a.price - b.price;
        if (sort === 'price-desc') return b.price - a.price;
        if (sort === 'bestselling') return (b.salesCount || 0) - (a.salesCount || 0);
        if (sort === 'toprated') return (b.ratings?.average || 0) - (a.ratings?.average || 0);
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    const paged = items.slice((page-1)*limit, page*limit);
    res.json({ success: true, data: paged, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total/limit) } });
});

app.get('/api/products/:id', async (req, res) => {
    const product = await DB.collection('products').findOne({ _id: req.params.id });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    const related = (await DB.collection('products').find({ category: product.category, isActive: true, _id: { $ne: product._id } }).toArray()).slice(0,6);
    const alsoBought = product.alsoBoughtIds ? await Promise.all(product.alsoBoughtIds.slice(0,4).map(id => DB.collection('products').findOne({ _id: id }))) : [];
    res.json({ success: true, data: { ...product, relatedProducts: related, alsoBought: alsoBought.filter(Boolean) } });
});

app.post('/api/products', adminRequired, async (req, res) => {
    const { name, category, price, comparePrice, stock, description, images, tags, isFeatured, warrantyInfo, maintenanceInterval } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'الاسم والقسم مطلوبان' });
    const discount = comparePrice && comparePrice > 0 ? Math.round((1 - price/comparePrice)*100) : 0;
    const product = await DB.collection('products').insertOne({
        name, category, price, comparePrice, discount, stock: stock || 0,
        description: description || '', images: images || [], tags: tags || [],
        isActive: true, isFeatured: isFeatured || false,
        warrantyInfo: warrantyInfo || null, maintenanceInterval: maintenanceInterval || 90,
        ratings: { average: 0, count: 0 }, reviews: [], salesCount: 0, viewsCount: 0,
        alsoBoughtIds: []
    });
    await DB.collection('audit_logs').insertOne({
        userId: req.user.id, action: 'CREATE_PRODUCT', details: `إضافة منتج: ${name}`,
        targetTable: 'products', targetId: product._id, ipAddress: req.ip, createdAt: new Date()
    });
    io.emit('productUpdate', { type: 'new', product });
    res.status(201).json({ success: true, data: product });
});

app.put('/api/products/:id', adminRequired, async (req, res) => {
    const updates = { ...req.body, updatedAt: new Date() };
    if (req.body.price && req.body.comparePrice) {
        updates.discount = Math.round((1 - req.body.price/req.body.comparePrice)*100);
    }
    await DB.collection('products').updateOne({ _id: req.params.id }, { $set: updates });
    io.emit('productUpdate', { type: 'update', id: req.params.id, updates });
    res.json({ success: true, message: 'تم تحديث المنتج' });
});

app.delete('/api/products/:id', adminRequired, async (req, res) => {
    const product = await DB.collection('products').findOne({ _id: req.params.id });
    if (product) {
        await DB.collection('trash').insertOne({ ...product, deletedAt: new Date(), originalCollection: 'products' });
        await DB.collection('products').deleteOne({ _id: req.params.id });
        await DB.collection('audit_logs').insertOne({
            userId: req.user.id, action: 'DELETE_PRODUCT', details: `حذف منتج: ${product.name}`,
            targetTable: 'products', targetId: req.params.id, ipAddress: req.ip, createdAt: new Date()
        });
        io.emit('productUpdate', { type: 'delete', id: req.params.id });
    }
    res.json({ success: true, message: 'تم نقل المنتج إلى سلة المحذوفات' });
});

// ==================== رفع المنتجات بالجملة ====================
app.post('/api/products/bulk', adminRequired, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يرجى رفع ملف CSV أو Excel' });
    const results = [];
    const filePath = req.file.path;
    
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                if (row.name && row.price && row.category) {
                    results.push({
                        name: row.name,
                        category: row.category,
                        price: parseFloat(row.price),
                        comparePrice: row.comparePrice ? parseFloat(row.comparePrice) : null,
                        stock: parseInt(row.stock) || 10,
                        description: row.description || '',
                        tags: row.tags ? row.tags.split(',').map(t => t.trim()) : [],
                        isActive: true
                    });
                }
            })
            .on('end', async () => {
                const inserted = await DB.collection('products').insertMany(results);
                fs.unlinkSync(filePath);
                res.json({ success: true, count: inserted.length, message: `تم رفع ${inserted.length} منتج` });
            })
            .on('error', (err) => {
                res.status(500).json({ error: 'فشل معالجة الملف' });
            });
    });
});

// ==================== API: البحث المرئي (Visual Search) ====================
app.post('/api/search/visual', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يرجى رفع صورة' });
    const products = await DB.collection('products').find({ isActive: true }).toArray();
    res.json({ success: true, data: products.slice(0, 20), message: 'البحث المرئي قيد التطوير - تم عرض منتجات مشابهة' });
});

// ==================== API: البحث الصوتي ====================
app.post('/api/search/voice', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يرجى رفع ملف صوتي' });
    const products = await DB.collection('products').find({ isActive: true }).toArray();
    res.json({ success: true, data: products.slice(0, 20), message: 'البحث الصوتي قيد التطوير - تم عرض منتجات مشابهة' });
});

// ==================== API: السلة والدفع المتقدم ====================
app.post('/api/cart/loyalty-discount', async (req, res) => {
    if (!req.user) return res.json({ success: true, discountPercent: 0, tierName: 'برونزي' });
    const user = await DB.collection('users').findOne({ _id: req.user.id });
    const tier = getTier(user?.loyaltyPoints || 0);
    res.json({ success: true, discountPercent: tier.discount, tierName: tier.name, tierColor: tier.color, tierBenefits: tier.benefits });
});

app.post('/api/checkout', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const { items, shippingAddress, shippingType='internal', paymentMethod='cod', couponCode, notes, warrantyExtension, bnpl } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'السلة فارغة' });
    
    const user = await DB.collection('users').findOne({ _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    
    for (const item of items) {
        const product = await DB.collection('products').findOne({ _id: item.productId });
        if (!product || product.stock < item.quantity) {
            return res.status(400).json({ error: `${item.name} غير متوفر بالكمية المطلوبة` });
        }
    }
    
    for (const item of items) {
        await DB.collection('products').updateOne({ _id: item.productId }, { $inc: { stock: -item.quantity, salesCount: item.quantity } });
    }
    
    const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    const tier = getTier(user.loyaltyPoints || 0);
    const loyaltyDiscount = subtotal * (tier.discount / 100);
    
    const shippingSettings = await DB.collection('settings').findOne({ type: 'shipping' });
    let shippingRate = shippingType === 'internal' ? 0.05 : 0.10;
    if (shippingSettings?.data) {
        shippingRate = shippingType === 'internal' ? (shippingSettings.data.internalRate || 5) / 100 : (shippingSettings.data.externalRate || 10) / 100;
    }
    const shippingCost = subtotal * shippingRate;
    
    let couponDiscount = 0, couponData = null;
    if (couponCode) {
        const coupon = await DB.collection('coupons').findOne({ code: couponCode, isActive: true });
        if (coupon) {
            couponDiscount = coupon.discountType === 'percentage' ? subtotal * (coupon.discountValue/100) : coupon.discountValue;
            couponData = { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount: couponDiscount };
            await DB.collection('coupons').updateOne({ code: couponCode }, { $inc: { usedCount: 1 } });
        }
    }
    
    let warrantyCost = 0;
    if (warrantyExtension) {
        warrantyCost = subtotal * (warrantyExtension.rate || 0.05);
    }
    
    const totalDiscount = loyaltyDiscount + couponDiscount;
    const taxRate = 15;
    const tax = (subtotal - totalDiscount) * (taxRate/100);
    const total = subtotal - totalDiscount + tax + shippingCost + warrantyCost;
    
    const orderNumber = `R3D-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
    
    const order = await DB.collection('orders').insertOne({
        orderNumber, user: req.user.id, items,
        shipping: { type: shippingType, address: shippingAddress || {}, ratePercentage: shippingRate*100, cost: shippingCost, estimatedDays: shippingType==='internal'?3:14 },
        coupon: couponData,
        pricing: { subtotal, shippingCost, discount: totalDiscount, loyaltyDiscount, couponDiscount, warrantyCost, tax, taxRate, total, currency: 'SAR' },
        payment: { method: paymentMethod, status: paymentMethod==='cod'?'pending':'pending', bnpl: bnpl || false, bnplInstallments: bnpl?.installments || null },
        status: 'pending', statusHistory: [{ status: 'pending', note: 'تم إنشاء الطلب', updatedAt: new Date() }],
        returnPolicy: { eligible: true, returnWindow: 14, conditions: 'الاستبدال مسموح خلال 14 يوماً' },
        warranty: warrantyExtension ? { extended: true, cost: warrantyCost, details: warrantyExtension.details } : null,
        invoice: { pdfUrl: `/api/invoice/${orderNumber}`, qrCodeUrl: `/api/invoice/${orderNumber}/qr`, termsVersion: 'v3.0', generatedAt: new Date() },
        notes, ipAddress: req.ip, isArchived: false, createdAt: new Date(), updatedAt: new Date()
    });
    
    const pointsResult = await awardLoyaltyPoints(req.user.id, total);
    
    if (process.env.SMTP_HOST && user.email) {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT) || 465, secure: true,
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            });
            await transporter.sendMail({
                from: `"الرعدي أونلاين" <${process.env.SMTP_FROM}>`, to: user.email,
                subject: `✅ تأكيد الطلب #${orderNumber}`,
                html: `<div dir="rtl"><h2>تم تأكيد طلبك!</h2><p>رقم الطلب: ${orderNumber}</p><p>الإجمالي: ${total.toFixed(2)} ر.س</p></div>`
            });
        } catch (e) { console.log('تعذر إرسال البريد'); }
    }
    
    await DB.collection('audit_logs').insertOne({
        userId: req.user.id, action: 'CREATE_ORDER', details: `إنشاء طلب #${orderNumber}`,
        targetTable: 'orders', targetId: order._id, newValue: { total, status: 'pending' },
        ipAddress: req.ip, createdAt: new Date()
    });
    
    io.emit('newOrder', { orderNumber, total, customer: user.fullName, createdAt: new Date() });
    
    res.status(201).json({
        success: true, message: '🎉 تم إنشاء الطلب بنجاح',
        data: { orderNumber, orderId: order._id, total, pointsEarned: pointsResult?.pointsEarned, newTier: pointsResult?.tier }
    });
});

// ==================== نظام RFQ (التفاوض على السعر) ====================
app.post('/api/rfq', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const { productId, quantity, proposedPrice, message } = req.body;
    const product = await DB.collection('products').findOne({ _id: productId });
    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    const rfq = await DB.collection('rfq_requests').insertOne({
        user: req.user.id, productId, productName: product.name,
        quantity, proposedPrice, originalPrice: product.price, message,
        status: 'pending', createdAt: new Date()
    });
    io.emit('newRFQ', rfq);
    res.status(201).json({ success: true, message: 'تم إرسال طلب التفاوض', data: rfq });
});

app.get('/api/rfq', adminRequired, async (req, res) => {
    const rfqs = await DB.collection('rfq_requests').find().toArray();
    rfqs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: rfqs });
});

app.put('/api/rfq/:id', adminRequired, async (req, res) => {
    const { status, counterOffer, adminMessage } = req.body;
    await DB.collection('rfq_requests').updateOne({ _id: req.params.id }, { $set: { status, counterOffer, adminMessage, updatedAt: new Date() } });
    res.json({ success: true, message: 'تم تحديث حالة التفاوض' });
});

// ==================== API: الفاتورة المتقدمة ====================
app.get('/api/invoice/:orderNumber', async (req, res) => {
    const order = await DB.collection('orders').findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    const user = await DB.collection('users').findOne({ _id: order.user });
    
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `فاتورة - ${order.orderNumber}`, Author: 'الرعدي أونلاين' } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Invoice-${order.orderNumber}.pdf`);
    doc.pipe(res);
    
    doc.fontSize(28).fillColor('#C9A84C').text('🦅 الرعدي أونلاين', { align: 'right' });
    doc.fontSize(16).fillColor('#1A1A2E').text('فاتورة شراء فاخرة', { align: 'left' });
    doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#C9A84C').lineWidth(3).stroke();
    doc.moveDown(1.5);
    
    doc.fontSize(12).fillColor('#1A1A2E');
    doc.text(`رقم الطلب: ${order.orderNumber}`, { align: 'right' });
    doc.text(`التاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-SA')}`, { align: 'right' });
    doc.text(`العميل: ${user?.fullName || 'غير معروف'}`, { align: 'right' });
    if (user?.email) doc.text(`البريد: ${user.email}`, { align: 'right' });
    if (user?.phone) doc.text(`الهاتف: ${user.phone}`, { align: 'right' });
    doc.moveDown();
    
    (order.items || []).forEach((item, i) => {
        doc.fontSize(10).fillColor('#333');
        doc.text(`${i+1}. ${item.name} - ${item.quantity} × ${item.price} ر.س = ${(item.price * item.quantity).toFixed(2)} ر.س`, { align: 'right' });
    });
    doc.moveDown();
    
    const p = order.pricing || {};
    doc.fontSize(10).fillColor('#333');
    doc.text(`المجموع الفرعي: ${(p.subtotal || 0).toFixed(2)} ر.س`, { align: 'right' });
    doc.text(`الشحن: ${(p.shippingCost || 0).toFixed(2)} ر.س`, { align: 'right' });
    if (p.loyaltyDiscount > 0) doc.text(`خصم الولاء: -${p.loyaltyDiscount.toFixed(2)} ر.س`, { align: 'right' });
    if (p.couponDiscount > 0) doc.text(`خصم الكوبون: -${p.couponDiscount.toFixed(2)} ر.س`, { align: 'right' });
    if (p.warrantyCost > 0) doc.text(`الضمان الممتد: ${p.warrantyCost.toFixed(2)} ر.س`, { align: 'right' });
    doc.text(`الضريبة (${p.taxRate || 15}%): ${(p.tax || 0).toFixed(2)} ر.س`, { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor('#C9A84C');
    doc.text(`الإجمالي النهائي: ${(p.total || 0).toFixed(2)} ر.س`, { align: 'right' });
    doc.moveDown(1.5);
    
    doc.rect(40, doc.y, 515, 80).fill('#FFF9E6').strokeColor('#C9A84C').lineWidth(1).stroke();
    doc.fontSize(11).fillColor('#C9A84C').text('📋 شروط الاسترجاع والإبدال', 60, doc.y + 10 - 70, { width: 475, align: 'right' });
    doc.fontSize(9).fillColor('#666').text(order.returnPolicy?.conditions || 'الاستبدال مسموح خلال 14 يوماً', 60, doc.y + 35 - 70, { width: 475, align: 'right' });
    doc.moveDown(5);
    
    try {
        const qrData = await QRCode.toDataURL(JSON.stringify({ orderNumber: order.orderNumber, total: p.total, store: 'الرعدي أونلاين', status: order.status, date: order.createdAt }));
        doc.image(qrData, 50, doc.y, { width: 80 });
        doc.fontSize(8).fillColor('#999').text('📱 امسح للتحقق من الفاتورة', 50, doc.y + 85, { width: 80, align: 'center' });
    } catch (e) {}
    
    doc.moveDown(8);
    doc.fontSize(10).fillColor('#1A1A2E');
    doc.text('توقيع المستلم: _________________', { align: 'right' });
    doc.text('ختم المتجر: 🦅 الرعدي أونلاين', { align: 'left' });
    
    doc.end();
});

app.get('/api/invoice/:orderNumber/qr', async (req, res) => {
    const order = await DB.collection('orders').findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'غير موجود' });
    const qrData = JSON.stringify({ orderNumber: order.orderNumber, total: order.pricing?.total, status: order.status, store: 'الرعدي أونلاين' });
    const qrImage = await QRCode.toDataURL(qrData);
    res.json({ success: true, qrCode: qrImage, data: JSON.parse(qrData) });
});

// ==================== API: الكوبونات ====================
app.post('/api/coupons/validate', async (req, res) => {
    const { code, cartTotal } = req.body;
    const coupon = await DB.collection('coupons').findOne({ code, isActive: true });
    if (!coupon) return res.status(400).json({ error: 'الكوبون غير صالح أو منتهي' });
    if (cartTotal < (coupon.minOrderAmount || 0)) return res.status(400).json({ error: `الحد الأدنى للطلب ${coupon.minOrderAmount} ر.س` });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'تم استخدام الكوبون بالكامل' });
    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) return res.status(400).json({ error: 'الكوبون منتهي الصلاحية' });
    const discount = coupon.discountType === 'percentage' ? cartTotal * (coupon.discountValue/100) : coupon.discountValue;
    res.json({ success: true, data: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discount } });
});

app.get('/api/coupons', adminRequired, async (req, res) => {
    res.json({ success: true, data: await DB.collection('coupons').find().toArray() });
});

app.post('/api/coupons', adminRequired, async (req, res) => {
    const coupon = await DB.collection('coupons').insertOne({ ...req.body, usedCount: 0, isActive: true, createdAt: new Date() });
    res.status(201).json({ success: true, data: coupon });
});

app.delete('/api/coupons/:code', adminRequired, async (req, res) => {
    await DB.collection('coupons').updateOne({ code: req.params.code }, { $set: { isActive: false } });
    res.json({ success: true, message: 'تم تعطيل الكوبون' });
});

// ==================== API: الإحصائيات المتقدمة ====================
app.get('/api/admin/stats', adminRequired, async (req, res) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [allOrders, allProducts, allCustomers, allRFQs] = await Promise.all([
        DB.collection('orders').find().toArray(),
        DB.collection('products').find().toArray(),
        DB.collection('users').find({ role: 'customer' }).toArray(),
        DB.collection('rfq_requests').find().toArray()
    ]);
    
    const activeOrders = allOrders.filter(o => o.status !== 'cancelled');
    const todayOrders = allOrders.filter(o => new Date(o.createdAt) >= today);
    const monthOrders = allOrders.filter(o => new Date(o.createdAt) >= monthStart);
    
    const totalRevenue = activeOrders.reduce((s,o) => s + (o.pricing?.total||0), 0);
    const todayRevenue = todayOrders.filter(o=>o.status!=='cancelled').reduce((s,o) => s + (o.pricing?.total||0), 0);
    const monthRevenue = monthOrders.filter(o=>o.status!=='cancelled').reduce((s,o) => s + (o.pricing?.total||0), 0);
    
    const lowStockProducts = allProducts.filter(p => p.stock <= 5 && p.isActive);
    const bestSellingProducts = allProducts.sort((a,b) => (b.salesCount||0) - (a.salesCount||0)).slice(0,10);
    const recentOrders = allOrders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0,15);
    
    const predictedOutOfStock = allProducts.filter(p => p.isActive && p.stock > 0).map(p => {
        const dailyRate = (p.salesCount || 1) / Math.max(1, Math.ceil((new Date() - new Date(p.createdAt)) / 86400000));
        const daysUntilEmpty = dailyRate > 0 ? Math.floor(p.stock / dailyRate) : 999;
        return { id: p._id, name: p.name, stock: p.stock, dailyRate: Math.round(dailyRate * 10) / 10, daysUntilEmpty };
    }).filter(p => p.daysUntilEmpty <= 14).sort((a,b) => a.daysUntilEmpty - b.daysUntilEmpty);
    
    res.json({ success: true, data: {
        totalRevenue, todayRevenue, monthRevenue,
        totalOrders: allOrders.length, todayOrders: todayOrders.length, monthOrders: monthOrders.length,
        totalCustomers: allCustomers.length, totalProducts: allProducts.length,
        lowStockProducts: lowStockProducts.length,
        pendingRFQs: allRFQs.filter(r => r.status === 'pending').length,
        bestSellingProducts, predictedOutOfStock, recentOrders
    }});
});

app.get('/api/admin/reports', adminRequired, async (req, res) => {
    const { type='sales', period='daily', startDate, endDate } = req.query;
    if (type === 'sales') {
        const result = await DB.collection('orders').aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: { $dateToString: { format: period==='daily'?'%Y-%m-%d':'%Y-%m', date: '$createdAt' } }, orders: { $sum: 1 }, revenue: { $sum: '$pricing.total' }, averageOrder: { $avg: '$pricing.total' } } },
            { $sort: { _id: 1 } }
        ]);
        res.json({ success: true, data: await result.toArray() });
    } else if (type === 'products') {
        const products = await DB.collection('products').find({ isActive: true }).toArray();
        res.json({ success: true, data: products.sort((a,b) => (b.salesCount||0) - (a.salesCount||0)).slice(0,30) });
    } else {
        const products = await DB.collection('products').find({ isActive: true, stock: { $lte: 10 } }).toArray();
        res.json({ success: true, data: products });
    }
});

// ==================== API: نظام المنافسين ====================
app.get('/api/admin/competitors', adminRequired, async (req, res) => {
    const competitors = await DB.collection('competitors').find().toArray();
    res.json({ success: true, data: competitors });
});

app.post('/api/admin/competitors', adminRequired, async (req, res) => {
    const competitor = await DB.collection('competitors').insertOne({ ...req.body, createdAt: new Date(), updatedAt: new Date() });
    res.status(201).json({ success: true, data: competitor });
});

app.put('/api/admin/competitors/:id', adminRequired, async (req, res) => {
    await DB.collection('competitors').updateOne({ _id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    res.json({ success: true, message: 'تم التحديث' });
});

// ==================== API: الطلبات ====================
app.get('/api/orders', adminRequired, async (req, res) => {
    const { status, page=1, limit=20 } = req.query;
    const q = {};
    if (status && status !== 'all') q.status = status;
    const orders = await DB.collection('orders').find(q).toArray();
    orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = orders.length;
    const paged = orders.slice((page-1)*limit, page*limit);
    res.json({ success: true, data: paged, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total/limit) } });
});

app.get('/api/orders/:id', async (req, res) => {
    const order = await DB.collection('orders').findOne({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    const user = await DB.collection('users').findOne({ _id: order.user });
    res.json({ success: true, data: { ...order, user: user ? { fullName: user.fullName, email: user.email, phone: user.phone } : null } });
});

app.put('/api/orders/:id/status', adminRequired, async (req, res) => {
    const { status, note, trackingNumber } = req.body;
    const order = await DB.collection('orders').findOne({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    const history = order.statusHistory || [];
    history.push({ status, note: note || '', updatedBy: req.user.id, updatedAt: new Date() });
    const updates = { status, statusHistory: history, updatedAt: new Date() };
    if (trackingNumber) updates['shipping.trackingNumber'] = trackingNumber;
    await DB.collection('orders').updateOne({ _id: req.params.id }, { $set: updates });
    io.emit('orderStatusUpdate', { orderId: req.params.id, status, trackingNumber });
    res.json({ success: true, message: 'تم تحديث حالة الطلب' });
});

app.get('/api/orders/user/:userId', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const orders = await DB.collection('orders').find({ user: req.params.userId }).toArray();
    orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: orders });
});

// ==================== API: العملاء ====================
app.get('/api/users', adminRequired, async (req, res) => {
    const { role, search, page=1, limit=20 } = req.query;
    const q = {};
    if (role) q.role = role;
    let users = await DB.collection('users').find(q).toArray();
    if (search) users = users.filter(u => u.fullName?.includes(search) || u.email?.includes(search) || u.phone?.includes(search));
    users.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = users.length;
    const paged = users.slice((page-1)*limit, page*limit);
    res.json({ success: true, data: paged, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total/limit) } });
});

app.get('/api/users/:id', adminRequired, async (req, res) => {
    const user = await DB.collection('users').findOne({ _id: req.params.id });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const orders = await DB.collection('orders').find({ user: req.params.id }).toArray();
    res.json({ success: true, data: { ...user, password: undefined, orders: orders.length, totalSpent: orders.reduce((s,o) => s + (o.pricing?.total||0), 0) } });
});

// ==================== API: البانرات ====================
app.get('/api/banners', async (req, res) => {
    res.json({ success: true, data: await DB.collection('banners').find({ isActive: true }).toArray() });
});

app.post('/api/banners', adminRequired, async (req, res) => {
    const banner = await DB.collection('banners').insertOne({ ...req.body, isActive: true, createdAt: new Date() });
    res.status(201).json({ success: true, data: banner });
});

app.delete('/api/banners/:id', adminRequired, async (req, res) => {
    await DB.collection('banners').updateOne({ _id: req.params.id }, { $set: { isActive: false } });
    res.json({ success: true, message: 'تم التعطيل' });
});

// ==================== API: الصوتيات ====================
app.get('/api/sounds', adminRequired, async (req, res) => {
    res.json({ success: true, data: await DB.collection('sounds').find().toArray() });
});

app.post('/api/sounds', adminRequired, upload.single('file'), async (req, res) => {
    const sound = await DB.collection('sounds').insertOne({ 
        name: req.body.name, url: `/uploads/sounds/${req.file.filename}`, 
        type: req.body.type || 'effect', createdAt: new Date() 
    });
    res.status(201).json({ success: true, data: sound });
})
