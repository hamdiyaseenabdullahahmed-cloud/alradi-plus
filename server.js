const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تقديم الملفات الثابتة من المجلد الحالي
app.use(express.static(__dirname));

// مسار الصفحة الرئيسية
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('ملف index.html غير موجود. الرجاء التأكد من رفع الملفات بشكل صحيح.');
    }
});

// مسار لوحة التحكم
app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.send('ملف admin.html غير موجود');
    }
});

// API لجلب البيانات (منتجات، طلبات، مستخدمين)
let products = [];
let orders = [];
let users = [];
let messages = [];

// محاولة تحميل البيانات من ملفات JSON
try {
    if (fs.existsSync('./products.json')) products = JSON.parse(fs.readFileSync('./products.json'));
    if (fs.existsSync('./orders.json')) orders = JSON.parse(fs.readFileSync('./orders.json'));
    if (fs.existsSync('./users.json')) users = JSON.parse(fs.readFileSync('./users.json'));
    if (fs.existsSync('./messages.json')) messages = JSON.parse(fs.readFileSync('./messages.json'));
} catch(e) { console.log('خطأ في تحميل البيانات'); }

// بيانات افتراضية إذا كانت فارغة
if (products.length === 0) {
    products = [
        { id: 1, name: "هاتف الرعدي الذكي برو X", category: "هواتف", price: 2999, oldPrice: 3499, discount: 15, color: "أسود تيتانيوم", features: "كاميرا 200 ميجابكسل، شاشة 6.8 بوصة", stock: 10, image: "https://picsum.photos/id/0/300/300" },
        { id: 2, name: "عطر بلو دي شانيل", category: "عطور", price: 4140, oldPrice: 4600, discount: 10, color: "شفاف كحلي", features: "رائحة خشبية فاخرة", stock: 5, image: "https://picsum.photos/id/1/300/300" },
        { id: 3, name: "سماعة أبل إيربودز برو", category: "إكسسوارات", price: 899, oldPrice: 1099, discount: 18, color: "أبيض", features: "عزل الضوضاء", stock: 15, image: "https://picsum.photos/id/2/300/300" }
    ];
}
if (users.length === 0) {
    users = [{ id: 1, name: "المدير", email: "admin@raadi.com", password: "admin123", role: "admin" }];
}

// دوال لحفظ البيانات
function saveData(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// API المسارات
app.get('/api/products', (req, res) => res.json(products));
app.get('/api/categories', (req, res) => res.json([...new Set(products.map(p => p.category))]));
app.get('/api/orders', (req, res) => res.json(orders));
app.get('/api/users', (req, res) => res.json(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }))));
app.get('/api/messages', (req, res) => res.json(messages));
app.get('/api/stats', (req, res) => {
    const totalUsers = users.filter(u => u.role !== 'admin').length;
    const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
    res.json({ totalUsers, totalProducts: products.length, totalOrders: orders.length, totalRevenue, lowStock: products.filter(p => p.stock < 5).length });
});

app.post('/api/products', (req, res) => {
    const p = { id: Date.now(), ...req.body };
    products.push(p);
    saveData('./products.json', products);
    res.json(p);
});
app.delete('/api/products/:id', (req, res) => {
    products = products.filter(p => p.id != req.params.id);
    saveData('./products.json', products);
    res.json({ success: true });
});
app.post('/api/orders', (req, res) => {
    const order = { id: Date.now(), ...req.body };
    orders.push(order);
    saveData('./orders.json', orders);
    res.json(order);
});
app.post('/api/login', (req, res) => {
    const u = users.find(u => u.email === req.body.email && u.password === req.body.password);
    u ? res.json({ success: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } }) : res.status(401).json({ error: 'بيانات غير صحيحة' });
});
app.post('/api/register', (req, res) => {
    if (users.find(u => u.email === req.body.email)) return res.status(400).json({ error: 'البريد موجود' });
    const newUser = { id: Date.now(), ...req.body, role: 'user' };
    users.push(newUser);
    saveData('./users.json', users);
    res.json({ success: true });
});
app.post('/api/messages', (req, res) => {
    messages.push(req.body);
    saveData('./messages.json', messages);
    res.json({ success: true });
});

// تشغيل الخادم
app.listen(PORT, () => console.log(`🚀 متجر الرعدي يعمل على http://localhost:${PORT}`));
