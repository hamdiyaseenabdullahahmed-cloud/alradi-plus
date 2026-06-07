// ====================================================================
// الرعدي أونلاين | المتجر العالمي الأسطوري
// ملف الخادم الرئيسي (server.js) - الإصدار المستقر الكامل
// المهندس: Senior Architect
// ====================================================================

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ====================================================================
// إعدادات السيرفر الأساسية
// ====================================================================
const app = express();
const PORT = process.env.PORT || 3000;

// جلسات آمنة للمستخدمين
app.use(session({
    secret: 'raadi-ultimate-super-secret-2026-enterprise',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // أسبوع كامل
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ====================================================================
// إعداد قاعدة البيانات بشكل آمن (إصلاح مشكلة المسار)
// ====================================================================
const dbPath = process.env.DB_PATH || path.join(__dirname, 'raadi.db');
console.log(`📁 مسار قاعدة البيانات: ${dbPath}`);

const db = new sqlite3.Database(dbPath);

// دوال مساعدة لقاعدة البيانات مع معالجة الأخطاء
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

// ====================================================================
// إنشاء جميع الجداول (بدون أخطاء نحوية)
// ====================================================================
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

        // جدول المنتجات المتقدم
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
            views INTEGER DEFAULT 0,
            createdAt TEXT,
            updatedAt TEXT
        )`);

        // جدول تقييمات المنتجات
        await runQuery(`CREATE TABLE IF NOT EXISTS product_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId INTEGER,
            userId INTEGER,
            rating INTEGER,
            review_ar TEXT,
            review_en TEXT,
            createdAt TEXT
        )`);

        // جدول المستخدمين المتقدم
        await runQuery(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            phone TEXT,
            address TEXT,
            avatar TEXT,
            wishlist TEXT,
            loyaltyPoints INTEGER DEFAULT 0,
            preferredLang TEXT DEFAULT 'ar',
            preferredCurrency TEXT DEFAULT 'SAR',
            createdAt TEXT,
            lastLogin TEXT
        )`);

        // جدول الطلبات المتكامل
        await runQuery(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            orderNumber TEXT UNIQUE,
            customer TEXT NOT NULL,
            email TEXT,
            phone TEXT NOT NULL,
            address TEXT NOT NULL,
            city TEXT,
            country TEXT NOT NULL,
            items TEXT NOT NULL,
            subtotal REAL,
            discount INTEGER DEFAULT 0,
            discountAmount REAL DEFAULT 0,
            shipping REAL DEFAULT 0,
            tax REAL DEFAULT 0,
            total REAL NOT NULL,
            currency TEXT DEFAULT 'SAR',
            status TEXT DEFAULT 'pending',
            trackingNumber TEXT,
            date TEXT NOT NULL,
            dateFormatted TEXT NOT NULL,
            notes TEXT
        )`);

        // جدول الرسائل للدردشة
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

        // جدول كوبونات الخصم
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

        // جدول إعدادات المتجر
        await runQuery(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_ar TEXT,
            value_en TEXT,
            updatedAt TEXT
        )`);

        // جدول سجل النشاطات
        await runQuery(`CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            ip TEXT,
            createdAt TEXT
        )`);

        // جدول حجوزات المنتجات
        await runQuery(`CREATE TABLE IF NOT EXISTS reserved_stock (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId INTEGER,
            quantity INTEGER,
            sessionId TEXT,
            expiresAt TEXT
        )`);

        console.log('✅ جميع الجداول تم إنشاؤها بنجاح');

        // ====================================================================
        // إدخال البيانات الأولية
        // ====================================================================
        
        // الأقسام الافتراضية
        const catCount = await getQuery("SELECT COUNT(*) as count FROM categories");
        if (catCount.count === 0) {
            const defaultCats = [
                ['هواتف', 'Phones', 'fa-mobile-alt'],
                ['عطور', 'Perfumes', 'fa-leaf'],
                ['إكسسوارات', 'Accessories', 'fa-headphones'],
                ['إلكترونيات', 'Electronics', 'fa-microchip'],
                ['ملابس', 'Clothing', 'fa-tshirt'],
                ['أحذية', 'Shoes', 'fa-shoe-prints']
            ];
            for (const cat of defaultCats) {
                await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)",
                    [cat[0], cat[1], cat[2], new Date().toISOString()]);
            }
            console.log('✅ تم إضافة الأقسام الافتراضية');
        }

        // المستخدم المدير
        const adminCount = await getQuery("SELECT COUNT(*) as count FROM users WHERE email = 'admin@raadi.com'");
        if (adminCount.count === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await runQuery("INSERT INTO users (name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?)",
                ['المدير العام', 'admin@raadi.com', hashedPassword, 'admin', new Date().toISOString()]);
            console.log('✅ تم إضافة حساب المدير');
        }

        // المنتجات الافتراضية
        const prodCount = await getQuery("SELECT COUNT(*) as count FROM products");
        if (prodCount.count === 0) {
            const sampleProducts = [
                ['هاتف الرعدي برو X', 'Raadi Phone Pro X', 'هواتف', 2999, 3499, 15, 'أسود تيتانيوم', 'كاميرا 200 ميجابكسل، شاشة 6.8 بوصة، معالج فائق', '200MP Camera, 6.8" Screen, Ultra Processor', 10, 'https://picsum.photos/id/0/300/300'],
                ['سامسونج جالكسي S24 الترا', 'Samsung Galaxy S24 Ultra', 'هواتف', 4940, 5200, 12, 'رمادي تيتانيوم', 'قلم S-Pen، سعة 512 جيجا، شاشة 6.8 بوصة', 'S-Pen, 512GB, 6.8" Screen', 7, 'https://picsum.photos/id/1/300/300'],
                ['سماعة أبل إيربودز برو', 'Apple AirPods Pro', 'إكسسوارات', 899, 1099, 18, 'أبيض ناصع', 'عزل ضوضاء، صوت محيطي، مقاومة للماء', 'Noise Cancellation, Spatial Audio', 15, 'https://picsum.photos/id/3/300/300'],
                ['عطر بلو دي شانيل', 'Bleu de Chanel', 'عطور', 4140, 4600, 10, 'كحلي غامق', 'رائحة خشبية فاخرة، تدوم طويلاً', 'Luxury woody scent', 5, 'https://picsum.photos/id/2/300/300']
            ];
            for (const p of sampleProducts) {
                await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], new Date().toISOString()]);
            }
            console.log('✅ تم إضافة منتجات افتراضية');
        }

        // الكوبونات الافتراضية
        const coupCount = await getQuery("SELECT COUNT(*) as count FROM coupons");
        if (coupCount.count === 0) {
            await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", ['WELCOME20', 20, 0, new Date().toISOString()]);
            await runQuery("INSERT INTO coupons (code, value, minOrder, createdAt) VALUES (?, ?, ?, ?)", ['SUMMER70', 70, 300, new Date().toISOString()]);
            console.log('✅ تم إضافة كوبونات افتراضية');
        }

        // الإعدادات الافتراضية
        const settingCount = await getQuery("SELECT COUNT(*) as count FROM settings");
        if (settingCount.count === 0) {
            const defaultSettings = [
                ['siteName', 'الرعدي أونلاين', 'Raadi Online'],
                ['domesticShipping', '15', '15'],
                ['internationalShipping', '50', '50'],
                ['whatsappNumber', '966500000000', '966500000000'],
                ['returnPolicy', 'يمكن استرجاع المنتج خلال 14 يوماً في حالة وجود عيب صناعي.', 'Return within 14 days if manufacturing defect.']
            ];
            for (const s of defaultSettings) {
                await runQuery("INSERT INTO settings (key, value_ar, value_en, updatedAt) VALUES (?, ?, ?, ?)",
                    [s[0], s[1], s[2], new Date().toISOString()]);
            }
            console.log('✅ تم إضافة الإعدادات الافتراضية');
        }

    } catch (error) {
        console.error('❌ خطأ في إنشاء الجداول:', error.message);
    }
};

// تشغيل إنشاء الجداول
createTables();

// ====================================================================
// مسارات API (جميع الوظائف)
// ====================================================================

// جلب المنتجات مع دعم اللغة
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

// جلب الأقسام
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

// إضافة قسم جديد (للمدير)
app.post('/api/categories', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const { name_ar, name_en, icon } = req.body;
    try {
        await runQuery("INSERT INTO categories (name_ar, name_en, icon, createdAt) VALUES (?, ?, ?, ?)",
            [name_ar, name_en, icon || '', new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة القسم:', error);
        res.status(500).json({ error: 'حدث خطأ في إضافة القسم' });
    }
});

// حذف قسم
app.delete('/api/categories/:name', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        await runQuery("DELETE FROM categories WHERE name_ar = ? OR name_en = ?", [req.params.name, req.params.name]);
        await runQuery("DELETE FROM products WHERE category = ?", [req.params.name]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في حذف القسم:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// إضافة منتج
app.post('/api/products', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const { name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image } = req.body;
    try {
        await runQuery(`INSERT INTO products (name_ar, name_en, category, price, oldPrice, discount, color, features_ar, features_en, stock, image, createdAt, updatedAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name_ar, name_en, category, price, oldPrice || 0, discount || 0, color || '', features_ar || '', features_en || '', stock || 0, image || '', new Date().toISOString(), new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة المنتج:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// حذف منتج
app.delete('/api/products/:id', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        await runQuery("DELETE FROM products WHERE id = ?", [req.params.id]);
        await runQuery("DELETE FROM product_ratings WHERE productId = ?", [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في حذف المنتج:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// تقييم المنتج
app.post('/api/products/:id/rate', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { rating, review_ar, review_en } = req.body;
    try {
        await runQuery("INSERT INTO product_ratings (productId, userId, rating, review_ar, review_en, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            [req.params.id, req.session.userId, rating, review_ar || '', review_en || '', new Date().toISOString()]);
        const ratings = await allQuery("SELECT rating FROM product_ratings WHERE productId = ?", [req.params.id]);
        const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
        await runQuery("UPDATE products SET rating = ?, ratingCount = ? WHERE id = ?", [avg, ratings.length, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في التقييم:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// إضافة إلى الأمنيات
app.post('/api/wishlist/add', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { productId } = req.body;
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        let wishlist = user.wishlist ? JSON.parse(user.wishlist) : [];
        if (!wishlist.includes(productId)) wishlist.push(productId);
        await runQuery("UPDATE users SET wishlist = ? WHERE id = ?", [JSON.stringify(wishlist), req.session.userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة الأمنية:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// إزالة من الأمنيات
app.post('/api/wishlist/remove', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { productId } = req.body;
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        let wishlist = user.wishlist ? JSON.parse(user.wishlist) : [];
        wishlist = wishlist.filter(id => id !== productId);
        await runQuery("UPDATE users SET wishlist = ? WHERE id = ?", [JSON.stringify(wishlist), req.session.userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إزالة الأمنية:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// جلب الأمنيات
app.get('/api/wishlist', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const user = await getQuery("SELECT wishlist FROM users WHERE id = ?", [req.session.userId]);
        res.json(user.wishlist ? JSON.parse(user.wishlist) : []);
    } catch (error) {
        console.error('خطأ في جلب الأمنيات:', error);
        res.status(500).json([]);
    }
});

// حجز المنتجات
app.post('/api/reserve-stock', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { items } = req.body;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
        for (const item of items) {
            await runQuery("INSERT INTO reserved_stock (productId, quantity, sessionId, expiresAt) VALUES (?, ?, ?, ?)",
                [item.id, item.quantity, req.session.id, expiresAt]);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في حجز المخزون:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// إنشاء طلب جديد
app.post('/api/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, notes } = req.body;
    const orderNumber = 'RAD-' + Date.now();
    const dateFormatted = new Date().toLocaleDateString('ar-EG');
    try {
        await runQuery(`INSERT INTO orders (userId, orderNumber, customer, email, phone, address, country, items, subtotal, discount, discountAmount, shipping, total, currency, status, date, dateFormatted, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, orderNumber, customer, email, phone, address, country, JSON.stringify(items), subtotal, discount, discountAmount, shipping, total, currency || 'SAR', 'pending', new Date().toISOString(), dateFormatted, notes || '']);
        
        // إشعار واتساب
        const settings = await getQuery("SELECT value_ar FROM settings WHERE key = 'whatsappNumber'");
        const whatsappNumber = settings?.value_ar || '966500000000';
        const message = `🦅 طلب جديد في الرعدي أونلاين\n📋 رقم: ${orderNumber}\n👤 العميل: ${customer}\n📞 ${phone}\n📍 ${address}\n💰 الإجمالي: ${total} ${currency}\n🔗 https://alradi-plus.onrender.com`;
        console.log(`📱 إشعار واتساب: ${message}`);
        
        res.json({ success: true, orderNumber });
    } catch (error) {
        console.error('خطأ في إنشاء الطلب:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// جلب طلبات المستخدم
app.get('/api/my-orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        const orders = await allQuery("SELECT * FROM orders WHERE userId = ? ORDER BY id DESC", [req.session.userId]);
        orders.forEach(o => o.items = JSON.parse(o.items));
        res.json(orders);
    } catch (error) {
        console.error('خطأ في جلب الطلبات:', error);
        res.status(500).json([]);
    }
});

// جلب جميع الطلبات (للمدير)
app.get('/api/orders', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const orders = await allQuery("SELECT * FROM orders ORDER BY id DESC");
        orders.forEach(o => o.items = JSON.parse(o.items));
        res.json(orders);
    } catch (error) {
        console.error('خطأ في جلب الطلبات:', error);
        res.status(500).json([]);
    }
});

// تحديث حالة الطلب
app.put('/api/orders/:id/status', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const { status, trackingNumber } = req.body;
    try {
        await runQuery("UPDATE orders SET status = ?, trackingNumber = ? WHERE id = ?", [status, trackingNumber || null, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في تحديث الحالة:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// جلب الكوبونات
app.get('/api/coupons', async (req, res) => {
    try {
        const coupons = await allQuery("SELECT code, value, minOrder FROM coupons WHERE expiresAt IS NULL OR expiresAt > datetime('now')");
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
        rows.forEach(row => { settings[row.key] = { ar: row.value_ar, en: row.value_en }; });
        res.json(settings);
    } catch (error) {
        console.error('خطأ في جلب الإعدادات:', error);
        res.status(500).json({});
    }
});

// حفظ إعدادات المتجر
app.post('/api/settings', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const updates = req.body;
    try {
        for (const [key, value] of Object.entries(updates)) {
            const valueAr = typeof value === 'object' ? value.ar : value;
            const valueEn = typeof value === 'object' ? value.en : value;
            await runQuery("UPDATE settings SET value_ar = ?, value_en = ?, updatedAt = ? WHERE key = ?", [valueAr, valueEn, new Date().toISOString(), key]);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في حفظ الإعدادات:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// جلب الإحصائيات
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await getQuery("SELECT COUNT(*) as count FROM users WHERE role != 'admin'");
        const totalProducts = await getQuery("SELECT COUNT(*) as count FROM products");
        const totalOrders = await getQuery("SELECT COUNT(*) as count FROM orders");
        const totalRevenue = await getQuery("SELECT SUM(total) as sum FROM orders");
        const lowStock = await getQuery("SELECT COUNT(*) as count FROM products WHERE stock < 5");
        const today = new Date().toISOString().split('T')[0];
        const todayRevenue = await getQuery("SELECT SUM(total) as sum FROM orders WHERE date LIKE ?", [today + '%']);
        res.json({
            totalUsers: totalUsers.count,
            totalProducts: totalProducts.count,
            totalOrders: totalOrders.count,
            totalRevenue: totalRevenue.sum || 0,
            todayRevenue: todayRevenue.sum || 0,
            lowStock: lowStock.count
        });
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({});
    }
});

// جلب رسائل الدردشة
app.get('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    try {
        let messages;
        if (req.session.user.role === 'admin') {
            messages = await allQuery("SELECT * FROM messages ORDER BY id DESC LIMIT 200");
        } else {
            messages = await allQuery("SELECT * FROM messages WHERE userId = ? OR isAdmin = 1 ORDER BY id ASC", [req.session.userId]);
        }
        res.json(messages);
    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json([]);
    }
});

// إرسال رسالة
app.post('/api/messages', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'سجل دخولك أولاً' });
    const { text_ar, text_en, isAdmin } = req.body;
    try {
        await runQuery(`INSERT INTO messages (userId, sender, text_ar, text_en, isAdmin, timestamp, date) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, req.session.user.name, text_ar || '', text_en || '', isAdmin ? 1 : 0, new Date().toLocaleTimeString('ar-EG'), new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// جلب المستخدمين (للمدير)
app.get('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const users = await allQuery("SELECT id, name, email, role, phone, address, loyaltyPoints, createdAt FROM users WHERE role != 'admin'");
        res.json(users);
    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json([]);
    }
});

// تسجيل الدخول
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
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;
    try {
        const existing = await getQuery("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
        const hashed = bcrypt.hashSync(password, 10);
        await runQuery("INSERT INTO users (name, email, password, phone, address, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
            [name, email, hashed, phone || '', address || '', new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// جلب بيانات المستخدم الحالي
app.get('/api/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    try {
        const user = await getQuery("SELECT id, name, email, role, phone, address, loyaltyPoints FROM users WHERE id = ?", [req.session.userId]);
        res.json(user);
    } catch (error) {
        console.error('خطأ في جلب المستخدم:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// وضع الطوارئ
app.get('/api/maintenance-status', async (req, res) => {
    const mode = await getQuery("SELECT value_ar FROM settings WHERE key = 'maintenanceMode'");
    res.json({ maintenance: mode?.value_ar === '1' });
});

// عدد الطلبات المعلقة
app.get('/api/pending-orders-count', async (req, res) => {
    if (!req.session.userId || req.session.user.role !== 'admin') return res.status(403);
    const count = await getQuery("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    res.json({ count: count.count });
});

// تنظيف الحجوزات المنتهية
setInterval(async () => {
    await runQuery("DELETE FROM reserved_stock WHERE expiresAt < datetime('now')");
}, 60 * 1000);

// ====================================================================
// تشغيل الخادم
// ====================================================================
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🦅 الرعدي أونلاين | المتجر العالمي الأسطوري`);
    console.log(`🚀 الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`👑 المدير: admin@raadi.com / admin123`);
    console.log(`========================================`);
});
