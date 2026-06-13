// ⚡ الرعدي أونلاين – الخادم الأسطوري v16.0 FIXED
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;

// ==================== Middleware ====================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'alradi-super-secret-key-2024';

// ==================== قاعدة بيانات محلية مبسطة ====================
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// دوال مساعدة للقراءة والكتابة
function readDB(collection) {
    const filePath = path.join(dataDir, `${collection}.json`);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([], null, 2));
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return [];
    }
}

function writeDB(collection, data) {
    fs.writeFileSync(path.join(dataDir, `${collection}.json`), JSON.stringify(data, null, 2));
}

// عمليات قاعدة البيانات المبسطة
const DB = {
    users: {
        find: (filter) => {
            let data = readDB('users');
            if (filter.email) data = data.filter(u => u.email === filter.email);
            if (filter.phone) data = data.filter(u => u.phone === filter.phone);
            if (filter._id) data = data.filter(u => u._id === filter._id);
            if (filter.role) data = data.filter(u => u.role === filter.role);
            return {
                toArray: () => data,
                limit: (n) => data.slice(0, n)
            };
        },
        findOne: (filter) => {
            let data = readDB('users');
            if (filter.email) return data.find(u => u.email === filter.email) || null;
            if (filter.phone) return data.find(u => u.phone === filter.phone) || null;
            if (filter._id) return data.find(u => u._id === filter._id) || null;
            return null;
        },
        insertOne: async (doc) => {
            const data = readDB('users');
            const newDoc = { ...doc, _id: Date.now().toString() + Math.random().toString(36).substring(2, 8) };
            data.push(newDoc);
            writeDB('users', data);
            return newDoc;
        },
        updateOne: async (filter, update) => {
            const data = readDB('users');
            const index = data.findIndex(u => u.email === filter.email || u._id === filter._id);
            if (index !== -1) {
                if (update.$set) Object.assign(data[index], update.$set);
                writeDB('users', data);
                return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
        },
        countDocuments: async () => readDB('users').length
    },
    products: {
        find: (filter = {}) => {
            let data = readDB('products');
            if (filter.category && filter.category !== 'all') data = data.filter(p => p.category === filter.category);
            if (filter.isActive !== undefined) data = data.filter(p => p.isActive === filter.isActive);
            return {
                sort: (sortObj) => {
                    const key = Object.keys(sortObj)[0];
                    data.sort((a, b) => sortObj[key] === -1 ? (b[key] || 0) - (a[key] || 0) : (a[key] || 0) - (b[key] || 0));
                    return this;
                },
                toArray: () => data,
                limit: (n) => data.slice(0, n)
            };
        },
        findOne: async (filter) => {
            const data = readDB('products');
            if (filter._id) return data.find(p => p._id === filter._id) || null;
            return null;
        },
        insertOne: async (doc) => {
            const data = readDB('products');
            const newDoc = { ...doc, _id: Date.now().toString() + Math.random().toString(36).substring(2, 8), createdAt: new Date(), updatedAt: new Date() };
            data.push(newDoc);
            writeDB('products', data);
            return newDoc;
        },
        updateOne: async (filter, update) => {
            const data = readDB('products');
            const index = data.findIndex(p => p._id === filter._id);
            if (index !== -1) {
                if (update.$set) Object.assign(data[index], update.$set);
                if (update.$inc) {
                    Object.keys(update.$inc).forEach(key => {
                        data[index][key] = (data[index][key] || 0) + update.$inc[key];
                    });
                }
                data[index].updatedAt = new Date();
                writeDB('products', data);
                return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
        },
        deleteOne: async (filter) => {
            let data = readDB('products');
            const newData = data.filter(p => p._id !== filter._id);
            writeDB('products', newData);
            return { deletedCount: data.length - newData.length };
        },
        countDocuments: async () => readDB('products').length
    },
    orders: {
        find: (filter = {}) => {
            let data = readDB('orders');
            if (filter.user) data = data.filter(o => o.user === filter.user);
            if (filter.status) data = data.filter(o => o.status === filter.status);
            return {
                sort: (sortObj) => {
                    const key = Object.keys(sortObj)[0];
                    data.sort((a, b) => sortObj[key] === -1 ? new Date(b[key]) - new Date(a[key]) : new Date(a[key]) - new Date(b[key]));
                    return this;
                },
                toArray: () => data
            };
        },
        findOne: async (filter) => {
            const data = readDB('orders');
            if (filter._id) return data.find(o => o._id === filter._id) || null;
            if (filter.orderNumber) return data.find(o => o.orderNumber === filter.orderNumber) || null;
            return null;
        },
        insertOne: async (doc) => {
            const data = readDB('orders');
            const newDoc = { ...doc, _id: Date.now().toString() + Math.random().toString(36).substring(2, 8), createdAt: new Date(), updatedAt: new Date() };
            data.push(newDoc);
            writeDB('orders', data);
            return newDoc;
        },
        updateOne: async (filter, update) => {
            const data = readDB('orders');
            const index = data.findIndex(o => o._id === filter._id);
            if (index !== -1) {
                if (update.$set) Object.assign(data[index], update.$set);
                data[index].updatedAt = new Date();
                writeDB('orders', data);
                return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
        },
        countDocuments: async (filter = {}) => {
            let data = readDB('orders');
            if (filter.status) data = data.filter(o => o.status === filter.status);
            return data.length;
        }
    },
    coupons: {
        find: (filter = {}) => {
            let data = readDB('coupons');
            if (filter.isActive !== undefined) data = data.filter(c => c.isActive === filter.isActive);
            return { toArray: () => data };
        },
        findOne: async (filter) => {
            const data = readDB('coupons');
            if (filter.code) return data.find(c => c.code === filter.code) || null;
            return null;
        },
        insertOne: async (doc) => {
            const data = readDB('coupons');
            const newDoc = { ...doc, _id: Date.now().toString() + Math.random().toString(36).substring(2, 8), usedCount: 0, createdAt: new Date() };
            data.push(newDoc);
            writeDB('coupons', data);
            return newDoc;
        },
        updateOne: async (filter, update) => {
            const data = readDB('coupons');
            const index = data.findIndex(c => c.code === filter.code);
            if (index !== -1) {
                if (update.$set) Object.assign(data[index], update.$set);
                if (update.$inc) data[index].usedCount = (data[index].usedCount || 0) + update.$inc.usedCount;
                writeDB('coupons', data);
                return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
        },
        deleteOne: async (filter) => {
            let data = readDB('coupons');
            const newData = data.filter(c => c.code !== filter.code);
            writeDB('coupons', newData);
            return { deletedCount: data.length - newData.length };
        }
    },
    categories: {
        find: (filter = {}) => {
            let data = readDB('categories');
            if (filter.isActive !== undefined) data = data.filter(c => c.isActive === filter.isActive);
            return {
                sort: () => ({ toArray: () => data }),
                toArray: () => data
            };
        },
        findOne: async (filter) => {
            const data = readDB('categories');
            if (filter._id) return data.find(c => c._id === filter._id) || null;
            if (filter.name) return data.find(c => c.name === filter.name) || null;
            return null;
        },
        insertOne: async (doc) => {
            const data = readDB('categories');
            const newDoc = { ...doc, _id: Date.now().toString() + Math.random().toString(36).substring(2, 8), createdAt: new Date() };
            data.push(newDoc);
            writeDB('categories', data);
            return newDoc;
        },
        updateOne: async (filter, update) => {
            const data = readDB('categories');
            const index = data.findIndex(c => c._id === filter._id);
            if (index !== -1) {
                if (update.$set) Object.assign(data[index], update.$set);
                writeDB('categories', data);
                return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
        },
        deleteOne: async (filter) => {
            let data = readDB('categories');
            const newData = data.filter(c => c._id !== filter._id);
            writeDB('categories', newData);
            return { deletedCount: data.length - newData.length };
        }
    },
    banners: {
        find: (filter = {}) => {
            let data = readDB('banners');
            if (filter.isActive !== undefined) data = data.filter(b => b.isActive === filter.isActive);
            return {
                sort: () => ({ toArray: () => data }),
                toArray: () => data
            };
        },
        insertOne: async (doc) => {
            const data = readDB('banners');
            const newDoc = { ...doc, _id: Date.now().toString() + Math.random().toString(36).substring(2, 8), createdAt: new Date() };
            data.push(newDoc);
            writeDB('banners', data);
            return newDoc;
        },
        deleteOne: async (filter) => {
            let data = readDB('banners');
            const newData = data.filter(b => b._id !== filter._id);
            writeDB('banners', newData);
            return { deletedCount: data.length - newData.length };
        }
    },
    settings: {
        findOne: async (filter) => {
            const data = readDB('settings');
            if (filter.type) return data.find(s => s.type === filter.type) || null;
            return null;
        },
        updateOne: async (filter, update, options) => {
            let data = readDB('settings');
            const index = data.findIndex(s => s.type === filter.type);
            if (index !== -1) {
                if (update.$set) Object.assign(data[index], update.$set);
                writeDB('settings', data);
                return { modifiedCount: 1 };
            } else {
                const newDoc = { type: filter.type, data: update.$set, createdAt: new Date() };
                data.push(newDoc);
                writeDB('settings', data);
                return { modifiedCount: 1 };
            }
        },
        insertOne: async (doc) => {
            const data = readDB('settings');
            data.push(doc);
            writeDB('settings', data);
            return doc;
        }
    },
    trash: {
        find: () => ({ toArray: () => [] }),
        insertOne: async () => ({}),
        deleteOne: async () => ({})
    }
};

console.log('💾 استخدام التخزين المحلي (LocalDB)');

// ==================== Middleware للمصادقة ====================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }
    try {
        req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        next();
    } catch {
        req.user = null;
        next();
    }
}

function adminRequired(req, res, next) {
    if (!req.user || !['admin', 'superadmin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
    }
    next();
}

app.use(authMiddleware);

// ==================== إنشاء البيانات الافتراضية ====================
async function seedDatabase() {
    try {
        // إنشاء حساب المدير
        const adminExists = await DB.users.findOne({ email: 'alradi@gmail.com' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await DB.users.insertOne({
                fullName: 'الرعدي',
                email: 'alradi@gmail.com',
                phone: '+966500000000',
                password: hashedPassword,
                role: 'superadmin',
                isActive: true,
                loyaltyPoints: 9999,
                loyaltyTier: 'أسطوري',
                createdAt: new Date()
            });
            console.log('✅ تم إنشاء حساب المدير: alradi@gmail.com / admin123');
        }

        // إنشاء حساب العميل التجريبي
        const customerExists = await DB.users.findOne({ phone: '+966511111111' });
        if (!customerExists) {
            const hashedPassword = await bcrypt.hash('customer123', 10);
            await DB.users.insertOne({
                fullName: 'أبو يزن',
                email: 'customer@alradi.com',
                phone: '+966511111111',
                password: hashedPassword,
                role: 'customer',
                isActive: true,
                loyaltyPoints: 1250,
                loyaltyTier: 'ذهبي',
                createdAt: new Date()
            });
            console.log('✅ تم إنشاء حساب العميل: customer@alradi.com / customer123');
        }

        // إنشاء المنتجات الافتراضية
        const productsCount = await DB.products.countDocuments();
        if (productsCount === 0) {
            const products = [
                { name: '📱 ساعة ذكية فاخرة Pro Max', price: 599, comparePrice: 899, stock: 50, category: 'إلكترونيات', description: 'شاشة AMOLED، مقاومة للماء، GPS', isActive: true, isFeatured: true, salesCount: 45, images: [{ url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', type: 'main' }], rating: 4.5, ratingCount: 120 },
                { name: '🎧 سماعات لاسلكية بريميوم ANC', price: 349, stock: 100, category: 'إلكترونيات', description: 'إلغاء الضوضاء، جودة Hi-Res', isActive: true, isFeatured: true, salesCount: 72, images: [{ url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', type: 'main' }], rating: 4.2, ratingCount: 85 },
                { name: '🧴 عطر شرقي فاخر 100ml', price: 450, comparePrice: 600, stock: 30, category: 'عطور', description: 'العود، المسك، العنبر', isActive: true, salesCount: 150, images: [{ url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400', type: 'main' }], rating: 4.8, ratingCount: 200 },
                { name: '👜 حقيبة يد جلد طبيعي', price: 799, stock: 15, category: 'أزياء', description: 'جلد طبيعي 100%', isActive: true, salesCount: 20, images: [{ url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400', type: 'main' }], rating: 4.0, ratingCount: 45 },
                { name: '📱 هاتف ذكي Ultra 5G', price: 2999, comparePrice: 3499, stock: 12, category: 'إلكترونيات', description: 'شاشة 6.8 بوصة، كاميرا 200MP', isActive: true, isFeatured: true, salesCount: 90, images: [{ url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400', type: 'main' }], rating: 4.7, ratingCount: 310 }
            ];
            for (const p of products) {
                await DB.products.insertOne(p);
            }
            console.log('✅ تم إنشاء 5 منتجات افتراضية');
        }

        // إنشاء الأقسام الافتراضية
        const categoriesCount = (await DB.categories.find().toArray()).length;
        if (categoriesCount === 0) {
            const categories = [
                { name: 'إلكترونيات', icon: '📱', isActive: true, order: 1 },
                { name: 'أزياء', icon: '👕', isActive: true, order: 2 },
                { name: 'عطور', icon: '🧴', isActive: true, order: 3 },
                { name: 'منزل', icon: '🏠', isActive: true, order: 4 },
                { name: 'ساعات', icon: '⌚', isActive: true, order: 5 },
                { name: 'أحذية', icon: '👟', isActive: true, order: 6 },
                { name: 'رياضة', icon: '⚽', isActive: true, order: 7 }
            ];
            for (const cat of categories) {
                await DB.categories.insertOne(cat);
            }
            console.log('✅ تم إنشاء 7 أقسام افتراضية');
        }

        // إنشاء الكوبونات الافتراضية
        const couponsCount = (await DB.coupons.find().toArray()).length;
        if (couponsCount === 0) {
            const coupons = [
                { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, minOrderAmount: 100, maxUses: 1000, usedCount: 0, isActive: true, description: 'خصم 10% للعملاء الجدد' },
                { code: 'RAAD40', discountType: 'percentage', discountValue: 40, minOrderAmount: 200, maxUses: 500, usedCount: 0, isActive: true, description: 'خصم 40% على جميع المنتجات' },
                { code: 'FLASH50', discountType: 'fixed', discountValue: 50, minOrderAmount: 500, maxUses: 500, usedCount: 0, isActive: true, description: 'خصم 50 ريال' }
            ];
            for (const c of coupons) {
                await DB.coupons.insertOne(c);
            }
            console.log('✅ تم إنشاء 3 كوبونات افتراضية');
        }

        // إنشاء الإعدادات الافتراضية
        const shippingSetting = await DB.settings.findOne({ type: 'shipping' });
        if (!shippingSetting) {
            await DB.settings.insertOne({ type: 'shipping', data: { freeShippingThreshold: 500, internalCost: 25 } });
            await DB.settings.insertOne({ type: 'tax', data: { rate: 15 } });
            console.log('✅ تم إنشاء الإعدادات الافتراضية');
        }

    } catch (error) {
        console.error('❌ خطأ في إنشاء البيانات:', error.message);
    }
}

// ==================== API: المصادقة ====================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });

        const user = await DB.users.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
        if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

        if (!user.isActive) return res.status(403).json({ error: 'الحساب معطل' });

        const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                loyaltyPoints: user.loyaltyPoints || 0,
                loyaltyTier: user.loyaltyTier || 'برونزي'
            }
        });
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'فشل تسجيل الدخول' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, phone, password, country, city, email } = req.body;
        if (!fullName || !phone || !password) return res.status(400).json({ error: 'الاسم والجوال وكلمة المرور مطلوبة' });

        const existing = await DB.users.findOne({ $or: [{ phone }, { email }] });
        if (existing) return res.status(400).json({ error: 'رقم الجوال أو البريد مسجل مسبقاً' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await DB.users.insertOne({
            fullName, phone, email: email || `${phone}@temp.com`, password: hashedPassword,
            role: 'customer', country: country || 'السعودية', city: city || '',
            isActive: true, loyaltyPoints: 100, loyaltyTier: 'برونزي', createdAt: new Date()
        });

        const token = jwt.sign({ id: newUser._id, role: newUser.role, email: newUser.email }, JWT_SECRET, { expiresIn: '30d' });

        res.status(201).json({
            success: true, token,
            user: { id: newUser._id, fullName, email: newUser.email, phone, role: 'customer', loyaltyPoints: 100, loyaltyTier: 'برونزي' }
        });
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ error: 'فشل إنشاء الحساب' });
    }
});

// ==================== API: المنتجات ====================
app.get('/api/products', async (req, res) => {
    try {
        const { page = 1, limit = 12, category, search, sort = '-createdAt' } = req.query;
        let products = await DB.products.find({ isActive: true }).toArray();

        if (category && category !== 'all' && category !== 'undefined') products = products.filter(p => p.category === category);
        if (search) {
            const term = search.toLowerCase();
            products = products.filter(p => p.name?.toLowerCase().includes(term) || p.description?.toLowerCase().includes(term));
        }

        products.sort((a, b) => {
            if (sort === 'price-asc') return a.price - b.price;
            if (sort === 'price-desc') return b.price - a.price;
            if (sort === 'bestselling') return (b.salesCount || 0) - (a.salesCount || 0);
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        const total = products.length;
        const paginated = products.slice((page - 1) * limit, page * limit);

        res.json({ success: true, data: paginated, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
    } catch (error) {
        console.error('خطأ في جلب المنتجات:', error);
        res.status(500).json({ error: 'فشل جلب المنتجات' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await DB.products.findOne({ _id: req.params.id });
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ error: 'فشل جلب المنتج' });
    }
});

// ==================== API: الأقسام ====================
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await DB.categories.find({ isActive: true }).toArray();
        res.json({ success: true, data: categories });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ==================== API: البانرات ====================
app.get('/api/banners', async (req, res) => {
    try {
        const banners = await DB.banners.find({ isActive: true }).toArray();
        res.json({ success: true, data: banners });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ==================== API: الكوبونات ====================
app.get('/api/coupons', async (req, res) => {
    try {
        const coupons = await DB.coupons.find({ isActive: true }).toArray();
        res.json({ success: true, data: coupons });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ==================== API: الطلبات (للمدير) ====================
app.get('/api/admin/orders', adminRequired, async (req, res) => {
    try {
        const orders = await DB.orders.find().sort({ createdAt: -1 }).toArray();
        res.json({ success: true, data: orders });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ==================== API: العملاء (للمدير) ====================
app.get('/api/admin/customers', adminRequired, async (req, res) => {
    try {
        const customers = await DB.users.find({ role: 'customer' }).toArray();
        res.json({ success: true, data: customers });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ==================== API: الإحصائيات (للمدير) ====================
app.get('/api/admin/stats', adminRequired, async (req, res) => {
    try {
        const orders = await DB.orders.find().toArray();
        const products = await DB.products.find({ isActive: true }).toArray();
        const customers = await DB.users.find({ role: 'customer' }).toArray();
        const totalRevenue = orders.reduce((s, o) => s + (o.pricing?.total || 0), 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayOrders = orders.filter(o => new Date(o.createdAt) >= today).length;
        const lowStockProducts = products.filter(p => p.stock <= 5).length;

        res.json({
            success: true,
            data: {
                totalOrders: orders.length,
                totalProducts: products.length,
                totalCustomers: customers.length,
                totalRevenue,
                todayOrders,
                lowStockProducts,
                pendingOrders: orders.filter(o => o.status === 'pending').length,
                recentOrders: orders.slice(0, 10),
                bestSellingProducts: products.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0)).slice(0, 10),
                lowStockProductsList: products.filter(p => p.stock <= 5).slice(0, 10)
            }
        });
    } catch (error) {
        res.json({ success: true, data: { totalOrders: 0, totalProducts: 0, totalCustomers: 0, totalRevenue: 0, todayOrders: 0, lowStockProducts: 0, pendingOrders: 0, recentOrders: [], bestSellingProducts: [], lowStockProductsList: [] } });
    }
});

// ==================== API: الملف الشخصي ====================
app.get('/api/user/profile', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    try {
        const user = await DB.users.findOne({ _id: req.user.id });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ error: 'فشل جلب البيانات' });
    }
});

// ==================== الصفحات ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== بدء التشغيل ====================
(async () => {
    const dirs = ['public', 'data'];
    dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

    await seedDatabase();

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  🦅 الرعدي أونلاين – النسخة الأسطورية النهائية v16.0                        ║
║  ⚡ سوق السعودية الأول – منصة تسوق عالمية متكاملة                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  🌐 الخادم: http://localhost:${PORT}                                         ║
║  👑 لوحة التحكم: http://localhost:${PORT}/admin                             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  🔐 بيانات الدخول:                                                          ║
║  👤 المدير: alradi@gmail.com  |  كلمة السر: admin123                        ║
║  👤 العميل: customer@alradi.com  |  كلمة السر: customer123                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  💾 التخزين: LocalDB (ملفات JSON) – يعمل بدون MongoDB                       ║
║  🚀 جاهز للإطلاق على Render                                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
        `);
    });
})();
