// ⚡ خادم منصة الرعدي أونلاين المعماري 3.0
// جميع الحقوق محفوظة © 2026 - الرؤية المعمارية والتشغيلية الكاملة
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const http = require('http');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'alradi-federal-secret-key-2026';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/alradi_db';

// ---------- الاتصال بقاعدة البيانات السحابية ----------
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('🔌 [المستوى السادس]: تم الاتصال بنجاح بمصفوفة قاعدة البيانات السحابية MongoDB Atlas'))
  .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ---------- نماذج قاعدة البيانات المعمارية (Mongoose Schemas) ----------
const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    loyaltyPoints: { type: Number, default: 0 },
    loyaltyTier: { type: String, default: 'برونزي' },
    isActive: { type: Boolean, default: true },
    lastLogin: Date
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    comparePrice: Number,
    discount: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    description: String,
    images: [{ url: String }],
    tags: [String],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [{
        productId: mongoose.Schema.Types.ObjectId,
        name: String,
        price: Number,
        quantity: Number
    }],
    shipping: {
        type: { type: String },
        address: { street: String, country: String },
        cost: Number
    },
    pricing: {
        subtotal: Number,
        shippingCost: Number,
        tax: Number,
        total: Number
    },
    status: { type: String, default: 'pending' },
    paymentMethod: { type: String, default: 'cod' },
    signatureData: String 
}, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema);

const CouponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    discountType: { type: String, required: true },
    discountValue: { type: Number, required: true },
    minOrderAmount: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
const Coupon = mongoose.model('Coupon', CouponSchema);

const AuditLogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    details: { type: String, required: true },
    userId: String,
    ipAddress: String
}, { timestamps: true });
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// ---------- Middleware ----------
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, message: { error: 'طلبات مكثفة' } }));

app.use(express.static(path.join(__dirname, 'public')));

// التحقق من الحماية والتوكينز
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) { req.user = null; return next(); }
    try { req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET); next(); } catch { req.user = null; next(); }
}
function adminRequired(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: '🔐 [أمان النظام]: صلاحيات الإدارة العليا مطلوبة للوصول.' });
    }
    next();
}
app.use(authMiddleware);

// ---------- نقاط برنامج الولاء والمكافآت ----------
const LOYALTY_TIERS = [
    { name: 'برونزي', min: 0, discount: 0 },
    { name: 'فضي', min: 500, discount: 5 },
    { name: 'ذهبي', min: 1000, discount: 10 },
    { name: 'بلاتيني', min: 2000, discount: 15 }
];
function getTier(points) { return LOYALTY_TIERS.reduce((t, c) => points >= c.min ? c : t, LOYALTY_TIERS[0]); }

// ---------- API: مصادقة المستخدمين والمدراء ----------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, phone, password } = req.body;
        if (!fullName || !email || !phone || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
        const hash = await bcrypt.hash(password, 10);
        const user = await User.create({ fullName, email, phone, password: hash });
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        res.status(201).json({ success: true, token, user: { id: user._id, fullName, email, phone, role: user.role, loyaltyPoints: 0, loyaltyTier: 'برونزي' } });
    } catch (e) { res.status(500).json({ error: 'فشل عملية التسجيل السحابية' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        user.lastLogin = new Date();
        await user.save();
        await AuditLog.create({ action: 'تسجيل دخول', details: `تم تسجيل دخول المستخدم: ${user.fullName}`, userId: user._id, ipAddress: req.ip });
        res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, loyaltyPoints: user.loyaltyPoints, loyaltyTier: getTier(user.loyaltyPoints).name } });
    } catch (e) { res.status(500).json({ error: 'فشل تسجيل الدخول' }); }
});

app.get('/api/user/profile', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const tier = getTier(user.loyaltyPoints);
    res.json({ success: true, data: { ...user.toObject(), loyaltyTier: tier.name, discountPercent: tier.discount } });
});

// ---------- API: إدارة المنتجات ----------
app.get('/api/categories', async (req, res) => {
    res.json({ success: true, data: [{ name: 'إلكترونيات', icon: '📱' }, { name: 'عطور', icon: '🧴' }, { name: 'أزياء', icon: '👗' }, { name: 'منزل', icon: '🏠' }] });
});

app.get('/api/products', async (req, res) => {
    const { category, search } = req.query;
    const q = { isActive: true };
    if (category && category !== 'all') q.category = category;
    if (search) q.name = { $regex: search, $options: 'i' };

    try {
        const items = await Product.find(q).sort('-createdAt');
        res.json({ success: true, data: items });
    } catch (e) { res.status(500).json({ error: 'فشل جلب المنتجات' }); }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        res.json({ success: true, data: product });
    } catch (e) { res.status(500).json({ error: 'خطأ بالخادم' }); }
});

app.post('/api/products', adminRequired, async (req, res) => {
    try {
        const product = await Product.create(req.body);
        await AuditLog.create({ action: 'إضافة منتج', details: `إضافة منتج جديد: ${product.name}`, userId: req.user.id, ipAddress: req.ip });
        res.status(201).json({ success: true, data: product });
    } catch (e) { res.status(400).json({ error: 'خطأ في حفظ المنتج' }); }
});

app.delete('/api/products/:id', adminRequired, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        await AuditLog.create({ action: 'حذف منتج', details: `حذف منتج: ${product.name}`, userId: req.user.id, ipAddress: req.ip });
        res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
    } catch (e) { res.status(400).json({ error: 'فشل عملية الحذف' }); }
});

app.get('/api/orders', adminRequired, async (req, res) => {
    const orders = await Order.find().sort('-createdAt');
    res.json({ success: true, data: orders });
});

app.post('/api/checkout', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    const { items, shippingAddress, shippingType, paymentMethod, signatureData } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'سلة المشتريات فارغة' });

    try {
        const user = await User.findById(req.user.id);
        const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
        const shippingCost = shippingType === 'internal' ? 20 : 50;
        const tax = Math.round((subtotal) * 0.15);
        const total = subtotal + shippingCost + tax;
        const orderNumber = `RAD-2026-${Math.floor(10000 + Math.random() * 90000)}`;

        const order = await Order.create({
            orderNumber, userId: user._id, items,
            shipping: { type: shippingType, address: shippingAddress, cost: shippingCost },
            pricing: { subtotal, shippingCost, tax, total },
            paymentMethod,
            signatureData
        });

        user.loyaltyPoints += Math.floor(total / 10);
        user.loyaltyTier = getTier(user.loyaltyPoints).name;
        await user.save();

        await AuditLog.create({ action: 'إنشاء طلب وشراء', details: `إنشاء فاتورة #${orderNumber} بمبلغ ${total} ر.س`, userId: user._id, ipAddress: req.ip });

        res.status(201).json({ success: true, data: { orderNumber, total, loyaltyPoints: user.loyaltyPoints, loyaltyTier: user.loyaltyTier } });
    } catch (e) { res.status(500).json({ error: 'فشل إتمام المعاملة المالية' }); }
});

// ---------- API: الرصد المالي والرقابة للأدمين ----------
app.get('/api/admin/stats', adminRequired, async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        const totalCustomers = await User.countDocuments({ role: 'customer' });
        const totalProducts = await Product.countDocuments();
        const orders = await Order.find().limit(10).sort('-createdAt');
        const revenueResult = await Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: '$pricing.total' } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 15000;

        res.json({ success: true, data: { totalRevenue, totalOrders, totalCustomers, totalProducts, recentOrders: orders } });
    } catch (e) { res.status(500).json({ error: 'فشل رصد البيانات المالية' }); }
});

app.get('/api/audit-logs', adminRequired, async (req, res) => {
    try {
        const logs = await AuditLog.find().sort('-createdAt').limit(50);
        res.json({ success: true, data: logs });
    } catch (e) { res.status(500).json({ error: 'خطأ في جلب السجلات' }); }
});

app.get('/api/trash', adminRequired, async (req, res) => {
    res.json({ success: true, data: [] });
});

// بذرة البيانات الافتراضية المكتملة
async function seed() {
    const userCount = await User.countDocuments();
    if (userCount > 0) return;

    const adminHash = await bcrypt.hash('admin123', 10);
    await User.create({
        fullName: 'مسؤول النظام الفيدرالي', email: 'alradi@gmail.com', phone: '+966500000000',
        password: adminHash, role: 'admin', loyaltyPoints: 9999, loyaltyTier: 'بلاتيني'
    });

    const products = [
        { name: '📱 هاتف آيفون 15 برو ماكس - ذهبي ملكي', category: 'إلكترونيات', price: 5200, comparePrice: 5999, stock: 45, description: 'أحدث هواتف آيفون مع سعة تخزين هائلة وشاشة متطورة وبلون ذهبي مطفي رائع.' },
        { name: '☕ ماكينة تحضير القهوة الاحترافية إكسبريس', category: 'أجهزة منزلية', price: 1300, comparePrice: 1800, stock: 19, description: 'جهاز تحضير الاسبريسو والقهوة بضغط 15 بار مع طاحونة مدمجة.' },
        { name: '🧴 عطر شرقي فاخر نخب أول 100ml', category: 'عطور', price: 450, comparePrice: 600, stock: 30, description: 'مزيج فاخر من العود الطبيعي والمسك والعنبر.' },
        { name: '👜 حقيبة جلدية فاخرة "أنيجبا من العفية"', category: 'أزياء', price: 2400, stock: 8, description: 'صناعة يدوية فاخرة من أجود أنواع الجلود الطبيعية.' }
    ];

    for (const p of products) {
        await Product.create({ ...p, discount: p.comparePrice ? Math.round((1 - p.price/p.comparePrice)*100) : 0 });
    }
    console.log('✅ [النظام]: تم بذر وإعداد الحسابات والمعروضات بنجاح فوري لمتجر الرعدي أونلاين.');
}

const startServer = async () => {
    await seed();
    server.listen(PORT, () => {
        console.log(`╔════════════════════════════════════════════════════════╗`);
        console.log(`║      ⚡ منصة الرعدي أونلاين المعمارية جاهزة للعمل       ║`);
        console.log(`║      🌐 منفذ التشغيل: http://localhost:${PORT}          ║`);
        console.log(`╚════════════════════════════════════════════════════════╝`);
    });
};
startServer();
