// ==============================================
// server.js - الخادم الخلفي لمتجر الرعدي أونلاين
// متوافق مع Render.com وبيئات السحابة
// ==============================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static(__dirname)); // لخدمة index.html و admin.html

// ==============================================
// مسار قاعدة البيانات (داخل المشروع - متوافق مع السحابة)
// ==============================================
const DB_DIR = path.join(__dirname, 'database');
const DB_PATH = path.join(DB_DIR, 'raadi.db');
const BACKUP_PATH = path.join(__dirname, 'backups');

// إنشاء المجلدات إذا لم تكن موجودة
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_PATH)) {
    fs.mkdirSync(BACKUP_PATH, { recursive: true });
}

console.log(`📁 مجلد قاعدة البيانات: ${DB_DIR}`);
console.log(`💾 مجلد النسخ الاحتياطي: ${BACKUP_PATH}`);

// فتح قاعدة البيانات
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ خطأ في فتح قاعدة البيانات:', err.message);
    } else {
        console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
        initDatabase();
    }
});

// إنشاء الجداول
function initDatabase() {
    // جدول المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'client',
        loyalty_points INTEGER DEFAULT 0,
        tier TEXT DEFAULT 'bronze',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // جدول المنتجات
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

    // جدول الطلبات
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        product_id INTEGER,
        product_name TEXT,
        total REAL,
        status TEXT DEFAULT 'pending',
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // جدول سلة المحذوفات
    db.run(`CREATE TABLE IF NOT EXISTS deleted_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT,
        item_data TEXT,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // جدول سجل الأخطاء
    db.run(`CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context TEXT,
        message TEXT,
        stack TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // إنشاء فهارس لتحسين الأداء
    db.run(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

    console.log('✅ تم إنشاء جميع الجداول والفهارس');
    
    // إضافة بيانات افتراضية إذا كانت الجداول فارغة
    seedDefaultData();
}

// إضافة بيانات افتراضية
function seedDefaultData() {
    // إضافة مستخدم افتراضي إذا لم يوجد
    db.get(`SELECT * FROM users WHERE email = 'admin@system.com'`, [], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)`,
                ['مدير النظام', 'admin@system.com', 'admin123', '0500000000', 'admin']);
            db.run(`INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)`,
                ['أحمد العميل', 'ahmed@client.com', '123456', '0555123456', 'client']);
            console.log('✅ تم إضافة بيانات افتراضية');
        }
    });
    
    // إضافة منتجات افتراضية
    db.get(`SELECT * FROM products LIMIT 1`, [], (err, row) => {
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
            console.log('✅ تم إضافة منتجات افتراضية');
        }
    });
}

// ==============================================
// نظام النسخ الاحتياطي التلقائي (معتمد على المسار الجديد)
// ==============================================
function autoBackup() {
    const backupFile = path.join(BACKUP_PATH, `raadi_backup_${Date.now()}.db`);
    fs.copyFile(DB_PATH, backupFile, (err) => {
        if (err) {
            console.error('❌ فشل النسخ الاحتياطي:', err);
        } else {
            console.log(`✅ تم إنشاء نسخة احتياطية: ${backupFile}`);
            
            // حذف النسخ القديمة (الاحتفاظ بآخر 5 نسخ فقط)
            fs.readdir(BACKUP_PATH, (err, files) => {
                if (err) return;
                const backups = files.filter(f => f.startsWith('raadi_backup_')).sort();
                while (backups.length > 5) {
                    const oldBackup = backups.shift();
                    fs.unlink(path.join(BACKUP_PATH, oldBackup), () => {});
                }
            });
        }
    });
}

// تشغيل النسخ الاحتياطي كل 6 ساعات (أقل ضغطاً على السيرفر المجاني)
setInterval(autoBackup, 6 * 60 * 60 * 1000);

// ==============================================
// تسجيل الأخطاء
// ==============================================
function logError(error, context) {
    const errorMsg = error.message || error;
    const errorStack = error.stack || '';
    
    db.run(`INSERT INTO error_logs (context, message, stack) VALUES (?, ?, ?)`, 
        [context, errorMsg, errorStack], (err) => {
        if (err) console.error('خطأ في تسجيل الخطأ:', err);
    });
    
    console.error(`🚨 [${context}] ${errorMsg}`);
}

// ==============================================
// API Routes
// ==============================================

// الصفحة الرئيسية - إرجاع index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// لوحة المدير
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// الحصول على جميع المنتجات
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products ORDER BY id DESC`, [], (err, rows) => {
        if (err) {
            logError(err, 'GET /api/products');
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, data: rows });
    });
});

// إضافة منتج جديد
app.post('/api/products', (req, res) => {
    const { name, price, stock, category, image, colors } = req.body;
    db.run(`INSERT INTO products (name, price, stock, category, image, colors) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, price, stock, category, image, JSON.stringify(colors)],
        function(err) {
            if (err) {
                logError(err, 'POST /api/products');
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        });
});

// تحديث منتج
app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const { name, price, stock } = req.body;
    db.run(`UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?`,
        [name, price, stock, id], function(err) {
            if (err) {
                logError(err, `PUT /api/products/${id}`);
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, changes: this.changes });
        });
});

// حذف منتج
app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    
    db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, product) => {
        if (err) {
            logError(err, `DELETE /api/products/${id}`);
            return res.status(500).json({ success: false, error: err.message });
        }
        if (product) {
            db.run(`INSERT INTO deleted_items (item_type, item_data) VALUES (?, ?)`,
                ['product', JSON.stringify(product)]);
        }
        
        db.run(`DELETE FROM products WHERE id = ?`, [id], function(err2) {
            if (err2) {
                logError(err2, `DELETE /api/products/${id}`);
                return res.status(500).json({ success: false, error: err2.message });
            }
            res.json({ success: true, deleted: this.changes });
        });
    });
});

// تسجيل دخول المستخدم
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT id, name, email, phone, role, loyalty_points as loyaltyPoints FROM users WHERE email = ? AND password = ?`, 
        [email, password], (err, user) => {
            if (err) {
                logError(err, 'POST /api/login');
                return res.status(500).json({ success: false, error: err.message });
            }
            if (user) {
                res.json({ success: true, user });
            } else {
                res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
            }
        });
});

// إنشاء طلب جديد
app.post('/api/orders', (req, res) => {
    const { userId, userName, productId, productName, total } = req.body;
    db.run(`INSERT INTO orders (user_id, user_name, product_id, product_name, total, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, userName, productId, productName, total, 'pending'],
        function(err) {
            if (err) {
                logError(err, 'POST /api/orders');
                return res.status(500).json({ success: false, error: err.message });
            }
            db.run(`UPDATE products SET sold_count = sold_count + 1 WHERE id = ?`, [productId]);
            res.json({ success: true, orderId: this.lastID });
        });
});

// إحصائيات لوحة التحكم
app.get('/api/stats', (req, res) => {
    const stats = {};
    
    db.get(`SELECT COUNT(*) as count FROM products`, [], (err, row) => {
        if (err) {
            logError(err, 'GET /api/stats');
            return res.status(500).json({ success: false, error: err.message });
        }
        stats.products = row.count;
        
        db.get(`SELECT COUNT(*) as count FROM orders`, [], (err2, row2) => {
            stats.orders = row2.count;
            
            db.get(`SELECT SUM(total) as total FROM orders`, [], (err3, row3) => {
                stats.revenue = row3.total || 0;
                res.json({ success: true, stats });
            });
        });
    });
});

// ==============================================
// تشغيل السيرفر
// ==============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 خادم الرعدي أونلاين يعمل على المنفذ ${PORT}`);
    console.log(`📁 قاعدة البيانات: ${DB_PATH}`);
    console.log(`💾 النسخ الاحتياطي: ${BACKUP_PATH}`);
    console.log(`🌐 افتح المتصفح على: http://localhost:${PORT}`);
});

// ==============================================
// إغلاق آمن
// ==============================================
process.on('SIGINT', () => {
    console.log('🛑 إغلاق السيرفر...');
    db.close((err) => {
        if (err) console.error('خطأ في إغلاق قاعدة البيانات:', err);
        console.log('✅ تم إغلاق قاعدة البيانات');
        process.exit(0);
    });
});
