const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------- إعدادات السيرفر ----------------------------
app.use(session({
    secret: 'raadi-legendary-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // يوم كامل
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ---------------------------- إدارة قاعدة البيانات (JSON) ----------------------------
const dataPath = (file) => path.join(__dirname, file);
const readData = (file, defaultValue = []) => {
    try {
        if (fs.existsSync(dataPath(file))) {
            return JSON.parse(fs.readFileSync(dataPath(file), 'utf8'));
        }
        return defaultValue;
    } catch (err) { return defaultValue; }
};
const writeData = (file, data) => fs.writeFileSync(dataPath(file), JSON.stringify(data, null, 2), 'utf8');

// ---------------------------- البيانات الافتراضية ----------------------------
let products = readData('products.json', []);
if (products.length === 0) {
    products = [
        { id: 1, name: "هاتف الرعدي الذكي برو X", category: "هواتف", price: 2999, oldPrice: 3499, discount: 15, color: "أسود تيتانيوم", features: "كاميرا 200 ميجابكسل، شاشة 6.8 بوصة، معالج فائق السرعة", stock: 10, image: "https://picsum.photos/id/0/300/300", rating: 4.8 },
        { id: 2, name: "سامسونج جالكسي S24 الترا", category: "هواتف", price: 4940, oldPrice: 5200, discount: 12, color: "رمادي تيتانيوم", features: "كاميرا 200 ميجابكسل، قلم S-Pen، سعة 512 جيجا، شاشة 6.8 بوصة", stock: 7, image: "https://picsum.photos/id/1/300/300", rating: 4.9 },
        { id: 3, name: "سماعة أبل إيربودز برو", category: "إكسسوارات", price: 899, oldPrice: 1099, discount: 18, color: "أبيض ناصع", features: "تقنية عزل الضوضاء، صوت محيطي، مقاومة للماء", stock: 15, image: "https://picsum.photos/id/3/300/300", rating: 4.7 },
        { id: 4, name: "عطر بلو دي شانيل الأصلي", category: "عطور", price: 4140, oldPrice: 4600, discount: 10, color: "شفاف كحلي غامق", features: "رائحة خشبية فاخرة، تدوم طويلاً، تركيز عالي", stock: 5, image: "https://picsum.photos/id/2/300/300", rating: 4.9 },
        { id: 5, name: "ساعة أبل الترا 2", category: "إكسسوارات", price: 2799, oldPrice: 3299, discount: 15, color: "تيتانيوم", features: "مقاومة للماء، بطارية تدوم 36 ساعة، نظام تحديد المواقع", stock: 8, image: "https://picsum.photos/id/4/300/300", rating: 4.8 },
        { id: 6, name: "عطر توم فورد أود وود", category: "عطور", price: 550, oldPrice: 650, discount: 15, color: "بني داكن", features: "رائحة خشبية دافئة، ثبات طويل، فاخر", stock: 12, image: "https://picsum.photos/id/5/300/300", rating: 4.6 },
        { id: 7, name: "آيفون 16 برو ماكس", category: "هواتف", price: 5999, oldPrice: 6999, discount: 14, color: "ذهبي", features: "شاشة 6.9 بوصة، كاميرا 48 ميجابكسل، معالج A18", stock: 4, image: "https://picsum.photos/id/6/300/300", rating: 4.9 },
        { id: 8, name: "ماك بوك برو M3", category: "إلكترونيات", price: 7999, oldPrice: 8999, discount: 11, color: "فضي", features: "شاشة 14 بوصة، شريحة M3، 16 جيجا رام", stock: 3, image: "https://picsum.photos/id/7/300/300", rating: 4.9 }
    ];
    writeData('products.json', products);
}

let users = readData('users.json', []);
if (users.length === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    users.push({ id: 1, name: "المدير العام", email: "admin@raadi.com", password: hashedPassword, role: "admin", phone: "0500000000", address: "الرياض، المملكة العربية السعودية", createdAt: new Date().toISOString() });
    writeData('users.json', users);
}

let orders = readData('orders.json', []);
let messages = readData('messages.json', []);
let settings = readData('settings.json', { domesticShipping: 15, internationalShipping: 50, returnPolicy: "يمكن استرجاع المنتج خلال 14 يوماً في حالة وجود عيب صناعي. يتم الاستبدال خلال 7 أيام." });

// ---------------------------- مسارات API العامة ----------------------------
app.get('/api/products', (req, res) => res.json(products));
app.get('/api/categories', (req, res) => {
    const categories = [...new Set(products.map(p => p.category))];
    res.json(categories);
});
app.get('/api/settings', (req, res) => res.json(settings));
app.post('/api/settings', (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    settings = { ...settings, ...req.body };
    writeData('settings.json', settings);
    res.json({ success: true });
});

// ---------------------------- مسارات المصادقة ----------------------------
app.post('/api/register', (req, res) => {
    const { name, email, password, phone, address } = req.body;
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = { id: Date.now(), name, email, password: hashedPassword, role: 'user', phone, address, createdAt: new Date().toISOString() };
    users.push(newUser);
    writeData('users.json', users);
    res.json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    const match = bcrypt.compareSync(password, user.password);
    if (!match) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ success: true, user: req.session.user });
});

app.get('/api/me', (req, res) => {
    if (req.session.userId) return res.json(req.session.user);
    res.status(401).json({ error: 'غير مسجل' });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ---------------------------- مسارات الطلبات ----------------------------
app.post('/api/orders', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    const order = {
        id: Date.now(),
        userId: req.session.userId,
        customer: req.body.customer,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        country: req.body.country,
        items: req.body.items,
        subtotal: req.body.subtotal,
        discount: req.body.discount,
        discountAmount: req.body.discountAmount,
        shipping: req.body.shipping,
        total: req.body.total,
        status: 'قيد المعالجة',
        date: new Date().toISOString(),
        dateFormatted: new Date().toLocaleDateString('ar-EG')
    };
    orders.push(order);
    writeData('orders.json', orders);
    // تقليل المخزون
    order.items.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (product) product.stock -= item.quantity;
    });
    writeData('products.json', products);
    res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    if (req.session.user.role === 'admin') return res.json(orders);
    const userOrders = orders.filter(o => o.userId === req.session.userId);
    res.json(userOrders);
});

app.put('/api/orders/:id/status', (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const id = parseInt(req.params.id);
    const order = orders.find(o => o.id === id);
    if (order) {
        order.status = req.body.status;
        writeData('orders.json', orders);
        res.json({ success: true });
    } else res.status(404).json({ error: 'الطلب غير موجود' });
});

// ---------------------------- مسارات المستخدمين ----------------------------
app.get('/api/users', (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    const safeUsers = users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, address: u.address, createdAt: u.createdAt }));
    res.json(safeUsers);
});

// ---------------------------- مسارات المنتجات (للمدير) ----------------------------
app.post('/api/products', (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const newProduct = { id: Date.now(), ...req.body };
    products.push(newProduct);
    writeData('products.json', products);
    res.json({ success: true, product: newProduct });
});

app.put('/api/products/:id', (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const id = parseInt(req.params.id);
    const index = products.findIndex(p => p.id === id);
    if (index !== -1) {
        products[index] = { ...products[index], ...req.body };
        writeData('products.json', products);
        res.json({ success: true });
    } else res.status(404).json({ error: 'المنتج غير موجود' });
});

app.delete('/api/products/:id', (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const id = parseInt(req.params.id);
    products = products.filter(p => p.id !== id);
    writeData('products.json', products);
    res.json({ success: true });
});

// ---------------------------- مسارات الدردشة ----------------------------
app.get('/api/messages', (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    const userMessages = messages.filter(m => m.userId === req.session.userId || m.isAdmin);
    res.json(userMessages);
});

app.post('/api/messages', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    const { text, isAdmin } = req.body;
    const newMessage = {
        id: Date.now(),
        userId: req.session.userId,
        sender: req.session.user.name,
        text,
        isAdmin: isAdmin || false,
        timestamp: new Date().toLocaleTimeString('ar-EG'),
        date: new Date().toISOString()
    };
    messages.push(newMessage);
    writeData('messages.json', messages);
    res.json({ success: true });
});

// ---------------------------- مسارات الإحصائيات ----------------------------
app.get('/api/stats', (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const totalUsers = users.filter(u => u.role !== 'admin').length;
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const today = new Date().toDateString();
    const todayRevenue = orders.filter(o => new Date(o.date).toDateString() === today).reduce((sum, o) => sum + o.total, 0);
    res.json({
        totalUsers,
        totalProducts: products.length,
        totalOrders,
        totalRevenue,
        todayRevenue,
        lowStock: products.filter(p => p.stock < 5).length
    });
});

// ---------------------------- حماية الصفحات ----------------------------
app.get('/admin', (req, res) => {
    if (req.session.userId && req.session.user.role === 'admin') {
        res.sendFile(path.join(__dirname, 'admin.html'));
    } else {
        res.redirect('/');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------- تشغيل الخادم ----------------------------
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 متجر الرعدي الأسطوري يعمل الآن!`);
    console.log(`📍 الرابط: http://localhost:${PORT}`);
    console.log(`👑 حساب المدير: admin@raadi.com / admin123`);
    console.log(`========================================`);
});
