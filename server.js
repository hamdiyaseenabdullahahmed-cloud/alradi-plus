// ==============================================
// server.js - الخادم الخلفي لمتجر الرعدي أونلاين
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

// ==============================================
// مسار قاعدة البيانات الثابت (Auto-Backup)
// ==============================================
const DB_PATH = '/var/lib/sqlite/raadi.db';
const BACKUP_PATH = '/var/backups/raadi/';

// التأكد من وجود مجلد النسخ الاحتياطي
if (!fs.existsSync(BACKUP_PATH)) {
    fs.mkdirSync(BACKUP_PATH, { recursive: true });
}

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

    // إنشاء فهارس لتحسين الأداء (Indexing)
    db.run(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

    console.log('✅ تم إنشاء جميع الجداول والفهارس');
}

// ==============================================
// نظام النسخ الاحتياطي التلقائي (Auto-Backup)
// ==============================================
function autoBackup() {
    const backupFile = path.join(BACKUP_PATH, `raadi_backup_${Date.now()}.db`);
    fs.copyFile(DB_PATH, backupFile, (err) => {
        if (err) {
            logError(err, 'Auto Backup');
        } else {
            console.log(`✅ تم إنشاء نسخة احتياطية: ${backupFile}`);
            
            // حذف النسخ القديمة (الاحتفاظ بآخر 7 نسخ فقط)
            fs.readdir(BACKUP_PATH, (err, files) => {
                if (err) return;
                const backups = files.filter(f => f.startsWith('raadi_backup_')).sort();
                while (backups.length > 7) {
                    const oldBackup = backups.shift();
                    fs.unlink(path.join(BACKUP_PATH, oldBackup), () => {});
                }
            });
        }
    });
}

// تشغيل النسخ الاحتياطي كل 24 ساعة
setInterval(autoBackup, 24 * 60 * 60 * 1000);

// ==============================================
// تسجيل الأخطاء (Zero-Failure Protocol)
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
// API Routes (مع Try-Catch لتغليف الأخطاء)
// ==============================================

// الحصول على جميع المنتجات
app.get('/api/products', async (req, res) => {
    try {
        db.all(`SELECT * FROM products ORDER BY id DESC`, [], (err, rows) => {
            if (err) throw err;
            res.json({ success: true, data: rows });
        });
    } catch (error) {
        logError(error, 'GET /api/products');
        res.status(500).json({ success: false, error: 'خطأ في جلب المنتجات' });
    }
});

// إضافة منتج جديد
app.post('/api/products', async (req, res) => {
    try {
        const { name, price, stock, category, image, colors } = req.body;
        db.run(`INSERT INTO products (name, price, stock, category, image, colors) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, price, stock, category, image, JSON.stringify(colors)],
            function(err) {
                if (err) throw err;
                res.json({ success: true, id: this.lastID });
            });
    } catch (error) {
        logError(error, 'POST /api/products');
        res.status(500).json({ success: false, error: 'خطأ في إضافة المنتج' });
    }
});

// تحديث منتج
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, stock } = req.body;
        db.run(`UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?`,
            [name, price, stock, id], function(err) {
                if (err) throw err;
                res.json({ success: true, changes: this.changes });
            });
    } catch (error) {
        logError(error, `PUT /api/products/${req.params.id}`);
        res.status(500).json({ success: false, error: 'خطأ في تحديث المنتج' });
    }
});

// حذف منتج (نقل إلى سلة المحذوفات)
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // جلب المنتج قبل الحذف
        db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, product) => {
            if (err) throw err;
            if (product) {
                // نقل إلى سلة المحذوفات
                db.run(`INSERT INTO deleted_items (item_type, item_data) VALUES (?, ?)`,
                    ['product', JSON.stringify(product)], (err2) => {
                        if (err2) throw err2;
                    });
            }
            
            // حذف من جدول المنتجات
            db.run(`DELETE FROM products WHERE id = ?`, [id], function(err3) {
                if (err3) throw err3;
                res.json({ success: true, deleted: this.changes });
            });
        });
    } catch (error) {
        logError(error, `DELETE /api/products/${req.params.id}`);
        res.status(500).json({ success: false, error: 'خطأ في حذف المنتج' });
    }
});

// استعادة منتج من سلة المحذوفات
app.post('/api/restore/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        db.get(`SELECT * FROM deleted_items WHERE id = ?`, [itemId], (err, item) => {
            if (err) throw err;
            if (item && item.item_type === 'product') {
                const product = JSON.parse(item.item_data);
                db.run(`INSERT INTO products (name, price, stock, category, image, colors) VALUES (?, ?, ?, ?, ?, ?)`,
                    [product.name, product.price, product.stock, product.category, product.image, product.colors],
                    function(err2) {
                        if (err2) throw err2;
                        db.run(`DELETE FROM deleted_items WHERE id = ?`, [itemId]);
                        res.json({ success: true, restored: true });
                    });
            }
        });
    } catch (error) {
        logError(error, `POST /api/restore/${req.params.itemId}`);
        res.status(500).json({ success: false, error: 'خطأ في الاستعادة' });
    }
});

// تسجيل دخول المستخدم
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, [email, password], (err, user) => {
            if (err) throw err;
            if (user) {
                res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
            } else {
                res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
            }
        });
    } catch (error) {
        logError(error, 'POST /api/login');
        res.status(500).json({ success: false, error: 'خطأ في تسجيل الدخول' });
    }
});

// إنشاء طلب جديد
app.post('/api/orders', async (req, res) => {
    try {
        const { userId, userName, productId, productName, total } = req.body;
        db.run(`INSERT INTO orders (user_id, user_name, product_id, product_name, total, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, userName, productId, productName, total, 'pending'],
            function(err) {
                if (err) throw err;
                
                // تحديث عدد مبيعات المنتج
                db.run(`UPDATE products SET sold_count = sold_count + 1 WHERE id = ?`, [productId]);
                
                res.json({ success: true, orderId: this.lastID });
            });
    } catch (error) {
        logError(error, 'POST /api/orders');
        res.status(500).json({ success: false, error: 'خطأ في إنشاء الطلب' });
    }
});

// الحصول على إحصائيات لوحة التحكم
app.get('/api/stats', async (req, res) => {
    try {
        const stats = {};
        
        // عدد المنتجات
        db.get(`SELECT COUNT(*) as count FROM products`, [], (err, row) => {
            stats.products = row.count;
        });
        
        // عدد الطلبات
        db.get(`SELECT COUNT(*) as count FROM orders`, [], (err, row) => {
            stats.orders = row.count;
        });
        
        // إجمالي الإيرادات
        db.get(`SELECT SUM(total) as total FROM orders`, [], (err, row) => {
            stats.revenue = row.total || 0;
            res.json({ success: true, stats });
        });
    } catch (error) {
        logError(error, 'GET /api/stats');
        res.status(500).json({ success: false, error: 'خطأ في جلب الإحصائيات' });
    }
});

// ==============================================
// تشغيل السيرفر
// ==============================================
app.listen(PORT, () => {
    console.log(`🚀 خادم الرعدي أونلاين يعمل على المنفذ ${PORT}`);
    console.log(`📁 قاعدة البيانات: ${DB_PATH}`);
    console.log(`💾 النسخ الاحتياطي: ${BACKUP_PATH}`);
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