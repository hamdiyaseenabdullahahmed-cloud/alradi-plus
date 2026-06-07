const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(session({
    secret: 'raadi-ultimate-super-secret-2026-enterprise',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const dbPath = process.env.DB_PATH || path.join(__dirname, 'raadi.db');
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

const createTables = async () => {
    try {
        await runQuery(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT NOT NULL,
            name_en TEXT NOT NULL,
            icon TEXT,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT NOT NULL,
            name_en TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            oldPrice REAL,
            discount INTEGER DEFAULT 0,
            color TEXT,
            features_ar TEXT,
            features_en TEXT,
            stock INTEGER DEFAULT 0,
            image TEXT,
            rating REAL DEFAULT 0,
            ratingCount INTEGER DEFAULT 0,
            soldCount INTEGER DEFAULT 0,
            createdAt TEXT,
            updatedAt TEXT
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
            date TEXT NOT NULL,
            dateFormatted TEXT NOT NULL
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            sender TEXT NOT NULL,
            text_ar TEXT,
            text_en TEXT,
            isAdmin INTEGER DEFAULT 0,
            timestamp TEXT,
            date TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS coupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            value INTEGER NOT NULL,
            minOrder REAL DEFAULT 0,
            createdAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_ar TEXT,
            value_en TEXT,
            updatedAt TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS reserved_stock (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId INTEGER,
            quantity INTEGER,
            sessionId TEXT,
            expiresAt TEXT
        )`);

        console.log('✅ جميع الجداول تم إنشاؤها بنجاح');

        const catCount = await getQuery("SELECT COUNT(*) as count FROM categories");
        if (catCount.count === 0) {
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['هواتف', 'Phones', 'fa-mobile-alt', new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['عطور', 'Perfumes', 'fa-leaf', new Date().toISOString()]);
            await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", ['إكسسوارات', 'Accessories', 'fa-headphones', new Date().toISOString()]);
            console.log('✅ تم إضافة الأقسام الافتراضية');
        }

        const adminCount = await getQuery("SELECT COUNT(*) as count FROM users WHERE email = 'admin@raadi.com'");
        if (adminCount.count === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await runQuery("INSERT INTO users (name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?)", ['المدير العام', 'admin@raadi.com', hashedPassword, 'admin', new Date().toISOString()]);
            console.log('✅ تم إضافة حساب المدير');
        }

        const prodCount = await getQuery("SELECT COUNT(*) as count FROM products");
        if (prodCount.count === 0) {
            await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                ['هاتف الرعدي برو X', 'Raadi Phone Pro X', 'هواتف', 2999, 3499, 15, 'أسود تيتانيوم', 'كاميرا 200 ميجابكسل، شاشة 6.8 بوصة', '200MP Camera, 6.8" Screen', 10, 'https://picsum.photos/id/0/300/300', new Date().toISOString()]);
            await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                ['سامسونج جالكسي S24', 'Samsung Galaxy S24', 'هواتف', 4940, 5200, 12, 'رمادي تيتانيوم', 'قلم S-Pen، سعة 512 جيجا', 'S-Pen, 512GB', 7, 'https://picsum.photos/id/1/300/300', new Date().toISOString()]);
            await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                ['سماعة أبل إيربودز', 'Apple AirPods Pro', 'إكسسوارات', 899, 1099, 18, 'أبيض', 'عزل ضوضاء، صوت محيطي', 'Noise Cancellation', 15, 'https://picsum.photos/id/3/300/300', new Date().toISOString()]);
            console.log('✅ تم إضافة منتجات افتراضية');
        }

        const coupCount = await getQuery("SELECT COUNT(*) as count FROM coupons");
        if (coupCount.count === 0) {
            await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", ['WELCOME20', 20, 0, new Date().toISOString()]);
            await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", ['SUMMER70', 70, 300, new Date().toISOString()]);
            console.log('✅ تم إضافة كوبونات افتراضية');
        }

        const setCount = await getQuery("SELECT COUNT(*) as count FROM settings");
        if (setCount.count === 0) {
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['siteName', 'الرعدي أونلاين', 'Raadi Online', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['domesticShipping', '15', '15', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['internationalShipping', '50', '50', new Date().toISOString()]);
            await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)", ['whatsappNumber', '966500000000', '966500000000', new Date().toISOString()]);
            console.log('✅ تم إضافة الإعدادات الافتراضية');
        }

    } catch (error) {
        console.error('❌ خطأ في إنشاء الجداول:', error.message);
    }
};

createTables();

setInterval(async () => {
    await runQuery("DELETE FROM reserved_stock WHERE expiresAt < datetime('now')");
}, 60 * 1000);

app.get('/api/products', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const products = await allQuery("SELECT * FROM products ORDER BY id DESC");
        const formatted = products.map(p => ({
            id: p.id,
            name: lang === 'ar' ? p.name_ar : p.name_en,
            category: p.category,
            price: p.price,
            oldPrice: p.oldPrice,
            discount: p.discount,
            color: p.color,
            features: lang === 'ar' ? p.features_ar : p.features_en,
            stock: p.stock,
            image: p.image,
            rating: p.rating || 0,
            ratingCount: p.ratingCount || 0
        }));
        res.json(formatted);
    } catch (error) {
        console.error('خطأ في جلب المنتجات:', error);
        res.status(500).json([]);
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const cats = await allQuery("SELECT name_ar, name_en FROM categories");
        const formatted = cats.map(c => ({ name: lang === 'ar' ? c.name_ar : c.name_en }));
        res.json(formatted);
    } catch (error) {
        console.error('خطأ في جلب الأقسام:', error);
        res.status(500).json([]);
    }
});

app.post('/api/categories', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name_ar, name_en } = req.body;
    try {
        await runQuery("INSERT INTO categories (name_ar, name_en, createdAt) VALUES (?, ?, ?)", [name_ar, name_en, new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.post('/api/products', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image } = req.body;
    try {
        await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name_ar, name_en, category, price, oldPrice || 0, discount || 0, color || '', features_ar || '', features_en || '', stock || 0, image || '', new Date().toISOString(), new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    try {
        await runQuery("DELETE FROM products WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await getQuery("SELECT * FROM users WHERE email = ?", [email]);
        if (!user) return res.status(401).json({ error: 'البريد غير مسجل' });
        const match = bcrypt.compareSync(password, user.password);
        if (!match) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        req.session.userId = user.id;
        req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
        await runQuery("UPDATE users SET lastLogin = ? WHERE id = ?", [new Date().toISOString(), user.id]);
        res.json({ success: true, user: req.session.user });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    try {
        const existing = await getQuery("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) return res.status(400).json({ error: 'البريد مسجل' });
        const hashed = bcrypt.hashSync(password, 10);
        await runQuery("INSERT INTO users (name, email, password, phone, address, createdAt) VALUES (?, ?, ?, ?, ?, ?)", [name, email, hashed, phone || '', address || '', new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.get('/api/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    try {
        const user = await getQuery("SELECT id, name, email, role, phone, address FROM users WHERE id = ?", [req.session.userId]);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.post('/api/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency } = req.body;
    const orderNumber = 'RAD-' + Date.now();
    try {
        await runQuery(`INSERT INTO orders (userId, orderNumber, customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, date, dateFormatted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, orderNumber, customer, email, phone, address, country, JSON.stringify(items), subtotal, discount, discountAmount, shipping, total, currency || 'SAR', new Date().toISOString(), new Date().toLocaleDateString('ar-EG')]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.get('/api/coupons', async (req, res) => {
    try {
        const coupons = await allQuery("SELECT code, value, minOrder FROM coupons");
        res.json(coupons);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const rows = await allQuery("SELECT key, value_ar, value_en FROM settings");
        const settings = {};
        rows.forEach(row => { settings[row.key] = { ar: row.value_ar, en: row.value_en }; });
        res.json(settings);
    } catch (error) {
        res.status(500).json({});
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await getQuery("SELECT COUNT(*) as count FROM users WHERE role != 'admin'");
        const totalProducts = await getQuery("SELECT COUNT(*) as count FROM products");
        const totalOrders = await getQuery("SELECT COUNT(*) as count FROM orders");
        const totalRevenue = await getQuery("SELECT SUM(total) as sum FROM orders");
        res.json({ totalUsers: totalUsers.count, totalProducts: totalProducts.count, totalOrders: totalOrders.count, totalRevenue: totalRevenue.sum || 0 });
    } catch (error) {
        res.status(500).json({});
    }
});

app.get('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const messages = await allQuery("SELECT * FROM messages WHERE userId = ? OR isAdmin = 1 ORDER BY id ASC", [req.session.userId]);
        res.json(messages);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401);
    const { text_ar, text_en, isAdmin } = req.body;
    try {
        await runQuery(`INSERT INTO messages (userId, sender, text_ar, text_en, isAdmin, timestamp, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, req.session.user.name, text_ar || '', text_en || '', isAdmin ? 1 : 0, new Date().toLocaleTimeString('ar-EG'), new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🦅 الرعدي أونلاين يعمل على: http://localhost:${PORT}`);
    console.log(`👑 المدير: admin@raadi.com / admin123`);
    console.log(`========================================`);
});
