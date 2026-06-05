// ============================================================
// ملف الخادم الرئيسي - server.js
// هذا الملف هو قلب المتجر، يدير كل الطلبات والدردشة وقاعدة البيانات
// ============================================================

// استيراد المكتبات المطلوبة
const express = require('express');      // إطار العمل لبناء الخادم
const path = require('path');            // للتعامل مع مسارات الملفات
const fs = require('fs');                // للتعامل مع الملفات (حفظ البيانات)

const app = express();                   // إنشاء تطبيق الخادم
const PORT = process.env.PORT || 3000;   // المنفذ الذي سيعمل عليه الخادم

// ============================================================
// إعدادات الخادم الأساسية
// ============================================================

// السماح بقراءة البيانات القادمة من الواجهة (JSON)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// خدمة الملفات الثابتة (HTML, CSS, JS) من المجلد الحالي
app.use(express.static(__dirname));

// ============================================================
// ملفات البيانات (تخزين معلومات المتجر)
// ============================================================

// مسارات ملفات التخزين
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// دوال مساعدة لقراءة وحفظ البيانات
function readData(filePath, defaultValue = []) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        return defaultValue;
    } catch (error) {
        console.error('خطأ في قراءة الملف:', error);
        return defaultValue;
    }
}

function saveData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('خطأ في حفظ الملف:', error);
        return false;
    }
}

// ============================================================
// بيانات افتراضية عند أول تشغيل
// ============================================================

// المنتجات الافتراضية
let products = readData(PRODUCTS_FILE, []);
if (products.length === 0) {
    products = [
        {
            id: 1,
            name: "هاتف الرعدي الذكي برو X",
            category: "هواتف",
            price: 2999,
            oldPrice: 3499,
            discount: 15,
            color: "أسود تيتانيوم",
            features: "كاميرا بدقة 200 ميجابكسل، شاشة 6.8 بوصة، معالج فائق السرعة",
            stock: 10,
            image: "https://picsum.photos/id/0/300/300",
            rating: 4.8
        },
        {
            id: 2,
            name: "عطر بلو دي شانيل الأصلي",
            category: "عطور",
            price: 4140,
            oldPrice: 4600,
            discount: 10,
            color: "شفاف كحلي غامق",
            features: "رائحة خشبية فاخرة، تدوم طويلاً",
            stock: 5,
            image: "https://picsum.photos/id/1/300/300",
            rating: 4.9
        },
        {
            id: 3,
            name: "سماعة أبل إيربودز برو",
            category: "إكسسوارات",
            price: 899,
            oldPrice: 1099,
            discount: 18,
            color: "أبيض ناصع",
            features: "تقنية عزل الضوضاء، صوت محيطي",
            stock: 15,
            image: "https://picsum.photos/id/2/300/300",
            rating: 4.7
        },
        {
            id: 4,
            name: "سامسونج جالكسي S24 الترا",
            category: "هواتف",
            price: 4940,
            oldPrice: 5200,
            discount: 5,
            color: "رمادي تيتانيوم",
            features: "كاميرا 200 ميجابكسل، قلم S-Pen، سعة 512 جيجا",
            stock: 7,
            image: "https://picsum.photos/id/3/300/300",
            rating: 4.9
        },
        {
            id: 5,
            name: "ساعة أبل الترا 2",
            category: "إكسسوارات",
            price: 2799,
            oldPrice: 3299,
            discount: 15,
            color: "تيتانيوم",
            features: "مقاومة للماء، بطارية تدوم 36 ساعة",
            stock: 8,
            image: "https://picsum.photos/id/4/300/300",
            rating: 4.8
        },
        {
            id: 6,
            name: "عطر توم فورد أود وود",
            category: "عطور",
            price: 550,
            oldPrice: 650,
            discount: 15,
            color: "بني داكن",
            features: "رائحة خشبية دافئة",
            stock: 12,
            image: "https://picsum.photos/id/5/300/300",
            rating: 4.6
        }
    ];
    saveData(PRODUCTS_FILE, products);
}

// الأقسام (يتم استخراجها من المنتجات تلقائياً)
let categories = [...new Set(products.map(p => p.category))];

// المستخدمين الافتراضيين
let users = readData(USERS_FILE, []);
if (users.length === 0) {
    users = [
        { id: 1, username: "admin", email: "admin@raadi.com", password: "admin123", role: "admin", name: "المدير" }
    ];
    saveData(USERS_FILE, users);
}

// الطلبات
let orders = readData(ORDERS_FILE, []);

// رسائل الدردشة
let messages = readData(MESSAGES_FILE, []);

// ============================================================
// API - مسارات لجلب البيانات (للواجهة الأمامية)
// ============================================================

// جلب جميع المنتجات
app.get('/api/products', (req, res) => {
    res.json(products);
});

// جلب الأقسام
app.get('/api/categories', (req, res) => {
    res.json(categories);
});

// جلب منتج حسب المعرف
app.get('/api/products/:id', (req, res) => {
    const product = products.find(p => p.id == req.params.id);
    res.json(product || null);
});

// ============================================================
// API - إدارة المنتجات (للمدير فقط)
// ============================================================

// إضافة منتج جديد
app.post('/api/products', (req, res) => {
    const { name, category, price, oldPrice, discount, color, features, stock, image } = req.body;
    const newProduct = {
        id: Date.now(),
        name,
        category,
        price: Number(price),
        oldPrice: oldPrice ? Number(oldPrice) : Number(price),
        discount: Number(discount) || 0,
        color: color || '',
        features: features || '',
        stock: Number(stock) || 0,
        image: image || 'https://picsum.photos/id/20/300/300',
        rating: 0
    };
    products.push(newProduct);
    saveData(PRODUCTS_FILE, products);
    
    // تحديث الأقسام
    categories = [...new Set(products.map(p => p.category))];
    res.json({ success: true, product: newProduct });
});

// تحديث منتج
app.put('/api/products/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = products.findIndex(p => p.id === id);
    if (index !== -1) {
        products[index] = { ...products[index], ...req.body };
        saveData(PRODUCTS_FILE, products);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المنتج غير موجود' });
    }
});

// حذف منتج
app.delete('/api/products/:id', (req, res) => {
    const id = parseInt(req.params.id);
    products = products.filter(p => p.id !== id);
    saveData(PRODUCTS_FILE, products);
    categories = [...new Set(products.map(p => p.category))];
    res.json({ success: true });
});

// ============================================================
// API - إدارة الطلبات
// ============================================================

// إنشاء طلب جديد
app.post('/api/orders', (req, res) => {
    const { customer, email, phone, address, items, total, shippingMethod } = req.body;
    const newOrder = {
        id: Date.now(),
        orderNumber: 'RAD-' + Math.floor(Math.random() * 1000000),
        customer,
        email,
        phone,
        address,
        items,
        total: Number(total),
        shippingMethod,
        status: 'قيد المعالجة',
        date: new Date().toISOString(),
        dateFormatted: new Date().toLocaleDateString('ar-EG')
    };
    orders.push(newOrder);
    saveData(ORDERS_FILE, orders);
    
    // تقليل المخزون
    items.forEach(item => {
        const product = products.find(p => p.id == item.id);
        if (product) {
            product.stock -= item.quantity;
        }
    });
    saveData(PRODUCTS_FILE, products);
    
    res.json({ success: true, order: newOrder });
});

// جلب جميع الطلبات (للمدير)
app.get('/api/orders', (req, res) => {
    res.json(orders);
});

// تحديث حالة الطلب
app.put('/api/orders/:id/status', (req, res) => {
    const id = parseInt(req.params.id);
    const order = orders.find(o => o.id === id);
    if (order) {
        order.status = req.body.status;
        saveData(ORDERS_FILE, orders);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'الطلب غير موجود' });
    }
});

// ============================================================
// API - نظام المصادقة (تسجيل الدخول)
// ============================================================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } else {
        res.status(401).json({ success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
});

// تسجيل مستخدم جديد
app.post('/api/register', (req, res) => {
    const { name, email, password, phone } = req.body;
    if (users.find(u => u.email === email)) {
        res.status(400).json({ success: false, error: 'البريد الإلكتروني مسجل بالفعل' });
        return;
    }
    const newUser = {
        id: Date.now(),
        name,
        email,
        password,
        phone: phone || '',
        role: 'user',
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveData(USERS_FILE, users);
    res.json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
});

// جلب جميع المستخدمين (للمدير)
app.get('/api/users', (req, res) => {
    res.json(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, createdAt: u.createdAt })));
});

// ============================================================
// API - الدردشة الحية
// ============================================================

// جلب جميع الرسائل
app.get('/api/messages', (req, res) => {
    res.json(messages);
});

// إرسال رسالة جديدة
app.post('/api/messages', (req, res) => {
    const { sender, text, isAdmin } = req.body;
    const newMessage = {
        id: Date.now(),
        sender,
        text,
        isAdmin: isAdmin || false,
        timestamp: new Date().toISOString(),
        timeFormatted: new Date().toLocaleTimeString('ar-EG')
    };
    messages.push(newMessage);
    saveData(MESSAGES_FILE, messages);
    res.json({ success: true, message: newMessage });
});

// ============================================================
// API - الإحصائيات (للوحة التحكم)
// ============================================================

app.get('/api/stats', (req, res) => {
    const totalUsers = users.filter(u => u.role !== 'admin').length;
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const todayRevenue = orders.filter(o => {
        const today = new Date().toDateString();
        return new Date(o.date).toDateString() === today;
    }).reduce((sum, o) => sum + o.total, 0);
    
    res.json({
        totalUsers,
        totalOrders,
        totalRevenue,
        todayRevenue,
        totalProducts: products.length,
        lowStockProducts: products.filter(p => p.stock < 5).length
    });
});

// ============================================================
// مسارات الصفحات (HTML)
// ============================================================

// الصفحة الرئيسية للمتجر
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// لوحة تحكم المدير
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// صفحة تسجيل الدخول (إذا أردت منفصلة)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// ============================================================
// تشغيل الخادم
// ============================================================
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 متجر الرعدي الأسطوري يعمل الآن!`);
    console.log(`📍 الرابط: http://localhost:${PORT}`);
    console.log(`👑 حساب المدير: admin@raadi.com / admin123`);
    console.log(`========================================`);
});