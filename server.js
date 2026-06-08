const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static(__dirname));

// إنشاء مجلد قاعدة البيانات
const DB_DIR = path.join(__dirname, 'database');
const DB_PATH = path.join(DB_DIR, 'raadi.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

console.log(`📁 قاعدة البيانات: ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH);

// إنشاء الجداول
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'client',
        loyalty_points INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        old_price REAL,
        stock INTEGER DEFAULT 0,
        category TEXT,
        image TEXT,
        colors TEXT,
        rating REAL DEFAULT 5,
        sold_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        product_id INTEGER,
        product_name TEXT,
        total REAL,
        status TEXT DEFAULT 'pending',
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // إضافة المستخدمين الافتراضيين إذا لم يكونوا موجودين
    db.get(`SELECT * FROM users WHERE email = 'admin@system.com'`, (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)`,
                ['مدير النظام', 'admin@system.com', 'admin123', '0500000000', 'admin']);
            db.run(`INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)`,
                ['أحمد العميل', 'ahmed@client.com', '123456', '0555123456', 'client']);
            console.log('✅ تم إضافة المستخدمين الافتراضيين');
        }
    });

    // إضافة منتجات افتراضية
    db.get(`SELECT * FROM products LIMIT 1`, (err, row) => {
        if (!row) {
            const products = [
                ['سماعات لاسلكية برو', 299, 450, 50, 'electronics', 'https://picsum.photos/id/1/300/300', '["أسود","أبيض","أزرق"]', 4.8],
                ['ساعة ذكية رياضية', 499, 699, 30, 'electronics', 'https://picsum.photos/id/2/300/300', '["أسود","فضي","ذهبي"]', 4.6],
                ['حقيبة جلدية فاخرة', 799, 1299, 15, 'fashion', 'https://picsum.photos/id/3/300/300', '["بني","أسود"]', 4.9],
                ['قلم ذكي للكتابة', 149, 249, 100, 'office', 'https://picsum.photos/id/4/300/300', '["فضي","ذهبي"]', 4.5]
            ];
            products.forEach(p => {
                db.run(`INSERT INTO products (name, price, old_price, stock, category, image, colors, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, p);
            });
            console.log('✅ تم إضافة المنتجات الافتراضية');
        }
    });
});

// ========== تسجيل الدخول ==========
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT id, name, email, phone, role, loyalty_points FROM users WHERE email = ? AND password = ?`, 
        [email, password], (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            if (user) {
                res.json({ success: true, user: user });
            } else {
                res.json({ success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
            }
        });
});

// ========== API المنتجات ==========
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products ORDER BY id DESC`, (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, data: rows });
    });
});

// ========== إنشاء طلب ==========
app.post('/api/orders', (req, res) => {
    const { userId, userName, productId, productName, total } = req.body;
    db.run(`INSERT INTO orders (user_id, user_name, product_id, product_name, total, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, userName, productId, productName, total, 'pending'],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, orderId: this.lastID });
        });
});

// ========== جلب طلبات المستخدم ==========
app.get('/api/orders/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT * FROM orders WHERE user_id = ? ORDER BY date DESC`, [userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, data: rows });
    });
});

// ========== جلب جميع الطلبات (للمدير) ==========
app.get('/api/orders', (req, res) => {
    db.all(`SELECT * FROM orders ORDER BY date DESC`, (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, data: rows });
    });
});

// ========== الصفحات ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/client.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'client.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// تشغيل السيرفر
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
});
