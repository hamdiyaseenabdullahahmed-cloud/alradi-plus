// ============================================
// الرعدي أونلاين - الخادم الخلفي المتكامل
// ============================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'raadi-super-secret-key-2026';

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/assets', express.static('public/assets'));

// رفع الملفات
const storage = multer.diskStorage({
    destination: './public/assets/uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// ============================================
// قاعدة البيانات
// ============================================
const db = new sqlite3.Database('./database.db');

// إنشاء جميع الجداول (21 جدولاً)
db.serialize(() => {
    // 1. المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        city TEXT,
        role TEXT DEFAULT 'client',
        loyalty_points INTEGER DEFAULT 0,
        tier TEXT DEFAULT 'bronze',
        avatar TEXT,
        email_verified INTEGER DEFAULT 0,
        reset_token TEXT,
        isActive INTEGER DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. الأقسام
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        name_en TEXT,
        slug TEXT UNIQUE,
        icon TEXT,
        image TEXT,
        parent_id INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 3. المنتجات
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_en TEXT,
        slug TEXT UNIQUE,
        sku TEXT UNIQUE,
        category_id INTEGER,
        category_name TEXT,
        price REAL NOT NULL,
        old_price REAL,
        cost_price REAL,
        stock INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 5,
        weight REAL,
        dimensions TEXT,
        image TEXT,
        images TEXT,
        colors TEXT,
        sizes TEXT,
        tags TEXT,
        brand TEXT,
        description TEXT,
        specifications TEXT,
        rating REAL DEFAULT 5,
        reviews_count INTEGER DEFAULT 0,
        sold_count INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        isFeatured INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 4. الطلبات
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE,
        user_id INTEGER,
        user_name TEXT,
        user_email TEXT,
        user_phone TEXT,
        address TEXT,
        city TEXT,
        postal_code TEXT,
        products TEXT,
        subtotal REAL,
        discount REAL DEFAULT 0,
        shipping_cost REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        total REAL,
        coupon_code TEXT,
        coupon_discount REAL DEFAULT 0,
        payment_method TEXT,
        payment_status TEXT DEFAULT 'unpaid',
        payment_id TEXT,
        shipping_method TEXT,
        shipping_status TEXT DEFAULT 'pending',
        tracking_number TEXT,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 5. سلة التسوق
    db.run(`CREATE TABLE IF NOT EXISTS cart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        product_id INTEGER,
        product_name TEXT,
        product_image TEXT,
        price REAL,
        quantity INTEGER DEFAULT 1,
        color TEXT,
        size TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 6. سلة المحذوفات
    db.run(`CREATE TABLE IF NOT EXISTS trash (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT,
        item_id INTEGER,
        item_data TEXT,
        deleted_by INTEGER,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 7. سجل الأخطاء
    db.run(`CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context TEXT,
        message TEXT,
        stack TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 8. سجل النشاطات
    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        action TEXT,
        details TEXT,
        ip TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 9. الإعدادات العامة
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 10. كوبونات الخصم
    db.run(`CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        description TEXT,
        discount_type TEXT,
        discount_value REAL,
        min_order REAL,
        max_discount REAL,
        max_uses INTEGER,
        used_count INTEGER DEFAULT 0,
        per_user_limit INTEGER DEFAULT 1,
        start_date DATETIME,
        expires_at DATETIME,
        isActive INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 11. المراجعات
    db.run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        user_id INTEGER,
        user_name TEXT,
        rating INTEGER,
        title TEXT,
        comment TEXT,
        images TEXT,
        isApproved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 12. الإشعارات
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        message TEXT,
        type TEXT,
        link TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 13. المفضلة
    db.run(`CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        product_id INTEGER,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 14. جلسات المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        token TEXT,
        ip TEXT,
        user_agent TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 15. رسائل الدردشة
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        message TEXT,
        is_admin_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 16. تذاكر الدعم
    db.run(`CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        subject TEXT,
        message TEXT,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 17. تذكيرات الصيانة
    db.run(`CREATE TABLE IF NOT EXISTS maintenance_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        product_name TEXT,
        customer_phone TEXT,
        reminder_date DATETIME,
        sent INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 18. الخرائط الحرارية
    db.run(`CREATE TABLE IF NOT EXISTS heatmap_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        product_id INTEGER,
        event_type TEXT,
        page_url TEXT,
        screen_size TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 19. تنبؤات الطلب
    db.run(`CREATE TABLE IF NOT EXISTS demand_forecasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        predicted_sales INTEGER,
        confidence REAL,
        recommendation TEXT,
        forecast_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 20. التسعير الديناميكي
    db.run(`CREATE TABLE IF NOT EXISTS dynamic_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        original_price REAL,
        dynamic_price REAL,
        demand_score REAL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 21. الصور المرفوعة
    db.run(`CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        original_name TEXT,
        file_type TEXT,
        file_size INTEGER,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('✅ تم إنشاء 21 جدولاً بنجاح');

    // ============================================
    // البيانات الافتراضية
    // ============================================

    // إضافة حساب المدير
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.get(`SELECT * FROM users WHERE email = 'admin@system.com'`, [], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (name, email, password, phone, role, loyalty_points, tier) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['مدير النظام', 'admin@system.com', adminHash, '0500000000', 'admin', 0, 'gold']);
            console.log('✅ تم إضافة حساب المدير: admin@system.com / admin123');
        }
    });

    // إضافة الأقسام الرئيسية
    db.get(`SELECT * FROM categories LIMIT 1`, [], (err, row) => {
        if (!row) {
            const categories = [
                ['الكل', 'All', 'all', '📱', '', 0, 0, 1],
                ['إلكترونيات', 'Electronics', 'electronics', '📱', 'https://picsum.photos/id/0/100/100', 0, 1, 2],
                ['أزياء', 'Fashion', 'fashion', '👕', 'https://picsum.photos/id/20/100/100', 0, 1, 3],
                ['منزل ومطبخ', 'Home', 'home', '🏠', 'https://picsum.photos/id/10/100/100', 0, 1, 4],
                ['هواتف', 'Phones', 'phones', '📱', 'https://picsum.photos/id/1/100/100', 2, 2, 5],
                ['أجهزة لوحية', 'Tablets', 'tablets', '📱', 'https://picsum.photos/id/2/100/100', 2, 2, 6]
            ];
            categories.forEach(c => {
                db.run(`INSERT INTO categories (name, name_en, slug, icon, image, parent_id, level, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, c);
            });
            console.log('✅ تم إضافة الأقسام');
        }
    });

    // إضافة منتجات
    db.get(`SELECT * FROM products LIMIT 1`, [], (err, row) => {
        if (!row) {
            const products = [
                ['iPhone 15 Pro', 'iPhone 15 Pro', 'iphone-15-pro', 'IP15P-001', 5, 'إلكترونيات', 3999, 4599, 2800, 10, 5, '0.2', '{"width":7,"height":14}', 'https://picsum.photos/id/1/400/400', '["https://picsum.photos/id/1/400/400","https://picsum.photos/id/2/400/400"]', '["أسود","أبيض","ذهبي"]', '["128GB","256GB","512GB"]', '["apple","iphone","موبايل"]', 'Apple', 'أحدث هاتف من Apple مع شريحة A17 Pro', '{"processor":"A17 Pro","ram":"8GB","camera":"48MP"}', 4.9, 0, 0, 0, 1, 1],
                ['ساعة ذكية', 'Smart Watch', 'smart-watch', 'SW-001', 2, 'إلكترونيات', 499, 699, 350, 20, 5, '0.1', '', 'https://picsum.photos/id/2/400/400', '["https://picsum.photos/id/2/400/400"]', '["أسود","فضي","ذهبي"]', '["S","M","L"]', '["ساعة","ذكية","رياضية"]', 'Samsung', 'ساعة ذكية متعددة الوظائف', '{"battery":"3 days","display":"AMOLED"}', 4.7, 0, 0, 0, 1, 1],
                ['سماعات لاسلكية', 'Wireless Headphones', 'wireless-headphones', 'WH-001', 2, 'إلكترونيات', 299, 450, 200, 50, 10, '0.3', '', 'https://picsum.photos/id/3/400/400', '["https://picsum.photos/id/3/400/400"]', '["أسود","أبيض"]', '["S","M","L"]', '["سماعات","لاسلكية","بلوتوث"]', 'Sony', 'سماعات عالية الجودة مع عزل ضوضاء', '{"battery":"20 hours","noise_cancelling":true}', 4.8, 0, 0, 0, 1, 1],
                ['حقيبة جلدية', 'Leather Bag', 'leather-bag', 'LB-001', 3, 'أزياء', 799, 1299, 500, 15, 3, '0.8', '', 'https://picsum.photos/id/20/400/400', '["https://picsum.photos/id/20/400/400"]', '["بني","أسود"]', '["One Size"]', '["حقيبة","جلد","فاخرة"]', 'Prada', 'حقيبة جلدية فاخرة مصنوعة يدوياً', '{"material":"Leather","size":"40x30cm"}', 4.9, 0, 0, 0, 1, 1]
            ];
            products.forEach(p => {
                db.run(`INSERT INTO products (name, name_en, slug, sku, category_id, category_name, price, old_price, cost_price, stock, min_stock, weight, dimensions, image, images, colors, sizes, tags, brand, description, specifications, rating, reviews_count, sold_count, views_count, isActive, isFeatured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p);
            });
            console.log('✅ تم إضافة المنتجات');
        }
    });

    // إعدادات المتجر
    db.get(`SELECT * FROM settings WHERE key = 'site_name'`, [], (err, row) => {
        if (!row) {
            const settings = [
                ['site_name', 'الرعدي أونلاين'],
                ['site_logo', '🛍️'],
                ['site_description', 'أكبر متجر إلكتروني في العالم العربي'],
                ['primary_color', '#b87333'],
                ['secondary_color', '#1a2a3a'],
                ['dark_mode', 'false'],
                ['whatsapp_number', '966500000000'],
                ['phone_number', '920000000'],
                ['email', 'info@raadi-store.com'],
                ['address', 'الرياض، المملكة العربية السعودية'],
                ['facebook_url', 'https://facebook.com/raadi'],
                ['instagram_url', 'https://instagram.com/raadi'],
                ['twitter_url', 'https://twitter.com/raadi'],
                ['shipping_cost', '20'],
                ['free_shipping_min', '200'],
                ['tax_rate', '15'],
                ['currency', 'ريال'],
                ['sound_enabled', 'true'],
                ['marquee_text', '🎉 خصم 20% على أول طلب | كود: WELCOME20 | 🚚 توصيل مجاني للطلبات فوق 200 ريال | 💎 نقاط مضاعفة'],
                ['welcome_popup', 'true'],
                ['ar_enabled', 'true'],
                ['voice_assistant_enabled', 'true']
            ];
            settings.forEach(s => {
                db.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, s);
            });
            console.log('✅ تم إضافة إعدادات المتجر');
        }
    });

    // كوبون Welcome
    db.get(`SELECT * FROM coupons WHERE code = 'WELCOME20'`, [], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO coupons (code, description, discount_type, discount_value, min_order, max_uses, isActive) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['WELCOME20', 'خصم 20% على أول طلب', 'percentage', 20, 0, 1000, 1]);
        }
    });
});

// ============================================
// دوال مساعدة
// ============================================

function logError(error, context) {
    const msg = error.message || error;
    const stack = error.stack || '';
    db.run(`INSERT INTO error_logs (context, message, stack) VALUES (?, ?, ?)`, [context, msg, stack]);
    console.error(`🚨 [${context}] ${msg}`);
}

function logActivity(userId, userName, action, details, ip = '') {
    db.run(`INSERT INTO activity_logs (user_id, user_name, action, details, ip) VALUES (?, ?, ?, ?, ?)`,
        [userId, userName, action, details, ip]);
}

function sendNotification(userId, title, message, type = 'info', link = '') {
    db.run(`INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)`,
        [userId, title, message, type, link]);
}

function generateToken(userId) {
    return jwt.sign({ userId }, SECRET_KEY, { expiresIn: '7d' });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch(e) {
        return null;
    }
}

// ============================================
// API: المصادقة (Authentication)
// ============================================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { email, password, remember } = req.body;
        
        db.get(`SELECT * FROM users WHERE email = ? AND isActive = 1`, [email], async (err, user) => {
            if (err) return res.json({ success: false, error: 'خطأ في الخادم' });
            if (!user) return res.json({ success: false, error: 'البريد الإلكتروني غير موجود' });
            
            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.json({ success: false, error: 'كلمة المرور غير صحيحة' });
            
            const token = generateToken(user.id);
            const expiresAt = remember ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            
            db.run(`INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)`, [user.id, token, expiresAt.toISOString()]);
            db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);
            
            logActivity(user.id, user.name, 'LOGIN', 'تسجيل دخول ناجح');
            
            // إرسال إشعار ترحيبي للمستخدم الجديد
            if (user.created_at && new Date(user.created_at) > new Date(Date.now() - 5 * 60 * 1000)) {
                sendNotification(user.id, '🎉 مرحباً بك في الرعدي أونلاين!', 'استخدم كود WELCOME20 للحصول على خصم 20% على أول طلب', 'welcome', '/products');
            }
            
            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    loyalty_points: user.loyalty_points,
                    tier: user.tier
                }
            });
        });
    } catch(e) {
        logError(e, 'LOGIN');
        res.json({ success: false, error: 'خطأ في الخادم' });
    }
});

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone, address, city } = req.body;
        
        if (!name || !email || !password) {
            return res.json({ success: false, error: 'جميع الحقول المطلوبة غير مكتملة' });
        }
        
        if (email === 'admin@system.com') {
            return res.json({ success: false, error: 'لا يمكن استخدام هذا البريد للتسجيل' });
        }
        
        if (password.length < 6) {
            return res.json({ success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
        }
        
        db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, existing) => {
            if (err) return res.json({ success: false, error: err.message });
            if (existing) return res.json({ success: false, error: 'البريد الإلكتروني مسجل مسبقاً' });
            
            const hashedPassword = await bcrypt.hash(password, 10);
            const role = 'client';
            const tier = 'bronze';
            
            db.run(`INSERT INTO users (name, email, password, phone, address, city, role, loyalty_points, tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, email, hashedPassword, phone || '', address || '', city || '', role, 0, tier],
                function(err2) {
                    if (err2) return res.json({ success: false, error: err2.message });
                    
                    logActivity(this.lastID, name, 'REGISTER', 'حساب جديد');
                    sendNotification(this.lastID, '🎉 مرحباً بك!', 'تم إنشاء حسابك بنجاح. استخدم كود WELCOME20 للحصول على خصم 20%', 'welcome');
                    
                    res.json({ success: true, message: 'تم إنشاء الحساب بنجاح، يمكنك تسجيل الدخول الآن' });
                });
        });
    } catch(e) {
        logError(e, 'REGISTER');
        res.json({ success: false, error: 'خطأ في الخادم' });
    }
});

// التحقق من صحة التوكن
app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    const decoded = verifyToken(token);
    if (!decoded) return res.json({ success: false, error: 'توكن غير صالح' });
    
    db.get(`SELECT * FROM sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`, [token], (err, session) => {
        if (!session) return res.json({ success: false, error: 'جلسة منتهية' });
        
        db.get(`SELECT id, name, email, phone, role, loyalty_points, tier FROM users WHERE id = ?`, [decoded.userId], (err2, user) => {
            if (!user) return res.json({ success: false, error: 'مستخدم غير موجود' });
            res.json({ success: true, user });
        });
    });
});

// استعادة كلمة المرور (إرسال رابط)
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (!user) return res.json({ success: false, error: 'البريد غير موجود' });
        
        const resetToken = Math.random().toString(36).substring(2, 15);
        db.run(`UPDATE users SET reset_token = ? WHERE id = ?`, [resetToken, user.id]);
        
        // إرسال بريد إلكتروني (محاكاة)
        console.log(`📧 رابط استعادة كلمة المرور لـ ${email}: /reset-password?token=${resetToken}`);
        
        res.json({ success: true, message: 'تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني' });
    });
});

// إعادة تعيين كلمة المرور
app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    
    db.get(`SELECT * FROM users WHERE reset_token = ?`, [token], async (err, user) => {
        if (!user) return res.json({ success: false, error: 'رابط غير صالح' });
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.run(`UPDATE users SET password = ?, reset_token = NULL WHERE id = ?`, [hashedPassword, user.id]);
        
        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
    });
});

// تحديث الملف الشخصي
app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { name, phone, address, city, password } = req.body;
    
    let query = `UPDATE users SET name = ?, phone = ?, address = ?, city = ?`;
    let params = [name, phone, address, city];
    
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += `, password = ?`;
        params.push(hashedPassword);
    }
    query += ` WHERE id = ?`;
    params.push(id);
    
    db.run(query, params, function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true, message: 'تم تحديث الملف الشخصي' });
    });
});

// ============================================
// API: الأقسام (Categories)
// ============================================

app.get('/api/categories', (req, res) => {
    db.all(`SELECT * FROM categories WHERE isActive = 1 ORDER BY sort_order, id`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/categories/all', (req, res) => {
    db.all(`SELECT * FROM categories ORDER BY sort_order, id`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/categories', (req, res) => {
    const { name, name_en, icon, image, parent_id, sort_order } = req.body;
    if (!name) return res.json({ success: false, error: 'اسم القسم مطلوب' });
    
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    db.run(`INSERT INTO categories (name, name_en, slug, icon, image, parent_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, name_en || '', slug, icon || '📁', image || '', parent_id || 0, sort_order || 0],
        function(err) {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

app.put('/api/categories/:id', (req, res) => {
    const { id } = req.params;
    const { name, name_en, icon, image, parent_id, sort_order, isActive } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    db.run(`UPDATE categories SET name = ?, name_en = ?, slug = ?, icon = ?, image = ?, parent_id = ?, sort_order = ?, isActive = ? WHERE id = ?`,
        [name, name_en, slug, icon, image, parent_id, sort_order, isActive, id],
        function(err) {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/categories/:id', (req, res) => {
    const { id } = req.params;
    
    db.get(`SELECT * FROM categories WHERE id = ?`, [id], (err, cat) => {
        if (cat) {
            db.run(`INSERT INTO trash (item_type, item_id, item_data) VALUES (?, ?, ?)`,
                ['category', id, JSON.stringify(cat)]);
        }
        db.run(`DELETE FROM categories WHERE id = ?`, [id], function(err2) {
            if (err2) return res.json({ success: false, error: err2.message });
            res.json({ success: true });
        });
    });
});

// ============================================
// API: المنتجات (Products)
// ============================================

app.get('/api/products', (req, res) => {
    const { category, search, min_price, max_price, sort, page = 1, limit = 20 } = req.query;
    let query = `SELECT * FROM products WHERE isActive = 1`;
    let params = [];
    
    if (category && category !== 'all') {
        query += ` AND category_id = ?`;
        params.push(category);
    }
    
    if (search) {
        query += ` AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (min_price) {
        query += ` AND price >= ?`;
        params.push(min_price);
    }
    
    if (max_price) {
        query += ` AND price <= ?`;
        params.push(max_price);
    }
    
    switch(sort) {
        case 'price_asc': query += ` ORDER BY price ASC`; break;
        case 'price_desc': query += ` ORDER BY price DESC`; break;
        case 'rating': query += ` ORDER BY rating DESC`; break;
        case 'newest': query += ` ORDER BY id DESC`; break;
        case 'popular': query += ` ORDER BY sold_count DESC`; break;
        default: query += ` ORDER BY id DESC`;
    }
    
    const offset = (page - 1) * limit;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        db.get(`SELECT COUNT(*) as total FROM products WHERE isActive = 1`, [], (err2, countRow) => {
            res.json({ 
                success: true, 
                data: rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countRow?.total || 0,
                    pages: Math.ceil((countRow?.total || 0) / limit)
                }
            });
        });
    });
});

app.get('/api/products/featured', (req, res) => {
    db.all(`SELECT * FROM products WHERE isActive = 1 AND isFeatured = 1 ORDER BY id DESC LIMIT 12`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/products/best-sellers', (req, res) => {
    db.all(`SELECT * FROM products WHERE isActive = 1 ORDER BY sold_count DESC LIMIT 12`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/products/:id', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        if (row) {
            db.run(`UPDATE products SET views_count = views_count + 1 WHERE id = ?`, [id]);
            
            // تسجيل تفاعل للخرائط الحرارية
            const userId = req.headers['user-id'] || 0;
            db.run(`INSERT INTO heatmap_data (user_id, product_id, event_type, page_url) VALUES (?, ?, ?, ?)`,
                [userId, id, 'view', '/product/' + id]);
        }
        
        // جلب منتجات مشابهة
        db.all(`SELECT * FROM products WHERE category_id = ? AND id != ? LIMIT 4`, [row?.category_id, id], (err2, similar) => {
            res.json({ success: true, data: row, similar: similar || [] });
        });
    });
});

app.get('/api/products/slug/:slug', (req, res) => {
    const { slug } = req.params;
    db.get(`SELECT * FROM products WHERE slug = ? AND isActive = 1`, [slug], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: row });
    });
});

app.post('/api/products', upload.single('image'), (req, res) => {
    const { 
        name, name_en, category_id, category_name, price, old_price, cost_price,
        stock, min_stock, weight, dimensions, colors, sizes, tags, brand, description, specifications, isFeatured
    } = req.body;
    
    if (!name || !price) return res.json({ success: false, error: 'الاسم والسعر مطلوبان' });
    
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const sku = 'SKU-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const image = req.file ? `/assets/uploads/${req.file.filename}` : (req.body.image || '');
    
    db.run(`INSERT INTO products (
        name, name_en, slug, sku, category_id, category_name, price, old_price, cost_price,
        stock, min_stock, weight, dimensions, image, colors, sizes, tags, brand, description, specifications, isFeatured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, name_en || '', slug, sku, category_id, category_name || '', price, old_price || 0, cost_price || 0,
         stock || 0, min_stock || 5, weight || 0, dimensions || '', image, colors || '[]', sizes || '[]',
         tags || '', brand || '', description || '', specifications || '', isFeatured || 0],
        function(err) {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const { 
        name, name_en, category_id, category_name, price, old_price, cost_price,
        stock, min_stock, weight, dimensions, image, colors, sizes,
        tags, brand, description, specifications, isActive, isFeatured
    } = req.body;
    
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    db.run(`UPDATE products SET 
        name = ?, name_en = ?, slug = ?, category_id = ?, category_name = ?, 
        price = ?, old_price = ?, cost_price = ?, stock = ?, min_stock = ?,
        weight = ?, dimensions = ?, image = ?, colors = ?, sizes = ?,
        tags = ?, brand = ?, description = ?, specifications = ?, isActive = ?, isFeatured = ?
        WHERE id = ?`,
        [name, name_en, slug, category_id, category_name, price, old_price, cost_price,
         stock, min_stock, weight, dimensions, image, colors, sizes,
         tags, brand, description, specifications, isActive, isFeatured, id],
        function(err) {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    
    db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, prod) => {
        if (prod) {
            db.run(`INSERT INTO trash (item_type, item_id, item_data) VALUES (?, ?, ?)`,
                ['product', id, JSON.stringify(prod)]);
        }
        db.run(`DELETE FROM products WHERE id = ?`, [id], function(err2) {
            if (err2) return res.json({ success: false, error: err2.message });
            res.json({ success: true });
        });
    });
});

// ============================================
// API: سلة التسوق (Cart)
// ============================================

app.get('/api/cart/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT * FROM cart WHERE user_id = ?`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        let subtotal = 0;
        rows.forEach(item => { subtotal += item.price * item.quantity; });
        
        res.json({ success: true, data: rows, subtotal });
    });
});

app.post('/api/cart', (req, res) => {
    const { user_id, product_id, product_name, product_image, price, quantity, color, size } = req.body;
    
    db.get(`SELECT * FROM cart WHERE user_id = ? AND product_id = ?`, [user_id, product_id], (err, existing) => {
        if (err) return res.json({ success: false, error: err.message });
        
        if (existing) {
            db.run(`UPDATE cart SET quantity = quantity + ? WHERE id = ?`, [quantity || 1, existing.id], function(err2) {
                if (err2) return res.json({ success: false, error: err2.message });
                res.json({ success: true, action: 'updated' });
            });
        } else {
            db.run(`INSERT INTO cart (user_id, product_id, product_name, product_image, price, quantity, color, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [user_id, product_id, product_name, product_image, price, quantity || 1, color || '', size || ''],
                function(err2) {
                    if (err2) return res.json({ success: false, error: err2.message });
                    res.json({ success: true, action: 'added', id: this.lastID });
                });
        }
    });
});

app.put('/api/cart/:id', (req, res) => {
    const { id } = req.params;
    const { quantity } = req.body;
    
    db.run(`UPDATE cart SET quantity = ? WHERE id = ?`, [quantity, id], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/cart/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM cart WHERE id = ?`, [id], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/cart/clear/:userId', (req, res) => {
    const { userId } = req.params;
    db.run(`DELETE FROM cart WHERE user_id = ?`, [userId], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// ============================================
// API: الطلبات (Orders)
// ============================================

app.post('/api/orders', (req, res) => {
    const {
        user_id, user_name, user_email, user_phone, address, city, postal_code,
        products, subtotal, discount, shipping_cost, tax, total,
        coupon_code, coupon_discount, payment_method, shipping_method, notes
    } = req.body;
    
    const orderNumber = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    
    db.run(`INSERT INTO orders (
        order_number, user_id, user_name, user_email, user_phone, address, city, postal_code,
        products, subtotal, discount, shipping_cost, tax, total,
        coupon_code, coupon_discount, payment_method, shipping_method, notes, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNumber, user_id, user_name, user_email, user_phone, address, city, postal_code,
         JSON.stringify(products), subtotal, discount || 0, shipping_cost || 0, tax || 0, total,
         coupon_code || '', coupon_discount || 0, payment_method || 'cash', shipping_method || 'standard', notes || '', 'pending'],
        function(err) {
            if (err) return res.json({ success: false, error: err.message });
            
            // إضافة نقاط ولاء (10% من قيمة الطلب)
            const points = Math.floor(total / 10);
            db.run(`UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?`, [points, user_id]);
            
            // تحديث مستوى العميل
            db.get(`SELECT loyalty_points FROM users WHERE id = ?`, [user_id], (err2, user) => {
                let tier = 'bronze';
                if (user.loyalty_points >= 1000) tier = 'gold';
                else if (user.loyalty_points >= 500) tier = 'silver';
                db.run(`UPDATE users SET tier = ? WHERE id = ?`, [tier, user_id]);
            });
            
            // تفريغ السلة
            db.run(`DELETE FROM cart WHERE user_id = ?`, [user_id]);
            
            // إرسال إشعار للمدير
            sendNotification(1, '📦 طلب جديد', `طلب رقم ${orderNumber} بقيمة ${total} ريال`, 'order', `/admin/orders/${this.lastID}`);
            
            // تسجيل نشاط
            logActivity(user_id, user_name, 'ORDER', `طلب جديد رقم ${orderNumber} بقيمة ${total}`);
            
            // إنشاء تذكير صيانة للمنتجات (بعد 3 أشهر)
            products.forEach(product => {
                const reminderDate = new Date();
                reminderDate.setMonth(reminderDate.getMonth() + 3);
                db.run(`INSERT INTO maintenance_reminders (order_id, product_name, customer_phone, reminder_date) VALUES (?, ?, ?, ?)`,
                    [this.lastID, product.name, user_phone, reminderDate.toISOString()]);
            });
            
            res.json({ success: true, orderId: this.lastID, orderNumber });
        });
});

app.get('/api/orders', (req, res) => {
    db.all(`SELECT * FROM orders ORDER BY date DESC`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        // إنشاء QR Code للفاتورة
        if (row) {
            const qrData = JSON.stringify({
                orderNumber: row.order_number,
                total: row.total,
                date: row.date,
                products: JSON.parse(row.products || '[]')
            });
            QRCode.toDataURL(qrData, (err, qrCode) => {
                res.json({ success: true, data: row, qrCode: qrCode || null });
            });
        } else {
            res.json({ success: true, data: row });
        }
    });
});

app.get('/api/orders/user/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT * FROM orders WHERE user_id = ? ORDER BY date DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/orders/number/:number', (req, res) => {
    const { number } = req.params;
    db.get(`SELECT * FROM orders WHERE order_number = ?`, [number], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: row });
    });
});

app.put('/api/orders/:id/status', (req, res) => {
    const { id } = req.params;
    const { status, payment_status, shipping_status, tracking_number } = req.body;
    
    db.run(`UPDATE orders SET status = ?, payment_status = ?, shipping_status = ?, tracking_number = ? WHERE id = ?`,
        [status, payment_status, shipping_status, tracking_number, id], function(err) {
            if (err) return res.json({ success: false, error: err.message });
            
            // إرسال إشعار للعميل
            db.get(`SELECT user_id, order_number FROM orders WHERE id = ?`, [id], (err2, order) => {
                if (order && order.user_id) {
                    let message = '';
                    if (status === 'shipped') message = `تم شحن طلبك رقم ${order.order_number} برقم تتبع: ${tracking_number || 'سيتم إرساله لاحقاً'}`;
                    else if (status === 'delivered') message = `تم توصيل طلبك رقم ${order.order_number}، نأمل أن ينال إعجابك`;
                    else if (status === 'cancelled') message = `تم إلغاء طلبك رقم ${order.order_number}`;
                    else message = `تم تحديث حالة طلبك رقم ${order.order_number} إلى ${status}`;
                    
                    sendNotification(order.user_id, '📋 تحديث الطلب', message, 'order');
                }
            });
            
            res.json({ success: true });
        });
});

// ============================================
// API: المراجعات والتقييمات (Reviews)
// ============================================

app.get('/api/reviews/product/:productId', (req, res) => {
    const { productId } = req.params;
    db.all(`SELECT * FROM reviews WHERE product_id = ? AND isApproved = 1 ORDER BY created_at DESC`, [productId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        db.get(`SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reviews WHERE product_id = ? AND isApproved = 1`, [productId], (err2, stats) => {
            res.json({ success: true, data: rows, stats: { avg_rating: stats?.avg_rating || 0, total: stats?.total || 0 } });
        });
    });
});

app.post('/api/reviews', (req, res) => {
    const { product_id, user_id, user_name, rating, title, comment, images } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
        return res.json({ success: false, error: 'التقييم يجب أن يكون بين 1 و 5' });
    }
    
    db.run(`INSERT INTO reviews (product_id, user_id, user_name, rating, title, comment, images, isApproved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, user_id, user_name, rating, title || '', comment || '', images || '[]', 1],
        function(err) {
            if (err) return res.json({ success: false, error: err.message });
            
            // تحديث متوسط التقييم للمنتج
            db.get(`SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = ? AND isApproved = 1`, [product_id], (err2, stats) => {
                db.run(`UPDATE products SET rating = ?, reviews_count = reviews_count + 1 WHERE id = ?`, [stats?.avg_rating || 5, product_id]);
            });
            
            // إضافة نقاط ولاء للمراجعة
            db.run(`UPDATE users SET loyalty_points = loyalty_points + 5 WHERE id = ?`, [user_id]);
            
            res.json({ success: true, id: this.lastID });
        });
});

// ============================================
// API: المفضلة (Wishlist)
// ============================================

app.get('/api/wishlist/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT w.*, p.name, p.price, p.old_price, p.image, p.slug FROM wishlist w JOIN products p ON w.product_id = p.id WHERE w.user_id = ?`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/wishlist', (req, res) => {
    const { user_id, product_id } = req.body;
    
    db.get(`SELECT * FROM wishlist WHERE user_id = ? AND product_id = ?`, [user_id, product_id], (err, existing) => {
        if (err) return res.json({ success: false, error: err.message });
        if (existing) {
            db.run(`DELETE FROM wishlist WHERE id = ?`, [existing.id]);
            return res.json({ success: true, action: 'removed' });
        } else {
            db.run(`INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)`, [user_id, product_id], function(err2) {
                if (err2) return res.json({ success: false, error: err2.message });
                res.json({ success: true, action: 'added', id: this.lastID });
            });
        }
    });
});

// ============================================
// API: كوبونات الخصم (Coupons)
// ============================================

app.get('/api/coupons', (req, res) => {
    db.all(`SELECT * FROM coupons ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/coupons/validate', (req, res) => {
    const { code, subtotal, userId } = req.body;
    
    db.get(`SELECT * FROM coupons WHERE code = ? AND isActive = 1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`, [code.toUpperCase()], (err, coupon) => {
        if (err) return res.json({ success: false, error: err.message });
        if (!coupon) return res.json({ success: false, error: 'الكوبون غير صالح' });
        
        if (coupon.min_order && subtotal < coupon.min_order) {
            return res.json({ success: false, error: `الحد الأدنى للطلب هو ${coupon.min_order} ريال` });
        }
        
        if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
            return res.json({ success: false, error: 'تم استخدام هذا الكوبون максимальный عدد مرات' });
        }
        
        // التحقق من استخدام المستخدم لهذا الكوبون
        if (userId) {
            db.get(`SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND coupon_code = ?`, [userId, code], (err2, orderCount) => {
                if (orderCount && orderCount.count >= (coupon.per_user_limit || 1)) {
                    return res.json({ success: false, error: 'لقد استخدمت هذا الكوبون مسبقاً' });
                }
            });
        }
        
        let discount = 0;
        if (coupon.discount_type === 'percentage') {
            discount = (subtotal * coupon.discount_value) / 100;
            if (coupon.max_discount && discount > coupon.max_discount) {
                discount = coupon.max_discount;
            }
        } else {
            discount = coupon.discount_value;
        }
        
        res.json({ 
            success: true, 
            discount: Math.min(discount, subtotal),
            final_total: subtotal - Math.min(discount, subtotal),
            coupon: { code: coupon.code, discount_value: coupon.discount_value, discount_type: coupon.discount_type }
        });
    });
});

app.post('/api/coupons', (req, res) => {
    const { code, description, discount_type, discount_value, min_order, max_discount, max_uses, per_user_limit, expires_at } = req.body;
    
    db.run(`INSERT INTO coupons (code, description, discount_type, discount_value, min_order, max_discount, max_uses, per_user_limit, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code.toUpperCase(), description || '', discount_type, discount_value, min_order || 0, max_discount || 0, max_uses || 0, per_user_limit || 1, expires_at || null],
        function(err) {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

app.delete('/api/coupons/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM coupons WHERE id = ?`, [id], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// ============================================
// API: الإحصائيات والتقارير
// ============================================

app.get('/api/stats', (req, res) => {
    const stats = {};
    
    db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'client'`, (err, row) => { stats.clients = row?.count || 0; });
    db.get(`SELECT COUNT(*) as count FROM products WHERE isActive = 1`, (err, row) => { stats.products = row?.count || 0; });
    db.get(`SELECT COUNT(*) as count FROM orders`, (err, row) => { stats.orders = row?.count || 0; });
    db.get(`SELECT COUNT(*) as count FROM categories`, (err, row) => { stats.categories = row?.count || 0; });
    db.get(`SELECT SUM(total) as total FROM orders WHERE status != 'cancelled' AND status != 'refunded'`, (err, row) => { stats.revenue = row?.total || 0; });
    db.get(`SELECT SUM(total) as total FROM orders WHERE date >= date('now', '-30 days')`, (err, row) => { stats.monthlyRevenue = row?.total || 0; });
    db.get(`SELECT COUNT(*) as count FROM products WHERE stock < min_stock`, (err, row) => { stats.lowStock = row?.count || 0; });
    db.get(`SELECT COUNT(*) as count FROM orders WHERE status = 'pending'`, (err, row) => { stats.pendingOrders = row?.count || 0; });
    db.get(`SELECT COUNT(*) as count FROM users WHERE created_at >= date('now', '-7 days')`, (err, row) => { stats.newUsers = row?.count || 0; });
    db.get(`SELECT COUNT(*) as count FROM reviews WHERE isApproved = 0`, (err, row) => { stats.pendingReviews = row?.count || 0; });
    
    setTimeout(() => {
        res.json({ success: true, stats });
    }, 200);
});

app.get('/api/stats/sales', (req, res) => {
    db.all(`SELECT date(date) as day, COUNT(*) as count, SUM(total) as total FROM orders WHERE date >= date('now', '-30 days') GROUP BY date(date) ORDER BY day`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/stats/top-products', (req, res) => {
    db.all(`SELECT id, name, price, sold_count, rating, image FROM products ORDER BY sold_count DESC LIMIT 10`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/stats/heatmap', (req, res) => {
    db.all(`SELECT product_id, COUNT(*) as views FROM heatmap_data WHERE event_type = 'view' GROUP BY product_id ORDER BY views DESC LIMIT 20`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        // جلب أسماء المنتجات
        const productIds = rows.map(r => r.product_id);
        if (productIds.length === 0) return res.json({ success: true, data: [] });
        
        const placeholders = productIds.map(() => '?').join(',');
        db.all(`SELECT id, name, image FROM products WHERE id IN (${placeholders})`, productIds, (err2, products) => {
            const productMap = {};
            products.forEach(p => { productMap[p.id] = p; });
            
            const result = rows.map(r => ({
                product_id: r.product_id,
                name: productMap[r.product_id]?.name || 'غير معروف',
                image: productMap[r.product_id]?.image,
                views: r.views
            }));
            res.json({ success: true, data: result });
        });
    });
});

// ============================================
// API: سلة المحذوفات (Trash)
// ============================================

app.get('/api/trash', (req, res) => {
    db.all(`SELECT * FROM trash ORDER BY deleted_at DESC`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/trash/restore/:id', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM trash WHERE id = ?`, [id], (err, item) => {
        if (err) return res.json({ success: false, error: err.message });
        if (!item) return res.json({ success: false, error: 'العنصر غير موجود' });
        
        const data = JSON.parse(item.item_data);
        
        if (item.item_type === 'product') {
            db.run(`INSERT INTO products (
                name, name_en, slug, sku, category_id, category_name, price, old_price, cost_price,
                stock, min_stock, weight, dimensions, image, images, colors, sizes,
                tags, brand, description, specifications, isActive, isFeatured
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [data.name, data.name_en, data.slug, data.sku, data.category_id, data.category_name,
                 data.price, data.old_price, data.cost_price, data.stock, data.min_stock, data.weight,
                 data.dimensions, data.image, data.images, data.colors, data.sizes, data.tags,
                 data.brand, data.description, data.specifications, 1, data.isFeatured || 0],
                function(err2) {
                    if (err2) return res.json({ success: false, error: err2.message });
                    db.run(`DELETE FROM trash WHERE id = ?`, [id]);
                    res.json({ success: true });
                });
        } else if (item.item_type === 'category') {
            db.run(`INSERT INTO categories (name, name_en, slug, icon, image, parent_id, level, sort_order, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [data.name, data.name_en, data.slug, data.icon, data.image, data.parent_id, data.level, data.sort_order, 1],
                function(err2) {
                    if (err2) return res.json({ success: false, error: err2.message });
                    db.run(`DELETE FROM trash WHERE id = ?`, [id]);
                    res.json({ success: true });
                });
        } else {
            res.json({ success: false, error: 'نوع العنصر غير معروف' });
        }
    });
});

app.delete('/api/trash/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM trash WHERE id = ?`, [id], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// ============================================
// API: الدردشة الحية (Chat)
// ============================================

app.get('/api/chat/messages', (req, res) => {
    db.all(`SELECT * FROM chat_messages ORDER BY created_at ASC LIMIT 100`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/chat/messages', (req, res) => {
    const { user_id, user_name, message } = req.body;
    
    db.run(`INSERT INTO chat_messages (user_id, user_name, message) VALUES (?, ?, ?)`,
        [user_id, user_name, message], function(err) {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

// ============================================
// API: رفع الملفات (Uploads)
// ============================================

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.json({ success: false, error: 'لم يتم رفع أي ملف' });
    
    const { user_id } = req.body;
    const fileUrl = `/assets/uploads/${req.file.filename}`;
    
    db.run(`INSERT INTO uploads (filename, original_name, file_type, file_size, user_id) VALUES (?, ?, ?, ?, ?)`,
        [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, user_id || 0]);
    
    res.json({ success: true, url: fileUrl, filename: req.file.filename });
});

// ============================================
// API: الإعدادات (Settings)
// ============================================

app.get('/api/settings', (req, res) => {
    db.all(`SELECT * FROM settings`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const settings = {};
        rows.forEach(row => { settings[row.key] = row.value; });
        res.json({ success: true, data: settings });
    });
});

app.put('/api/settings/:key', (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    db.run(`UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`, [value, key], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// ============================================
// API: سجل الأخطاء والنشاطات
// ============================================

app.get('/api/logs/errors', (req, res) => {
    db.all(`SELECT * FROM error_logs ORDER BY timestamp DESC LIMIT 100`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/logs/activities', (req, res) => {
    db.all(`SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.get('/api/notifications/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        db.get(`SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0`, [userId], (err2, count) => {
            res.json({ success: true, data: rows, unread: count?.unread || 0 });
        });
    });
});

app.put('/api/notifications/:id/read', (req, res) => {
    const { id } = req.params;
    db.run(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [id], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// ============================================
// الصفحات الأمامية
// ============================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ============================================
// تشغيل السيرفر
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الرعدي أونلاين يعمل على المنفذ ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`👑 المدير: admin@system.com / admin123`);
    console.log(`✅ جميع الجداول (21 جدولاً) جاهزة`);
    console.log(`✅ النظام متكامل بالكامل`);
});
