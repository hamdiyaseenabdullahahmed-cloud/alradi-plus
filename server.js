const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(session({
    secret: 'raadi-ultimate-super-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = path.join(__dirname, 'raadi.db');
const db = new sqlite3.Database(dbPath);

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// إنشاء جميع الجداول الأساسية
const initDB = async () => {
    try {
        await runQuery(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT NOT NULL,
            name_en TEXT NOT NULL,
            icon TEXT,
            displayOrder INTEGER DEFAULT 0,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT NOT NULL,
            name_en TEXT,
            category_id INTEGER,
            category_name TEXT,
            price REAL NOT NULL,
            oldPrice REAL,
            discount INTEGER DEFAULT 0,
            color TEXT,
            features_ar TEXT,
            features_en TEXT,
            stock INTEGER DEFAULT 0,
            image TEXT,
            images TEXT,
            rating REAL DEFAULT 0,
            ratingCount INTEGER DEFAULT 0,
            soldCount INTEGER DEFAULT 0,
            isActive INTEGER DEFAULT 1,
            createdAt TEXT,
            updatedAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS product_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId INTEGER,
            userId INTEGER,
            rating INTEGER,
            review_ar TEXT,
            review_en TEXT,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            phone TEXT,
            address TEXT,
            wishlist TEXT,
            loyaltyPoints INTEGER DEFAULT 0,
            memberTier TEXT DEFAULT 'bronze',
            createdAt TEXT,
            lastLogin TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            orderNumber TEXT UNIQUE,
            customer TEXT NOT NULL,
            email TEXT,
            phone TEXT NOT NULL,
            address TEXT NOT NULL,
            country TEXT NOT NULL,
            items TEXT NOT NULL,
            subtotal REAL,
            discount INTEGER DEFAULT 0,
            discountAmount REAL DEFAULT 0,
            shipping REAL DEFAULT 0,
            total REAL NOT NULL,
            currency TEXT DEFAULT 'SAR',
            status TEXT DEFAULT 'pending',
            trackingNumber TEXT,
            date TEXT NOT NULL,
            dateFormatted TEXT NOT NULL,
            notes TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            sender TEXT NOT NULL,
            text_ar TEXT,
            text_en TEXT,
            isAdmin INTEGER DEFAULT 0,
            isRead INTEGER DEFAULT 0,
            timestamp TEXT,
            date TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS coupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            value INTEGER NOT NULL,
            minOrder REAL DEFAULT 0,
            expiresAt TEXT,
            usageLimit INTEGER,
            usedCount INTEGER DEFAULT 0,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_ar TEXT,
            value_en TEXT,
            updatedAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS banners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title_ar TEXT,
            title_en TEXT,
            image TEXT,
            link TEXT,
            displayOrder INTEGER DEFAULT 0,
            isActive INTEGER DEFAULT 1,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text_ar TEXT,
            text_en TEXT,
            isActive INTEGER DEFAULT 1,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS audio_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            url TEXT,
            createdAt TEXT
        )`);

        // البيانات الأولية
        const catCount = await getQuery("SELECT COUNT(*) as count FROM categories");
        if (catCount.count === 0) {
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, displayOrder, createdAt) VALUES (?, ?, ?, ?, ?)", ['هواتف', 'Phones', 'fa-mobile-alt', 1, new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, displayOrder, createdAt) VALUES (?, ?, ?, ?, ?)", ['عطور', 'Perfumes', 'fa-leaf', 2, new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, displayOrder, createdAt) VALUES (?, ?, ?, ?, ?)", ['إكسسوارات', 'Accessories', 'fa-headphones', 3, new Date().toISOString()]);
        }

        const adminCount = await getQuery("SELECT COUNT(*) as count FROM users WHERE email = 'admin@raadi.com'");
        if (adminCount.count === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await runQuery("INSERT INTO users (name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?)", ['المدير العام', 'admin@raadi.com', hashedPassword, 'admin', new Date().toISOString()]);
        }

        const settingsCount = await getQuery("SELECT COUNT(*) as count FROM settings");
        if (settingsCount.count === 0) {
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['siteName', 'الرعدي أونلاين', 'Raadi Online', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['primaryColor', '#e67e22', '#e67e22', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['domesticShipping', '15', '15', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['internationalShipping', '50', '50', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['whatsappNumber', '966500000000', '966500000000', new Date().toISOString()]);
        }

        console.log('✅ قاعدة البيانات وجميع الجداول جاهزة');

    } catch (err) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', err.message);
    }
};

initDB();

// ==================== مسارات API ====================

app.get('/api/categories', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const cats = await allQuery("SELECT id, name_ar, name_en, icon FROM categories ORDER BY displayOrder");
        const formatted = cats.map(c => ({ id: c.id, name: lang === 'ar' ? c.name_ar : c.name_en, icon: c.icon }));
        res.json(formatted);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/categories', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name_ar, name_en, icon, displayOrder } = req.body;
    if (!name_ar || !name_en) return res.status(400).json({ error: 'الاسم باللغتين مطلوب' });
    try {
        await runQuery("INSERT INTO categories (name_ar, name_en, icon, displayOrder, createdAt) VALUES (?, ?, ?, ?, ?)", [name_ar, name_en, icon || 'fa-tag', displayOrder || 0, new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ في إضافة القسم' }); }
});

app.delete('/api/categories/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    try {
        await runQuery("DELETE FROM categories WHERE id = ?", [req.params.id]);
        await runQuery("DELETE FROM products WHERE category_id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const products = await allQuery("SELECT * FROM products WHERE isActive = 1 ORDER BY id DESC");
        const formatted = products.map(p => ({
            id: p.id,
            name: lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar),
            category: p.category_name,
            price: p.price,
            oldPrice: p.oldPrice,
            discount: p.discount,
            color: p.color,
            features: lang === 'ar' ? p.features_ar : (p.features_en || p.features_ar),
            stock: p.stock,
            image: p.image,
            rating: p.rating || 0,
            ratingCount: p.ratingCount || 0,
            soldCount: p.soldCount || 0
        }));
        res.json(formatted);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/products', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name_ar, name_en, category_id, category_name, price, oldPrice, discount, color, features_ar, features_en, stock, image } = req.body;
    if (!name_ar || !price || !category_id) return res.status(400).json({ error: 'الاسم والسعر والقسم مطلوبة' });
    try {
        await runQuery(`INSERT INTO products (name_ar, name_en, category_id, category_name, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name_ar, name_en || '', category_id, category_name, price, oldPrice || 0, discount || 0, color || '', features_ar || '', features_en || '', stock || 0, image || '', new Date().toISOString(), new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ في إضافة المنتج' }); }
});

app.put('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const updates = req.body;
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), new Date().toISOString(), req.params.id];
    try {
        await runQuery(`UPDATE products SET ${setClause}, updatedAt = ? WHERE id = ?`, values);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ في تحديث المنتج' }); }
});

app.delete('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    try {
        await runQuery("UPDATE products SET isActive = 0 WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.post('/api/products/:id/rate', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { rating, review_ar, review_en } = req.body;
    try {
        await runQuery("INSERT INTO product_ratings (productId, userId, rating, review_ar, review_en, createdAt) VALUES (?, ?, ?, ?, ?, ?)", [req.params.id, req.session.userId, rating, review_ar || '', review_en || '', new Date().toISOString()]);
        const ratings = await allQuery("SELECT rating FROM product_ratings WHERE productId = ?", [req.params.id]);
        const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
        await runQuery("UPDATE products SET rating = ?, ratingCount = ? WHERE id = ?", [avg, ratings.length, req.params.id]);
        res.json({ success: true, newRating: avg });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ في التقييم' }); }
});

app.get('/api/wishlist', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        const wishlistIds = user?.wishlist ? JSON.parse(user.wishlist) : [];
        if (wishlistIds.length === 0) return res.json([]);
        const products = await allQuery(`SELECT id, name_ar, name_en, price, image FROM products WHERE id IN (${wishlistIds.join(',')})`);
        const lang = req.query.lang || 'ar';
        const formatted = products.map(p => ({ id: p.id, name: lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar), price: p.price, image: p.image }));
        res.json(formatted);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/wishlist/add', async (req, res) => {
    if (!req.session.userId) return res.status(401);
    const { productId } = req.body;
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        let wishlist = user?.wishlist ? JSON.parse(user.wishlist) : [];
        if (!wishlist.includes(productId)) wishlist.push(productId);
        await runQuery("UPDATE users SET wishlist = ? WHERE id = ?", [JSON.stringify(wishlist), req.session.userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.post('/api/wishlist/remove', async (req, res) => {
    if (!req.session.userId) return res.status(401);
    const { productId } = req.body;
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        let wishlist = user?.wishlist ? JSON.parse(user.wishlist) : [];
        wishlist = wishlist.filter(id => id != productId);
        await runQuery("UPDATE users SET wishlist = ? WHERE id = ?", [JSON.stringify(wishlist), req.session.userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.post('/api/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, notes } = req.body;
    const orderNumber = 'RAD-' + Date.now();
    const dateFormatted = new Date().toLocaleDateString('ar-EG');
    try {
        await runQuery(`INSERT INTO orders (userId, orderNumber, customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, status, date, dateFormatted, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, orderNumber, customer, email, phone, address, country, JSON.stringify(items), subtotal, discount, discountAmount, shipping, total, currency || 'SAR', 'pending', new Date().toISOString(), dateFormatted, notes || '']);
        for (const item of items) {
            await runQuery("UPDATE products SET stock = stock - ?, soldCount = soldCount + ? WHERE id = ?", [item.quantity, item.quantity, item.id]);
        }
        res.json({ success: true, orderNumber });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ في إنشاء الطلب' }); }
});

app.get('/api/my-orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const orders = await allQuery("SELECT * FROM orders WHERE userId = ? ORDER BY id DESC", [req.session.userId]);
        orders.forEach(o => o.items = JSON.parse(o.items));
        res.json(orders);
    } catch (err) { res.status(500).json([]); }
});

app.get('/api/orders', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const orders = await allQuery("SELECT * FROM orders ORDER BY id DESC");
        orders.forEach(o => o.items = JSON.parse(o.items));
        res.json(orders);
    } catch (err) { res.status(500).json([]); }
});

app.put('/api/orders/:id/status', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const { status, trackingNumber } = req.body;
    try {
        await runQuery("UPDATE orders SET status = ?, trackingNumber = ? WHERE id = ?", [status, trackingNumber || null, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.get('/api/coupons', async (req, res) => {
    try {
        const coupons = await allQuery("SELECT code, value, minOrder FROM coupons WHERE expiresAt IS NULL OR expiresAt > datetime('now')");
        res.json(coupons);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/coupons', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const { code, value, minOrder } = req.body;
    try {
        await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", [code.toUpperCase(), value, minOrder || 0, new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'الكود موجود مسبقاً' }); }
});

app.delete('/api/coupons/:code', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    try {
        await runQuery("DELETE FROM coupons WHERE code = ?", [req.params.code]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.get('/api/settings', async (req, res) => {
    try {
        const rows = await allQuery("SELECT key, value_ar, value_en FROM settings");
        const settings = {};
        rows.forEach(row => { settings[row.key] = { ar: row.value_ar, en: row.value_en }; });
        res.json(settings);
    } catch (err) { res.status(500).json({}); }
});

app.post('/api/settings', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const updates = req.body;
    try {
        for (const [key, val] of Object.entries(updates)) {
            const valueAr = typeof val === 'object' ? val.ar : val;
            const valueEn = typeof val === 'object' ? val.en : val;
            await runQuery("UPDATE settings SET value_ar = ?, value_en = ?, updatedAt = ? WHERE key = ?", [valueAr, valueEn, new Date().toISOString(), key]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ في حفظ الإعدادات' }); }
});

app.get('/api/banners', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const banners = await allQuery("SELECT title_ar, title_en, image, link FROM banners WHERE isActive = 1 ORDER BY displayOrder");
        const formatted = banners.map(b => ({ title: lang === 'ar' ? b.title_ar : b.title_en, image: b.image, link: b.link }));
        res.json(formatted);
    } catch (err) { res.status(500).json([]); }
});

app.get('/api/announcements', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const ann = await allQuery("SELECT text_ar, text_en FROM announcements WHERE isActive = 1 ORDER BY id DESC LIMIT 1");
        if (ann.length) res.json({ text: lang === 'ar' ? ann[0].text_ar : ann[0].text_en });
        else res.json({ text: '' });
    } catch (err) { res.status(500).json({}); }
});

app.post('/api/announcements', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const { text_ar, text_en } = req.body;
    try {
        await runQuery("INSERT INTO announcements (text_ar, text_en, isActive, createdAt) VALUES (?, ?, ?, ?)", [text_ar, text_en, 1, new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.get('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const messages = await allQuery("SELECT * FROM messages WHERE userId = ? OR isAdmin = 1 ORDER BY id ASC", [req.session.userId]);
        res.json(messages);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401);
    const { text_ar, text_en, isAdmin } = req.body;
    try {
        await runQuery(`INSERT INTO messages (userId, sender, text_ar, text_en, isAdmin, timestamp, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, req.session.user.name, text_ar || '', text_en || '', isAdmin ? 1 : 0, new Date().toLocaleTimeString('ar-EG'), new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.get('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const users = await allQuery("SELECT id, name, email, phone, address, loyaltyPoints, memberTier, createdAt FROM users WHERE role != 'admin'");
        res.json(users);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    try {
        const existing = await getQuery("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
        const hashed = bcrypt.hashSync(password, 10);
        await runQuery("INSERT INTO users (name, email, password, phone, address, createdAt) VALUES (?, ?, ?, ?, ?, ?)", [name, email, hashed, phone || '', address || '', new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ في التسجيل' }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await getQuery("SELECT * FROM users WHERE email = ?", [email]);
        if (!user) return res.status(401).json({ error: 'البريد غير مسجل' });
        const match = bcrypt.compareSync(password, user.password);
        if (!match) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        req.session.userId = user.id;
        req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, address: user.address, loyaltyPoints: user.loyaltyPoints, memberTier: user.memberTier };
        await runQuery("UPDATE users SET lastLogin = ? WHERE id = ?", [new Date().toISOString(), user.id]);
        res.json({ success: true, user: req.session.user });
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.get('/api/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    try {
        const user = await getQuery("SELECT id, name, email, role, phone, address, loyaltyPoints, memberTier FROM users WHERE id = ?", [req.session.userId]);
        res.json(user);
    } catch (err) { res.status(500).json({ error: 'حدث خطأ' }); }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/stats', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    try {
        const totalUsers = await getQuery("SELECT COUNT(*) as count FROM users WHERE role != 'admin'");
        const totalProducts = await getQuery("SELECT COUNT(*) as count FROM products");
        const totalOrders = await getQuery("SELECT COUNT(*) as count FROM orders");
        const totalRevenue = await getQuery("SELECT SUM(total) as sum FROM orders");
        const lowStock = await getQuery("SELECT COUNT(*) as count FROM products WHERE stock < 5");
        res.json({ totalUsers: totalUsers.count, totalProducts: totalProducts.count, totalOrders: totalOrders.count, totalRevenue: totalRevenue.sum || 0, lowStock: lowStock.count });
    } catch (err) { res.status(500).json({}); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 متجر الرعدي المتكامل يعمل على http://localhost:${PORT}`);
    console.log(`👑 المدير: admin@raadi.com / admin123`);
    console.log(`========================================`);
});
