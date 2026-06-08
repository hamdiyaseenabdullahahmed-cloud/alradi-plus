const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static(__dirname));

const DB_DIR = path.join(__dirname, 'database');
const DB_PATH = path.join(DB_DIR, 'raadi.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

// إنشاء الجداول
db.serialize(() => {
    // جدول المستخدمين (مع تشفير)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'client',
        isActive INTEGER DEFAULT 1,
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

    console.log('✅ تم إنشاء الجداول');

    // التحقق من وجود مدير - إذا لم يوجد، لا نضيف شيئاً (انتظار التسجيل)
    db.get(`SELECT * FROM users WHERE role = 'admin' LIMIT 1`, (err, row) => {
        if (err) console.error(err);
        else if (!row) console.log('👑 لا يوجد مدير بعد - قم بتسجيل أول مدير');
        else console.log('✅ يوجد مدير في النظام');
    });
});

// ========== تسجيل مستخدم جديد ==========
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone, role } = req.body;
        
        if (!name || !email || !password) {
            return res.json({ success: false, error: 'جميع الحقول مطلوبة' });
        }
        
        // التحقق من وجود البريد
        db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, existing) => {
            if (err) return res.json({ success: false, error: err.message });
            if (existing) return res.json({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً' });
            
            // تشفير كلمة المرور
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // تحديد الدور: إذا كان أول مستخدم في النظام يصبح مدير
            db.get(`SELECT COUNT(*) as count FROM users`, [], (err2, countRow) => {
                let userRole = role || 'client';
                if (countRow.count === 0) userRole = 'admin';
                
                db.run(`INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)`,
                    [name, email, hashedPassword, phone || '', userRole],
                    function(err3) {
                        if (err3) return res.json({ success: false, error: err3.message });
                        res.json({ 
                            success: true, 
                            message: userRole === 'admin' ? 'تم تسجيل المدير بنجاح' : 'تم تسجيل الحساب بنجاح',
                            isAdmin: userRole === 'admin'
                        });
                    });
            });
        });
    } catch (err) {
        res.json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ========== تسجيل الدخول ==========
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        db.get(`SELECT * FROM users WHERE email = ? AND isActive = 1`, [email], async (err, user) => {
            if (err) return res.json({ success: false, error: err.message });
            if (!user) return res.json({ success: false, error: 'البريد الإلكتروني غير موجود' });
            
            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.json({ success: false, error: 'كلمة المرور غير صحيحة' });
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    loyalty_points: user.loyalty_points
                }
            });
        });
    } catch (err) {
        res.json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ========== API المنتجات ==========
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

// ========== إضافة منتج (للمدير فقط) ==========
app.post('/api/products', (req, res) => {
    const { name, price, stock, category, image, colors } = req.body;
    db.run(`INSERT INTO products (name, price, stock, category, image, colors) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, price, stock, category, image, JSON.stringify(colors)],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

// ========== إنشاء طلب ==========
app.post('/api/orders', (req, res) => {
    const { userId, userName, productId, productName, total } = req.body;
    db.run(`INSERT INTO orders (user_id, user_name, product_id, product_name, total, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, userName, productId, productName, total, 'pending'],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, orderId: this.lastID });
        });
});

// ========== الصفحات ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/client.html', (req, res) => res.sendFile(path.join(__dirname, 'client.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
});
