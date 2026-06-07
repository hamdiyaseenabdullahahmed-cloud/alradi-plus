// ============================================================
// الرعدي أونلاين | المتجر العالمي الأسطوري
// ملف الخادم الرئيسي (server.js) - الإصدار المستقر للسحابة
// المهندس: Senior Architect
// ============================================================

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ============================================================
// إعدادات السيرفر الأساسية
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

// جلسات آمنة للمستخدمين
app.use(session({
    secret: 'raadi-ultimate-super-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // أسبوع
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// إعداد قاعدة البيانات بشكل آمن (يصلح مشكلة SQLITE_ERROR)
// ============================================================
// استخدام متغير بيئة لتحديد مسار قاعدة البيانات في السحابة
const dbPath = process.env.DB_PATH || path.join(__dirname, 'raadi.db');
console.log(`📁 مسار قاعدة البيانات: ${dbPath}`);

// الاتصال بقاعدة البيانات (سيتم إنشاؤها تلقائياً)
const db = new sqlite3.Database(dbPath);

// دالة مساعدة لتنفيذ الأوامر مع معالجة الأخطاء
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('❌ خطأ في تنفيذ الاستعلام:', err.message);
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                console.error('❌ خطأ في جلب البيانات:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('❌ خطأ في جلب البيانات:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// ============================================================
// إنشاء الجداول (بدون أي أخطاء نحوية)
// ============================================================
const createTables = async () => {
    try {
        // جدول الأقسام
        await runQuery(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT NOT NULL,
            name_en TEXT NOT NULL,
            icon TEXT,
            createdAt TEXT
        )`);

        // جدول المنتجات
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

        // جدول المستخدمين
        await runQuery(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            phone TEXT,
            address TEXT,
            loyaltyPoints INTEGER DEFAULT 0,
            createdAt TEXT,
            lastLogin TEXT
        )`);

        // جدول الطلبات
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

        // جدول الرسائل (دردشة)
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

        // جدول كوبونات الخصم
        await runQuery(`CREATE TABLE IF NOT EXISTS coupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            value INTEGER NOT NULL,
            minOrder REAL DEFAULT 0,
            createdAt TEXT
        )`);

        // جدول إعدادات المتجر
        await runQuery(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_ar TEXT,
            value_en TEXT,
            updatedAt TEXT
        )`);

        console.log('✅ جميع الجداول تم إنشاؤها أو التحقق منها بنجاح');

        // ==================== إدخال البيانات الأولية ====================
        
        // إضافة الأقسام الافتراضية إذا لم تكن موجودة
        const categoryCount = await getQuery("SELECT COUNT(*) as count FROM categories");
        if (categoryCount.count === 0) {
            const defaultCategories = [
                ['هواتف', 'Phones', 'fa-mobile-alt'],
                ['عطور', 'Perfumes', 'fa-leaf'],
                ['إكسسوارات', 'Accessories', 'fa-headphones'],
                ['إلكترونيات', 'Electronics', 'fa-microchip'],
                ['ملابس', 'Clothing', 'fa-tshirt'],
                ['أحذية', 'Shoes', 'fa-shoe-prints']
            ];
            for (const cat of defaultCategories) {
                await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)", 
                    [cat[0], cat[1], cat[2], new Date().toISOString()]);
            }
            console.log('✅ تم إضافة الأقسام الافتراضية');
        }

        // إضافة المستخدم المدير إذا لم يكن موجوداً
        const adminCount = await getQuery("SELECT COUNT(*) as count FROM users WHERE email = 'admin@raadi.com'");
        if (adminCount.count === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await runQuery("INSERT INTO users (name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?)",
                ['المدير العام', 'admin@raadi.com', hashedPassword, 'admin', new Date().toISOString()]);
            console.log('✅ تم إضافة حساب المدير الافتراضي');
        }

        // إضافة منتجات افتراضية إذا لم تكن موجودة
        const productCount = await getQuery("SELECT COUNT(*) as count FROM products");
        if (productCount.count === 0) {
            const sampleProducts = [
                ['هاتف الرعدي برو X', 'Raadi Phone Pro X', 'هواتف', 2999, 3499, 15, 'أسود تيتانيوم', 'كاميرا 200 ميجابكسل، شاشة 6.8 بوصة', '200MP Camera, 6.8" Screen', 10, 'https://picsum.photos/id/0/300/300'],
                ['سامسونج جالكسي S24', 'Samsung Galaxy S24', 'هواتف', 4940, 5200, 12, 'رمادي تيتانيوم', 'قلم S-Pen، سعة 512 جيجا', 'S-Pen, 512GB', 7, 'https://picsum.photos/id/1/300/300'],
                ['سماعة أبل إيربودز', 'Apple AirPods Pro', 'إكسسوارات', 899, 1099, 18, 'أبيض', 'عزل ضوضاء، صوت محيطي', 'Noise Cancellation', 15, 'https://picsum.photos/id/3/300/300']
            ];
            for (const p of sampleProducts) {
                await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], new Date().toISOString()]);
            }
            console.log('✅ تم إضافة منتجات افتراضية');
        }

        // إضافة كوبونات افتراضية
        const couponCount = await getQuery("SELECT COUNT(*) as count FROM coupons");
        if (couponCount.count === 0) {
            await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", ['WELCOME20', 20, 0, new Date().toISOString()]);
            await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", ['SUMMER70', 70, 300, new Date().toISOString()]);
            console.log('✅ تم إضافة كوبونات افتراضية');
        }

        // إضافة إعدادات افتراضية
        const settingsCount = await getQuery("SELECT COUNT(*) as count FROM settings");
        if (settingsCount.count === 0) {
            const defaultSettings = [
                ['siteName', 'الرعدي أونلاين', 'Raadi Online'],
                ['domesticShipping', '15', '15'],
                ['internationalShipping', '50', '50'],
                ['whatsappNumber', '966500000000', '966500000000']
            ];
            for (const s of defaultSettings) {
                await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)",
                    [s[0], s[1], s[2], new Date().toISOString()]);
            }
            console.log('✅ تم إضافة الإعدادات الافتراضية');
        }

    } catch (error) {
        console.error('❌ خطأ فادح في إنشاء الجداول:', error.message);
    }
};

// تشغيل إنشاء الجداول
createTables();

// ============================================================
// مسارات API
// ============================================================

// جلب المنتجات (مع دعم اللغة)
app.get('/api/products', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const products = await allQuery("SELECT * FROM products ORDER BY id DESC");
        
        const formattedProducts = products.map(p => ({
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
        
        res.json(formattedProducts);
    } catch (error) {
        console.error('خطأ في جلب المنتجات:', error);
        res.status(500).json({ error: 'حدث خطأ في جلب المنتجات' });
    }
});

// جلب الأقسام
app.get('/api/categories', async (req, res) => {
    try {
        const lang = req.query.lang || 'ar';
        const categories = await allQuery("SELECT name_ar, name_en FROM categories");
        const formatted = categories.map(c => ({ 
            name: lang === 'ar' ? c.name_ar : c.name_en 
        }));
        res.json(formatted);
    } catch (error) {
        console.error('خطأ في جلب الأقسام:', error);
        res.status(500).json([]);
    }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = await getQuery("SELECT * FROM users WHERE email = ?", [email]);
        
        if (!user) {
            return res.status(401).json({ error: 'البريد الإلكتروني غير مسجل' });
        }
        
        const match = bcrypt.compareSync(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }
        
        req.session.userId = user.id;
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };
        
        await runQuery("UPDATE users SET lastLogin = ? WHERE id = ?", [new Date().toISOString(), user.id]);
        
        res.json({ success: true, user: req.session.user });
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'حدث خطأ في السيرفر' });
    }
});

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    
    try {
        const existing = await getQuery("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) {
            return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
        }
        
        const hashedPassword = bcrypt.hashSync(password, 10);
        await runQuery(
            "INSERT INTO users (name, email, password, phone, address, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            [name, email, hashedPassword, phone || '', address || '', new Date().toISOString()]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ error: 'حدث خطأ في التسجيل' });
    }
});

// جلب بيانات المستخدم الحالي
app.get('/api/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مسجل' });
    }
    
    try {
        const user = await getQuery("SELECT id, name, email, role, phone, address, loyaltyPoints FROM users WHERE id = ?", [req.session.userId]);
        res.json(user);
    } catch (error) {
        console.error('خطأ في جلب بيانات المستخدم:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// إضافة منتج (للمدير فقط)
app.post('/api/products', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const { name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image } = req.body;
    
    try {
        await runQuery(
            `INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt, updatedAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name_ar, name_en, category, price, oldPrice || 0, discount || 0, color || '', features_ar || '', features_en || '', stock || 0, image || '', new Date().toISOString(), new Date().toISOString()]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة المنتج:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// إنشاء طلب جديد
app.post('/api/orders', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'الرجاء تسجيل الدخول أولاً' });
    }
    
    const { customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency } = req.body;
    const orderNumber = 'RAD-' + Date.now();
    const dateFormatted = new Date().toLocaleDateString('ar-EG');
    
    try {
        await runQuery(
            `INSERT INTO orders (userId, orderNumber, customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, date, dateFormatted) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, orderNumber, customer, email, phone, address, country, JSON.stringify(items), subtotal, discount, discountAmount, shipping, total, currency || 'SAR', new Date().toISOString(), dateFormatted]
        );
        
        // إرسال إشعار واتساب للمدير
        try {
            const settings = await getQuery("SELECT value_ar FROM settings WHERE key = 'whatsappNumber'");
            const whatsappNumber = settings?.value_ar || '966500000000';
            const message = `🦅 طلب جديد في الرعدي أونلاين\n📋 رقم: ${orderNumber}\n👤 العميل: ${customer}\n📞 ${phone}\n📍 ${address}\n💰 الإجمالي: ${total} ${currency}\n🔗 https://alradi-plus.onrender.com`;
            console.log(`📱 إشعار واتساب: ${message}`);
        } catch (waError) {
            console.log('خطأ في إرسال الواتساب:', waError.message);
        }
        
        res.json({ success: true, orderNumber });
    } catch (error) {
        console.error('خطأ في إنشاء الطلب:', error);
        res.status(500).json({ error: 'حدث خطأ في إنشاء الطلب' });
    }
});

// جلب كوبونات الخصم
app.get('/api/coupons', async (req, res) => {
    try {
        const coupons = await allQuery("SELECT code, value, minOrder FROM coupons");
        res.json(coupons);
    } catch (error) {
        console.error('خطأ في جلب الكوبونات:', error);
        res.status(500).json([]);
    }
});

// جلب إعدادات المتجر
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await allQuery("SELECT key, value_ar, value_en FROM settings");
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = { ar: row.value_ar, en: row.value_en };
        });
        res.json(settings);
    } catch (error) {
        console.error('خطأ في جلب الإعدادات:', error);
        res.status(500).json({});
    }
});

// جلب الإحصائيات (للمدير)
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await getQuery("SELECT COUNT(*) as count FROM users WHERE role != 'admin'");
        const totalProducts = await getQuery("SELECT COUNT(*) as count FROM products");
        const totalOrders = await getQuery("SELECT COUNT(*) as count FROM orders");
        const totalRevenue = await getQuery("SELECT SUM(total) as sum FROM orders");
        
        res.json({
            totalUsers: totalUsers.count,
            totalProducts: totalProducts.count,
            totalOrders: totalOrders.count,
            totalRevenue: totalRevenue.sum || 0,
            todayRevenue: 0,
            lowStock: 0
        });
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({});
    }
});

// جلب الطلبات (للمدير)
app.get('/api/orders', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json([]);
    }
    
    try {
        const orders = await allQuery("SELECT * FROM orders ORDER BY id DESC");
        orders.forEach(o => {
            o.items = JSON.parse(o.items);
        });
        res.json(orders);
    } catch (error) {
        console.error('خطأ في جلب الطلبات:', error);
        res.status(500).json([]);
    }
});

// جلب المستخدمين (للمدير)
app.get('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json([]);
    }
    
    try {
        const users = await allQuery("SELECT id, name, email, role, phone, address, createdAt FROM users WHERE role != 'admin'");
        res.json(users);
    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json([]);
    }
});

// ============================================================
// مسارات الصفحات
// ============================================================
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// تشغيل الخادم
// ============================================================
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🦅 الرعدي أونلاين | المتجر العالمي الأسطوري`);
    console.log(`🚀 الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`👑 حساب المدير: admin@raadi.com / admin123`);
    console.log(`========================================`);
});
