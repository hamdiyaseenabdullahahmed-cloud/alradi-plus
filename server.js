// ============================================================
// ملف الخادم الخارق - server.js
// متجر الرعدي أونلاين - النسخة الأسطورية النهائية
// ============================================================

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------- إعدادات السيرفر ----------------------------
app.use(session({
    secret: 'raadi-ultimate-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // أسبوع كامل
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ---------------------------- إعداد قاعدة بيانات SQLite الفائقة ----------------------------
const db = new sqlite3.Database('./raadi.db');
db.serialize(() => {
    // جدول المنتجات العملاق
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        oldPrice REAL,
        discount INTEGER DEFAULT 0,
        color TEXT,
        features TEXT,
        stock INTEGER DEFAULT 0,
        image TEXT,
        rating REAL DEFAULT 0,
        createdAt TEXT
    )`);

    // جدول المستخدمين المتطور
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        phone TEXT,
        address TEXT,
        createdAt TEXT
    )`);

    // جدول الطلبات الشامل
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        orderNumber TEXT UNIQUE,
        customer TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        country TEXT,
        items TEXT,
        subtotal REAL,
        discount INTEGER,
        discountAmount REAL,
        shipping REAL,
        total REAL,
        status TEXT,
        date TEXT,
        dateFormatted TEXT
    )`);

    // جدول الرسائل للدردشة الحية
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        sender TEXT,
        text TEXT,
        isAdmin INTEGER DEFAULT 0,
        timestamp TEXT,
        date TEXT
    )`);

    // جدول كوبونات الخصم
    db.run(`CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        value INTEGER,
        createdAt TEXT
    )`);

    // جدول إعدادات المتجر
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // ---------------------------- إدخال البيانات الافتراضية ----------------------------
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (row && row.count === 0) {
            const sampleProducts = [
                ['هاتف الرعدي الذكي برو X', 'هواتف', 2999, 3499, 15, 'أسود تيتانيوم', 'كاميرا 200 ميجابكسل، شاشة 6.8 بوصة، معالج فائق', 10, 'https://picsum.photos/id/0/300/300'],
                ['سامسونج جالكسي S24 الترا', 'هواتف', 4940, 5200, 12, 'رمادي تيتانيوم', 'كاميرا 200 ميجابكسل، قلم S-Pen، سعة 512 جيجا', 7, 'https://picsum.photos/id/1/300/300'],
                ['سماعة أبل إيربودز برو', 'إكسسوارات', 899, 1099, 18, 'أبيض ناصع', 'تقنية عزل الضوضاء، صوت محيطي', 15, 'https://picsum.photos/id/3/300/300'],
                ['عطر بلو دي شانيل الأصلي', 'عطور', 4140, 4600, 10, 'شفاف كحلي غامق', 'رائحة خشبية فاخرة، تدوم طويلاً', 5, 'https://picsum.photos/id/2/300/300'],
                ['ساعة أبل الترا 2', 'إكسسوارات', 2799, 3299, 15, 'تيتانيوم', 'مقاومة للماء، بطارية تدوم 36 ساعة', 8, 'https://picsum.photos/id/4/300/300'],
                ['عطر توم فورد أود وود', 'عطور', 550, 650, 15, 'بني داكن', 'رائحة خشبية دافئة، ثبات طويل', 12, 'https://picsum.photos/id/5/300/300']
            ];
            const stmt = db.prepare("INSERT INTO products (name, category, price, oldPrice, discount, color, features, stock, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            sampleProducts.forEach(p => stmt.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], new Date().toISOString()));
            stmt.finalize();
        }
    });

    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row && row.count === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            db.run("INSERT INTO users (name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?)", ['المدير العام', 'admin@raadi.com', hashedPassword, 'admin', new Date().toISOString()]);
        }
    });

    db.get("SELECT COUNT(*) as count FROM coupons", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO coupons (code, value, createdAt) VALUES (?, ?, ?)", ['WELCOME20', 20, new Date().toISOString()]);
            db.run("INSERT INTO coupons (code, value, createdAt) VALUES (?, ?, ?)", ['SUMMER70', 70, new Date().toISOString()]);
        }
    });

    db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO settings (key, value) VALUES (?, ?)", ['domesticShipping', '15']);
            db.run("INSERT INTO settings (key, value) VALUES (?, ?)", ['internationalShipping', '50']);
            db.run("INSERT INTO settings (key, value) VALUES (?, ?)", ['returnPolicy', 'يمكن استرجاع المنتج خلال 14 يوماً في حالة وجود عيب صناعي. يمكن الاستبدال خلال 7 أيام.']);
        }
    });
});

// ---------------------------- دوال مساعدة لقاعدة البيانات ----------------------------
function queryAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// ---------------------------- مسارات API العامة ----------------------------
app.get('/api/products', async (req, res) => {
    try {
        const products = await queryAsync("SELECT * FROM products ORDER BY id DESC");
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب المنتجات' });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const products = await queryAsync("SELECT DISTINCT category FROM products");
        const categories = products.map(p => p.category);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الأقسام' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const rows = await queryAsync("SELECT key, value FROM settings");
        const settings = {};
        rows.forEach(row => { settings[row.key] = row.value; });
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الإعدادات' });
    }
});

app.post('/api/settings', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    try {
        for (const [key, value] of Object.entries(req.body)) {
            await runAsync("UPDATE settings SET value = ? WHERE key = ?", [value.toString(), key]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حفظ الإعدادات' });
    }
});

// ---------------------------- مسارات المصادقة المتطورة ----------------------------
app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    try {
        const existing = await getAsync("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
        const hashedPassword = bcrypt.hashSync(password, 10);
        await runAsync("INSERT INTO users (name, email, password, phone, address, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)", 
            [name, email, hashedPassword, phone || '', address || '', 'user', new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في التسجيل' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await getAsync("SELECT * FROM users WHERE email = ?", [email]);
        if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        const match = bcrypt.compareSync(password, user.password);
        if (!match) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        req.session.userId = user.id;
        req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
        res.json({ success: true, user: req.session.user });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تسجيل الدخول' });
    }
});

app.get('/api/me', (req, res) => {
    if (req.session.userId) return res.json(req.session.user);
    res.status(401).json({ error: 'غير مسجل' });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ---------------------------- مسارات المنتجات (للمدير) ----------------------------
app.post('/api/products', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { name, category, price, oldPrice, discount, color, features, stock, image } = req.body;
    try {
        const result = await runAsync(`INSERT INTO products (name, category, price, oldPrice, discount, color, features, stock, image, createdAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [name, category, price, oldPrice || 0, discount || 0, color || '', features || '', stock || 0, image || 'https://picsum.photos/id/20/300/300', new Date().toISOString()]);
        res.json({ success: true, id: result.lastID });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة المنتج' });
    }
});

app.put('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const updates = req.body;
    try {
        const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), id];
        await runAsync(`UPDATE products SET ${setClause} WHERE id = ?`, values);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث المنتج' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    try {
        await runAsync("DELETE FROM products WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف المنتج' });
    }
});

// ---------------------------- مسارات الطلبات ----------------------------
app.post('/api/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    const { customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total } = req.body;
    const orderNumber = 'RAD-' + Date.now();
    try {
        await runAsync(`INSERT INTO orders (userId, orderNumber, customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, status, date, dateFormatted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, orderNumber, customer, email, phone, address, country, JSON.stringify(items), subtotal, discount, discountAmount, shipping, total, 'قيد المعالجة', new Date().toISOString(), new Date().toLocaleDateString('ar-EG')]);
        
        // تقليل المخزون
        for (const item of items) {
            const product = await getAsync("SELECT stock FROM products WHERE id = ?", [item.id]);
            if (product) {
                await runAsync("UPDATE products SET stock = ? WHERE id = ?", [product.stock - item.quantity, item.id]);
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إنشاء الطلب' });
    }
});

app.get('/api/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        let orders;
        if (req.session.user.role === 'admin') {
            orders = await queryAsync("SELECT * FROM orders ORDER BY id DESC");
        } else {
            orders = await queryAsync("SELECT * FROM orders WHERE userId = ? ORDER BY id DESC", [req.session.userId]);
        }
        orders.forEach(o => { o.items = JSON.parse(o.items); });
        res.json(orders);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const id = parseInt(req.params.id);
    const { status } = req.body;
    try {
        await runAsync("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث الحالة' });
    }
});

// ---------------------------- مسارات المستخدمين ----------------------------
app.get('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const users = await queryAsync("SELECT id, name, email, role, phone, address, createdAt FROM users WHERE role != 'admin'");
        res.json(users);
    } catch (error) {
        res.status(500).json([]);
    }
});

// ---------------------------- مسارات الكوبونات ----------------------------
app.get('/api/coupons', async (req, res) => {
    try {
        const coupons = await queryAsync("SELECT code, value FROM coupons");
        res.json(coupons);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/coupons', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const { code, value } = req.body;
    try {
        await runAsync("INSERT INTO coupons (code, value, createdAt) VALUES (?, ?, ?)", [code.toUpperCase(), value, new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'الكود موجود مسبقاً' });
    }
});

app.delete('/api/coupons/:code', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const code = req.params.code;
    try {
        await runAsync("DELETE FROM coupons WHERE code = ?", [code]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الحذف' });
    }
});

// ---------------------------- مسارات الدردشة الحية ----------------------------
app.get('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        let messages;
        if (req.session.user.role === 'admin') {
            messages = await queryAsync("SELECT * FROM messages ORDER BY id DESC LIMIT 100");
        } else {
            messages = await queryAsync("SELECT * FROM messages WHERE userId = ? OR isAdmin = 1 ORDER BY id ASC", [req.session.userId]);
        }
        res.json(messages);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401);
    const { text, isAdmin } = req.body;
    try {
        await runAsync(`INSERT INTO messages (userId, sender, text, isAdmin, timestamp, date) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [req.session.userId, req.session.user.name, text, isAdmin ? 1 : 0, new Date().toLocaleTimeString('ar-EG'), new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إرسال الرسالة' });
    }
});

// ---------------------------- مسارات الإحصائيات ----------------------------
app.get('/api/stats', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    try {
        const totalUsers = await getAsync("SELECT COUNT(*) as count FROM users WHERE role != 'admin'");
        const totalProducts = await getAsync("SELECT COUNT(*) as count FROM products");
        const totalOrders = await getAsync("SELECT COUNT(*) as count FROM orders");
        const totalRevenue = await getAsync("SELECT SUM(total) as sum FROM orders");
        const lowStock = await getAsync("SELECT COUNT(*) as count FROM products WHERE stock < 5");
        const today = new Date().toDateString();
        const todayRevenue = await getAsync("SELECT SUM(total) as sum FROM orders WHERE date LIKE ?", [today + '%']);
        
        res.json({
            totalUsers: totalUsers.count,
            totalProducts: totalProducts.count,
            totalOrders: totalOrders.count,
            totalRevenue: totalRevenue.sum || 0,
            todayRevenue: todayRevenue.sum || 0,
            lowStock: lowStock.count
        });
    } catch (error) {
        res.status(500).json({});
    }
});

// ---------------------------- صفحات الواجهة ----------------------------
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
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
    console.log(`💾 قاعدة البيانات: SQLite (raadi.db)`);
    console.log(`========================================`);
});
