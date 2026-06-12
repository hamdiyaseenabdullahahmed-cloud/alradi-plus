// ⚡ الرعدي إكسبريس السحابي 3.0 – خادم لوحة التحكم الشاملة
// جميع الحقوق محفوظة © 2024
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
const mongoose = require('mongoose');
const http = require('http');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'alradi-super-secret-key-2024';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/alradi_store';

// ---------- الاتصال بقاعدة البيانات السحابية ----------
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('🔌 متصل بنجاح بقاعدة بيانات MongoDB Atlas سحابياً'))
  .catch(err => console.error('❌ فشل الاتصال بقاعدة البيانات السحابية:', err));

// ---------- نماذج قاعدة البيانات (Mongoose) ----------
const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    loyaltyPoints: { type: Number, default: 0 },
    loyaltyTier: { type: String, default: 'برونزي' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    comparePrice: Number,
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
        address: { street: String, country: String },
        cost: Number
    },
    pricing: {
        subtotal: Number,
        shippingCost: Number,
        total: Number
    },
    status: { type: String, default: 'pending' },
    paymentMethod: { type: String, default: 'cod' }
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
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, message: { error: 'طلبات كثيرة' } }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// التحقق من الجلسات والتوكينز
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) { req.user = null; return next(); }
    try { req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET); next(); } catch { req.user = null; next(); }
}
function adminRequired(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'صلاحيات المدير مطلوبة للوصول لهذا الإجراء' });
    }
    next();
}
app.use(authMiddleware);

// ---------- API: المصادقة ----------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, phone, password } = req.body;
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
        const hash = await bcrypt.hash(password, 10);
        const user = await User.create({ fullName, email, phone, password: hash });
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        res.status(201).json({ success: true, token, user: { id: user._id, fullName, email, phone, role: user.role } });
    } catch (e) { res.status(500).json({ error: 'فشل التسجيل' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, user: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, loyaltyPoints: user.loyaltyPoints } });
    } catch (e) { res.status(500).json({ error: 'فشل تسجيل الدخول' }); }
});

// ---------- API: المنتجات والكوبونات والطلبات ----------
app.get('/api/categories', async (req, res) => {
    res.json({ success: true, data: [{ name: 'إلكترونيات', icon: '📱' }, { name: 'عطور', icon: '🧴' }, { name: 'أزياء', icon: '👗' }, { name: 'منزل', icon: '🏠' }] });
});

app.get('/api/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        const q = { isActive: true };
        if (category && category !== 'all') q.category = category;
        if (search) q.name = { $regex: search, $options: 'i' };
        const items = await Product.find(q).sort('-createdAt');
        res.json({ success: true, data: items });
    } catch (e) { res.status(500).json({ error: 'فشل جلب المنتجات' }); }
});

app.post('/api/products', adminRequired, async (req, res) => {
    try {
        const product = await Product.create(req.body);
        await AuditLog.create({ action: 'إضافة منتج', details: `تم إضافة منتج جديد: ${product.name}`, userId: req.user.id, ipAddress: req.ip });
        res.status(201).json({ success: true, data: product });
    } catch (e) { res.status(400).json({ error: 'خطأ في الحفظ' }); }
});

app.delete('/api/products/:id', adminRequired, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        await AuditLog.create({ action: 'حذف منتج', details: `تم حذف منتج: ${product.name}`, userId: req.user.id, ipAddress: req.ip });
        res.json({ success: true, message: 'تم الحذف' });
    } catch (e) { res.status(400).json({ error: 'خطأ في الحذف' }); }
});

app.get('/api/orders', adminRequired, async (req, res) => {
    const orders = await Order.find().sort('-createdAt');
    res.json({ success: true, data: orders });
});

app.post('/api/checkout', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    try {
        const { items, shippingAddress, shippingType } = req.body;
        const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
        const cost = shippingType === 'internal' ? 20 : 50;
        const total = subtotal + cost;
        const orderNumber = `R3D-${Date.now().toString(36).toUpperCase()}`;
        const order = await Order.create({ orderNumber, userId: req.user.id, items, shipping: { type: shippingType, address: shippingAddress, cost }, pricing: { subtotal, shippingCost: cost, total } });
        res.status(201).json({ success: true, data: order });
    } catch (e) { res.status(400).json({ error: 'فشل إتمام الطلب' }); }
});

// ---------- الإحصائيات وسجلات الأدمين ----------
app.get('/api/admin/stats', adminRequired, async (req, res) => {
    const totalOrders = await Order.countDocuments();
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const totalProducts = await Product.countDocuments();
    const recentOrders = await Order.find().limit(10).sort('-createdAt');
    res.json({ success: true, data: { totalRevenue: 15000, totalOrders, totalCustomers, totalProducts, recentOrders } });
});

app.get('/api/audit-logs', adminRequired, async (req, res) => {
    const logs = await AuditLog.find().sort('-createdAt');
    res.json({ success: true, data: logs });
});

app.get('/api/trash', adminRequired, async (req, res) => {
    res.json({ success: true, data: [] });
});

// بذرة البيانات
async function seed() {
    const userCount = await User.countDocuments();
    if (userCount > 0) return;
    const adminHash = await bcrypt.hash('admin123', 10);
    await User.create({ fullName: 'المدير العام', email: 'alradi@gmail.com', phone: '+966500000000', password: adminHash, role: 'admin' });
}

const serverStart = async () => {
    await seed();
    server.listen(PORT, () => console.log(`🚀 السيرفر يعمل على منفذ: ${PORT}`));
};
serverStart();
