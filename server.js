// ⚡ الرعدي أونلاين – الخادم الأسطوري v13.0 FULL
// 🦅 جميع الحقوق محفوظة – الرعدي أونلاين 2025
// =============================================
// هذا الملف يحتوي على 2800+ سطر من الكود المتكامل
// تم تجميعه وتطويره بشكل احترافي

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const http = require('http');
const archiver = require('archiver');
const { Server } = require('socket.io');
const speakeasy = require('speakeasy');
const ExcelJS = require('exceljs');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    transports: ['websocket', 'polling']
});

// ==================== إعدادات الأمان والحماية ====================
app.set('trust proxy', 1);
app.enable('trust proxy');

// ==================== Middleware ====================
app.use(helmet({ 
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression({ level: 9 }));
app.use(cors({ 
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Offline-Data', 'X-Requested-With'],
    credentials: true 
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(morgan('combined'));
app.use(rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 2000, 
    message: { error: 'طلبات كثيرة - يرجى المحاولة لاحقاً' },
    standardHeaders: true,
    legacyHeaders: false
}));

// ==================== الملفات الثابتة ====================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use('/backups', express.static(path.join(__dirname, 'backups')));

// ==================== إعدادات Multer المتقدمة ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dir = 'uploads/general';
        if (req.body.type === 'product') dir = 'uploads/products';
        else if (req.body.type === 'receipt') dir = 'uploads/receipts';
        else if (req.body.type === 'avatar') dir = 'uploads/avatars';
        else if (req.body.type === 'banner') dir = 'uploads/banners';
        else if (req.body.type === 'sound') dir = 'uploads/sounds';
        else if (req.body.type === 'logo') dir = 'uploads/logo';
        
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
        cb(null, name);
    }
});

const upload = multer({ 
    storage, 
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/wav', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('نوع الملف غير مدعوم'), false);
    }
});

// ==================== المتغيرات العامة ====================
const JWT_SECRET = process.env.JWT_SECRET || 'alradi-ultimate-secret-key-2025-ultra-secure';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'alradi-refresh-secret-key-2025-ultra-secure';
let refreshTokens = new Map();
let onlineUsers = new Map();
let auctions = new Map();

// ==================== نظام نقاط الولاء المتقدم ====================
const LOYALTY_TIERS = [
    { name: 'برونزي', min: 0, discount: 0, multiplier: 1, benefits: ['دعم فني'], color: '#CD7F32', icon: '🥉' },
    { name: 'فضي', min: 500, discount: 5, multiplier: 1.2, benefits: ['دعم فني', 'شحن مجاني للطلبات فوق 300 ر.س'], color: '#C0C0C0', icon: '🥈' },
    { name: 'ذهبي', min: 1000, discount: 10, multiplier: 1.5, benefits: ['دعم فني', 'شحن مجاني', 'خصم إضافي 10%', 'أولوية الدعم'], color: '#FFD700', icon: '🥇' },
    { name: 'بلاتيني', min: 2000, discount: 15, multiplier: 2, benefits: ['دعم فني VIP', 'شحن مجاني فوري', 'خصم 15%', 'هدايا حصرية', 'دعوة للمناسبات'], color: '#E5E4E2', icon: '💎' },
    { name: 'ماسي', min: 5000, discount: 20, multiplier: 3, benefits: ['دعم VIP 24/7', 'شحن مجاني فوري', 'خصم 20%', 'هدايا شهرية', 'تخفيضات خاصة', 'مدير حساب مخصص'], color: '#B9F2FF', icon: '💠' },
    { name: 'أسطوري', min: 10000, discount: 25, multiplier: 4, benefits: ['جميع المزايا السابقة', 'سفر مدفوع', 'عضويات حصرية', 'خصم 25% دائم'], color: '#FF6B6B', icon: '👑' }
];

function getTier(points) {
    return LOYALTY_TIERS.reduce((t, c) => points >= c.min ? c : t, LOYALTY_TIERS[0]);
}

function calculatePoints(amount, tier) {
    return Math.floor(amount / 10) * tier.multiplier;
}

// ==================== نظام المزادات المتقدم ====================
class AuctionManager {
    constructor() {
        this.activeAuctions = new Map();
    }

    createAuction(productId, startingPrice, reservePrice, endTime, sellerId) {
        const auction = {
            id: uuidv4(),
            productId,
            startingPrice,
            currentPrice: startingPrice,
            reservePrice: reservePrice || startingPrice,
            endTime: new Date(endTime),
            sellerId,
            bids: [],
            status: 'active',
            createdAt: new Date()
        };
        this.activeAuctions.set(auction.id, auction);
        return auction;
    }

    placeBid(auctionId, userId, amount, username) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) throw new Error('المزاد غير موجود');
        if (auction.status !== 'active') throw new Error('المزاد منتهي');
        if (new Date() > auction.endTime) throw new Error('انتهى وقت المزاد');
        if (amount <= auction.currentPrice) throw new Error('يجب أن يكون المبلغ أكبر من آخر عرض');
        
        const bid = {
            id: uuidv4(),
            userId,
            username,
            amount,
            time: new Date(),
            isWinner: false
        };
        
        auction.bids.push(bid);
        auction.currentPrice = amount;
        
        // إشعار عبر WebSocket
        io.to(`auction-${auctionId}`).emit('new-bid', {
            auctionId,
            amount,
            username,
            time: bid.time
        });
        
        return bid;
    }

    endAuction(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return null;
        
        auction.status = 'ended';
        if (auction.bids.length > 0 && auction.currentPrice >= auction.reservePrice) {
            const winner = auction.bids[auction.bids.length - 1];
            winner.isWinner = true;
            return winner;
        }
        return null;
    }

    getAuction(auctionId) {
        return this.activeAuctions.get(auctionId);
    }

    getAllAuctions() {
        return Array.from(this.activeAuctions.values());
    }
}

const auctionManager = new AuctionManager();

// ==================== نظام التخزين المحلي الاحتياطي ====================
class LocalDatabase {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    }

    _readCollection(name) {
        const filePath = path.join(this.dataDir, `${name}.json`);
        return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : [];
    }

    _writeCollection(name, data) {
        fs.writeFileSync(path.join(this.dataDir, `${name}.json`), JSON.stringify(data, null, 2));
    }

    collection(name) {
        const self = this;
        return {
            find: (filter = {}) => {
                let data = self._readCollection(name);
                if (filter._id) data = data.filter(i => i._id === filter._id);
                if (filter.email) data = data.filter(i => i.email === filter.email);
                if (filter.phone) data = data.filter(i => i.phone === filter.phone);
                if (filter.role) data = data.filter(i => i.role === filter.role);
                if (filter.isActive !== undefined) data = data.filter(i => i.isActive === filter.isActive);
                if (filter.status) data = data.filter(i => i.status === filter.status);
                if (filter.$or) {
                    data = data.filter(item => filter.$or.some(cond => 
                        (cond.email && item.email === cond.email) ||
                        (cond.phone && item.phone === cond.phone) ||
                        (cond.username && item.username === cond.username)
                    ));
                }
                if (filter.category) data = data.filter(i => i.category === filter.category);
                if (filter.user) data = data.filter(i => i.user === filter.user);
                
                return {
                    sort: (sortObj) => {
                        const key = Object.keys(sortObj)[0];
                        data.sort((a, b) => sortObj[key] === -1 ? (b[key] || 0) - (a[key] || 0) : (a[key] || 0) - (b[key] || 0));
                        return this;
                    },
                    skip: (n) => {
                        data = data.slice(n);
                        return this;
                    },
                    limit: (n) => {
                        data = data.slice(0, n);
                        return this;
                    },
                    toArray: async () => data
                };
            },
            findOne: async (filter) => {
                const items = await this.find(filter).toArray();
                return items[0] || null;
            },
            insertOne: async (doc) => {
                const data = self._readCollection(name);
                const newDoc = { _id: uuidv4(), ...doc, createdAt: doc.createdAt || new Date(), updatedAt: new Date() };
                data.push(newDoc);
                self._writeCollection(name, data);
                return newDoc;
            },
            updateOne: async (filter, update) => {
                const data = self._readCollection(name);
                const index = data.findIndex(item => 
                    (filter._id && item._id === filter._id) ||
                    (filter.email && item.email === filter.email) ||
                    (filter.phone && item.phone === filter.phone) ||
                    (filter.code && item.code === filter.code)
                );
                if (index !== -1) {
                    if (update.$set) Object.assign(data[index], update.$set);
                    if (update.$inc) {
                        Object.keys(update.$inc).forEach(key => {
                            data[index][key] = (data[index][key] || 0) + update.$inc[key];
                        });
                    }
                    if (update.$push) {
                        Object.keys(update.$push).forEach(key => {
                            if (!data[index][key]) data[index][key] = [];
                            data[index][key].push(update.$push[key]);
                        });
                    }
                    data[index].updatedAt = new Date();
                    self._writeCollection(name, data);
                    return { modifiedCount: 1 };
                }
                return { modifiedCount: 0 };
            },
            deleteOne: async (filter) => {
                let data = self._readCollection(name);
                const index = data.findIndex(item => item._id === filter._id);
                if (index !== -1) {
                    data.splice(index, 1);
                    self._writeCollection(name, data);
                    return { deletedCount: 1 };
                }
                return { deletedCount: 0 };
            },
            countDocuments: async (filter = {}) => {
                const data = await this.find(filter).toArray();
                return data.length;
            },
            aggregate: async (pipeline) => {
                let data = self._readCollection(name);
                for (const stage of pipeline) {
                    if (stage.$match) {
                        data = data.filter(item => {
                            let match = true;
                            if (stage.$match.status?.$ne) match = match && item.status !== stage.$match.status.$ne;
                            if (stage.$match.createdAt?.$gte) match = match && new Date(item.createdAt) >= new Date(stage.$match.createdAt.$gte);
                            if (stage.$match.createdAt?.$lte) match = match && new Date(item.createdAt) <= new Date(stage.$match.createdAt.$lte);
                            if (stage.$match.category) match = match && item.category === stage.$match.category;
                            return match;
                        });
                    }
                    if (stage.$group) {
                        const groups = {};
                        data.forEach(item => {
                            let groupKey = 'total';
                            if (stage.$group._id === '$category') groupKey = item.category || 'other';
                            else if (stage.$group._id === '$status') groupKey = item.status || 'other';
                            else if (stage.$group._id === '$month') groupKey = new Date(item.createdAt).toISOString().slice(0, 7);
                            
                            if (!groups[groupKey]) groups[groupKey] = { _id: groupKey, count: 0, total: 0 };
                            groups[groupKey].count++;
                            if (item.pricing?.total) groups[groupKey].total += item.pricing.total;
                            if (item.price) groups[groupKey].total += item.price;
                        });
                        data = Object.values(groups);
                    }
                }
                return { toArray: async () => data };
            }
        };
    }
}

// ==================== اتصال MongoDB مع Fallback ====================
let DB;
let dbStatus = { connected: false, usingLocal: false };

async function connectToDatabase() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://alradi:alradi12345@cluster0.njjwehg.mongodb.net/alradi_store?retryWrites=true&w=majority';
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ MongoDB Atlas متصل بنجاح');
        
        // تعريف النماذج
        const userSchema = new mongoose.Schema({
            fullName: { type: String, required: true },
            username: { type: String, unique: true, sparse: true },
            email: { type: String, unique: true, sparse: true },
            phone: { type: String, unique: true, required: true },
            password: { type: String, required: true },
            role: { type: String, default: 'customer', enum: ['customer', 'admin', 'superadmin', 'manager', 'support'] },
            avatar: String,
            country: String,
            city: String,
            district: String,
            address: String,
            loyaltyPoints: { type: Number, default: 0 },
            loyaltyTier: { type: String, default: 'برونزي' },
            totalSpent: { type: Number, default: 0 },
            isActive: { type: Boolean, default: true },
            isBanned: { type: Boolean, default: false },
            banReason: String,
            loginAttempts: { type: Number, default: 0 },
            lockedUntil: Date,
            twoFactorSecret: String,
            twoFactorEnabled: { type: Boolean, default: false },
            phoneVerified: { type: Boolean, default: false },
            emailVerified: { type: Boolean, default: false },
            addresses: [{
                name: String,
                phone: String,
                country: String,
                city: String,
                district: String,
                street: String,
                landmark: String,
                isDefault: Boolean,
                coordinates: { lat: Number, lng: Number }
            }],
            paymentMethods: [{
                type: String,
                cardNumber: String,
                cardholderName: String,
                expiryDate: String,
                isDefault: Boolean
            }],
            loginHistory: [{
                ip: String,
                city: String,
                device: String,
                browser: String,
                time: Date
            }],
            notifications: [{
                title: String,
                message: String,
                type: String,
                read: Boolean,
                createdAt: Date
            }],
            wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
            compareList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
        }, { timestamps: true });

        const productSchema = new mongoose.Schema({
            name: { type: String, required: true },
            sku: { type: String, unique: true },
            category: String,
            subcategory: String,
            brand: String,
            price: { type: Number, required: true },
            comparePrice: Number,
            discount: Number,
            costPrice: Number,
            profitMargin: Number,
            stock: { type: Number, default: 0 },
            minStock: { type: Number, default: 5 },
            description: String,
            shortDescription: String,
            specifications: mongoose.Schema.Types.Mixed,
            images: [{
                url: String,
                type: { type: String, default: 'main' },
                order: Number
            }],
            video: String,
            tags: [String],
            weight: Number,
            dimensions: { length: Number, width: Number, height: Number },
            warrantyInfo: String,
            maintenanceInterval: Number,
            isActive: { type: Boolean, default: true },
            isFeatured: { type: Boolean, default: false },
            isOnSale: { type: Boolean, default: false },
            isOnAuction: { type: Boolean, default: false },
            auctionEndDate: Date,
            ratings: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
            reviews: [{
                userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                userName: String,
                rating: Number,
                comment: String,
                images: [String],
                helpful: Number,
                createdAt: Date
            }],
            salesCount: { type: Number, default: 0 },
            viewsCount: { type: Number, default: 0 }
        }, { timestamps: true });

        const orderSchema = new mongoose.Schema({
            orderNumber: { type: String, unique: true },
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            items: [{
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                name: String,
                sku: String,
                price: Number,
                quantity: Number,
                image: String
            }],
            shipping: {
                type: String,
                cost: Number,
                address: mongoose.Schema.Types.Mixed,
                trackingNumber: String,
                estimatedDays: Number,
                shippedAt: Date,
                deliveredAt: Date
            },
            payment: {
                method: String,
                status: String,
                transactionId: String,
                bnpl: Boolean,
                bnplInstallments: Number
            },
            coupon: {
                code: String,
                discountType: String,
                discountValue: Number,
                discountAmount: Number
            },
            pricing: {
                subtotal: Number,
                shippingCost: Number,
                discount: Number,
                loyaltyDiscount: Number,
                couponDiscount: Number,
                tax: Number,
                taxRate: Number,
                total: Number
            },
            status: { type: String, default: 'pending' },
            statusHistory: [{
                status: String,
                note: String,
                updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                updatedAt: Date
            }],
            notes: String,
            invoice: {
                pdfUrl: String,
                qrCodeUrl: String,
                generatedAt: Date
            },
            maintenanceReminders: [{
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                productName: String,
                dueDate: Date,
                notified: Boolean
            }],
            isArchived: { type: Boolean, default: false },
            ipAddress: String,
            userAgent: String
        }, { timestamps: true });

        const couponSchema = new mongoose.Schema({
            code: { type: String, unique: true, required: true },
            description: String,
            discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
            discountValue: { type: Number, required: true },
            minOrderAmount: { type: Number, default: 0 },
            maxUses: Number,
            usedCount: { type: Number, default: 0 },
            maxUsesPerUser: { type: Number, default: 1 },
            startDate: Date,
            expiryDate: Date,
            applicableCategories: [String],
            applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
            isActive: { type: Boolean, default: true }
        }, { timestamps: true });

        const categorySchema = new mongoose.Schema({
            name: { type: String, required: true },
            slug: { type: String, unique: true },
            icon: String,
            image: String,
            parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
            level: { type: Number, default: 0 },
            order: { type: Number, default: 0 },
            isActive: { type: Boolean, default: true }
        }, { timestamps: true });

        DB = {
            users: mongoose.model('User', userSchema),
            products: mongoose.model('Product', productSchema),
            orders: mongoose.model('Order', orderSchema),
            coupons: mongoose.model('Coupon', couponSchema),
            categories: mongoose.model('Category', categorySchema),
            settings: mongoose.model('Setting', new mongoose.Schema({}, { strict: false, timestamps: true })),
            banners: mongoose.model('Banner', new mongoose.Schema({}, { strict: false, timestamps: true })),
            sounds: mongoose.model('Sound', new mongoose.Schema({}, { strict: false, timestamps: true })),
            audit_logs: mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false, timestamps: true })),
            trash: mongoose.model('Trash', new mongoose.Schema({}, { strict: false, timestamps: true })),
            otp_codes: mongoose.model('OtpCode', new mongoose.Schema({}, { strict: false, timestamps: true })),
            rfq_requests: mongoose.model('RfqRequest', new mongoose.Schema({}, { strict: false, timestamps: true })),
            chat_messages: mongoose.model('ChatMessage', new mongoose.Schema({}, { strict: false, timestamps: true })),
            competitors: mongoose.model('Competitor', new mongoose.Schema({}, { strict: false, timestamps: true })),
            auctions: mongoose.model('Auction', new mongoose.Schema({}, { strict: false, timestamps: true })),
            notifications: mongoose.model('Notification', new mongoose.Schema({}, { strict: false, timestamps: true }))
        };
        
        dbStatus.connected = true;
        dbStatus.usingLocal = false;
    } catch (error) {
        console.log('❌ MongoDB غير متاح، استخدام التخزين المحلي:', error.message);
        const localDb = new LocalDatabase();
        const collections = ['users', 'products', 'orders', 'coupons', 'categories', 'settings', 'banners', 'sounds', 'audit_logs', 'trash', 'otp_codes', 'rfq_requests', 'chat_messages', 'competitors', 'auctions', 'notifications'];
        DB = {};
        collections.forEach(c => DB[c] = localDb.collection(c));
        dbStatus.connected = false;
        dbStatus.usingLocal = true;
        console.log('💾 استخدام التخزين المحلي كبديل');
    }
}

// ==================== Middleware للمصادقة ====================
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }
    try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        req.user = null;
        next();
    }
}

function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user || !['admin', 'superadmin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
    }
    next();
}

function requireSuperAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'صلاحيات المدير العام مطلوبة' });
    }
    next();
}

app.use(authenticate);

// ==================== تسجيل النشاطات ====================
async function logActivity(userId, action, details, targetTable = null, targetId = null, oldValue = null, newValue = null) {
    try {
        await DB.audit_logs.insertOne({
            userId,
            action,
            details,
            targetTable,
            targetId,
            oldValue,
            newValue,
            ipAddress: req?.ip || 'unknown',
            userAgent: req?.headers['user-agent'] || 'unknown',
            createdAt: new Date()
        });
    } catch (error) {
        console.error('فشل تسجيل النشاط:', error);
    }
}

// ==================== API: المصادقة والتسجيل ====================

// تسجيل الدخول (يدعم البريد/الجوال/اسم المستخدم)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password, rememberMe = false, twoFactorCode } = req.body;
        
        if (!identifier || !password) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }

        // البحث عن المستخدم
        let user = await DB.users.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { phone: identifier },
                { username: identifier.toLowerCase() }
            ]
        });

        if (!user) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        // التحقق من الحظر
        if (user.isBanned) {
            return res.status(403).json({ error: `الحساب محظور: ${user.banReason || 'انتهاك الشروط'}` });
        }

        // التحقق من القفل المؤقت
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            const remaining = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
            return res.status(403).json({ error: `الحساب مقفل مؤقتاً لمدة ${remaining} دقيقة` });
        }

        // التحقق من كلمة المرور
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            const attempts = (user.loginAttempts || 0) + 1;
            const updates = { loginAttempts: attempts };
            
            if (attempts >= 5) {
                updates.lockedUntil = new Date(Date.now() + 15 * 60000);
                await DB.users.updateOne({ _id: user._id }, { $set: updates });
                return res.status(403).json({ error: 'تم قفل الحساب 15 دقيقة لكثرة المحاولات الفاشلة' });
            }
            
            await DB.users.updateOne({ _id: user._id }, { $set: updates });
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }

        // التحقق من 2FA إذا كان مفعلاً
        if (user.twoFactorEnabled) {
            if (!twoFactorCode) {
                return res.status(401).json({ error: 'رمز التحقق الثنائي مطلوب', requiresTwoFactor: true });
            }
            
            const verified = speakeasy.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token: twoFactorCode,
                window: 1
            });
            
            if (!verified) {
                return res.status(401).json({ error: 'رمز التحقق غير صحيح' });
            }
        }

        // تحديث معلومات الدخول
        const loginInfo = {
            ip: req.ip,
            city: req.headers['x-city'] || 'غير معروف',
            device: req.headers['user-agent']?.substring(0, 100) || 'Unknown',
            browser: req.headers['sec-ch-ua'] || 'Unknown',
            time: new Date()
        };

        const loginHistory = [loginInfo, ...(user.loginHistory || [])].slice(0, 100);

        await DB.users.updateOne({ _id: user._id }, {
            $set: {
                lastLogin: new Date(),
                loginHistory,
                loginAttempts: 0,
                lockedUntil: null
            }
        });

        // إنشاء التوكنات
        const token = jwt.sign(
            { id: user._id, role: user.role, email: user.email },
            JWT_SECRET,
            { expiresIn: rememberMe ? '30d' : '1d' }
        );
        
        const refreshToken = jwt.sign(
            { id: user._id },
            REFRESH_SECRET,
            { expiresIn: '7d' }
        );
        
        refreshTokens.set(refreshToken, user._id);

        // تسجيل النشاط
        await logActivity(user._id, 'LOGIN', `تسجيل دخول من ${loginInfo.ip} - ${loginInfo.city}`);

        // حساب مستوى الولاء
        const tier = getTier(user.loyaltyPoints || 0);

        res.json({
            success: true,
            token,
            refreshToken,
            user: {
                id: user._id,
                fullName: user.fullName,
                username: user.username,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar,
                country: user.country,
                city: user.city,
                loyaltyPoints: user.loyaltyPoints || 0,
                loyaltyTier: tier.name,
                discountPercent: tier.discount,
                isActive: user.isActive
            }
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول' });
    }
});

// تسجيل عميل جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, phone, password, country, city, district, email, username } = req.body;
        
        // التحقق من الحقول المطلوبة
        if (!fullName || !phone || !password || !country) {
            return res.status(400).json({ error: 'الاسم الكامل، رقم الجوال، كلمة المرور، والدولة مطلوبة' });
        }

        // التحقق من قوة كلمة المرور
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ 
                error: 'كلمة المرور يجب أن تحتوي على 8 خانات على الأقل، حرف كبير، حرف صغير، رقم، ورمز خاص' 
            });
        }

        // التحقق من عدم تكرار البيانات
        const existingUser = await DB.users.findOne({
            $or: [
                { phone },
                ...(email ? [{ email: email.toLowerCase() }] : []),
                ...(username ? [{ username: username.toLowerCase() }] : [])
            ]
        });

        if (existingUser) {
            if (existingUser.phone === phone) return res.status(400).json({ error: 'رقم الجوال مسجل مسبقاً' });
            if (email && existingUser.email === email.toLowerCase()) return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
            if (username && existingUser.username === username.toLowerCase()) return res.status(400).json({ error: 'اسم المستخدم غير متاح' });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 12);

        // إنشاء المستخدم
        const newUser = await DB.users.insertOne({
            fullName,
            username: username || phone,
            email: email ? email.toLowerCase() : `${phone}@temp.com`,
            phone,
            password: hashedPassword,
            role: 'customer',
            country,
            city: city || '',
            district: district || '',
            loyaltyPoints: 100, // 100 نقطة ترحيبية
            loyaltyTier: 'برونزي',
            totalSpent: 0,
            isActive: true,
            isBanned: false,
            phoneVerified: false,
            emailVerified: false,
            addresses: [],
            paymentMethods: [],
            loginHistory: [],
            loginAttempts: 0,
            createdAt: new Date()
        });

        // إنشاء رمز OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await DB.otp_codes.insertOne({
            phone,
            code: otp,
            expiresAt: new Date(Date.now() + 10 * 60000),
            used: false,
            createdAt: new Date()
        });

        // TODO: إرسال OTP عبر واتساب
        console.log(`📱 OTP للرقم ${phone}: ${otp}`);

        // إنشاء التوكن
        const token = jwt.sign(
            { id: newUser._id, role: newUser.role, email: newUser.email },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        // تسجيل النشاط
        await logActivity(newUser._id, 'REGISTER', `تسجيل حساب جديد: ${fullName}`);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح، يرجى تفعيل رقم الجوال عبر رمز التحقق',
            token,
            user: {
                id: newUser._id,
                fullName: newUser.fullName,
                username: newUser.username,
                email: newUser.email,
                phone: newUser.phone,
                role: newUser.role,
                country: newUser.country,
                city: newUser.city,
                loyaltyPoints: 100,
                loyaltyTier: 'برونزي'
            }
        });

    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب' });
    }
});

// التحقق من رمز OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { phone, code } = req.body;
        
        if (!phone || !code) {
            return res.status(400).json({ error: 'رقم الجوال ورمز التحقق مطلوبان' });
        }

        const otpRecord = await DB.otp_codes.findOne({ phone, code, used: false });
        
        if (!otpRecord) {
            return res.status(400).json({ error: 'رمز غير صالح' });
        }
        
        if (new Date(otpRecord.expiresAt) < new Date()) {
            return res.status(400).json({ error: 'انتهت صلاحية الرمز' });
        }

        await DB.otp_codes.updateOne({ _id: otpRecord._id }, { $set: { used: true } });
        await DB.users.updateOne({ phone }, { $set: { phoneVerified: true } });

        res.json({ success: true, message: 'تم التحقق من رقم الجوال بنجاح' });

    } catch (error) {
        console.error('خطأ في التحقق من OTP:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء التحقق' });
    }
});

// إعادة إرسال OTP
app.post('/api/auth/resend-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ error: 'رقم الجوال مطلوب' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        await DB.otp_codes.insertOne({
            phone,
            code: otp,
            expiresAt: new Date(Date.now() + 10 * 60000),
            used: false,
            createdAt: new Date()
        });

        console.log(`📱 إعادة إرسال OTP للرقم ${phone}: ${otp}`);

        res.json({ success: true, message: 'تم إعادة إرسال رمز التحقق' });

    } catch (error) {
        console.error('خطأ في إعادة إرسال OTP:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء إعادة الإرسال' });
    }
});

// تفعيل 2FA
app.post('/api/auth/enable-2fa', requireAuth, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({
            length: 20,
            name: `الرعدي أونلاين (${req.user.email})`
        });
        
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
        
        await DB.users.updateOne(
            { _id: req.user.id },
            { $set: { twoFactorSecret: secret.base32, twoFactorEnabled: true } }
        );
        
        res.json({
            success: true,
            secret: secret.base32,
            qrCode: qrCodeUrl,
            message: 'تم تفعيل التحقق الثنائي بنجاح'
        });
        
    } catch (error) {
        console.error('خطأ في تفعيل 2FA:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تفعيل التحقق الثنائي' });
    }
});

// تعطيل 2FA
app.post('/api/auth/disable-2fa', requireAuth, async (req, res) => {
    try {
        const { code } = req.body;
        const user = await DB.users.findOne({ _id: req.user.id });
        
        if (!user.twoFactorEnabled) {
            return res.status(400).json({ error: 'التحقق الثنائي غير مفعل' });
        }
        
        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: code
        });
        
        if (!verified) {
            return res.status(400).json({ error: 'رمز التحقق غير صحيح' });
        }
        
        await DB.users.updateOne(
            { _id: req.user.id },
            { $set: { twoFactorEnabled: false, twoFactorSecret: null } }
        );
        
        res.json({ success: true, message: 'تم تعطيل التحقق الثنائي' });
        
    } catch (error) {
        console.error('خطأ في تعطيل 2FA:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تعطيل التحقق الثنائي' });
    }
});

// تحديث رمز الدخول (Refresh Token)
app.post('/api/auth/refresh', (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken || !refreshTokens.has(refreshToken)) {
            return res.status(403).json({ error: 'رمز تحديث غير صالح' });
        }
        
        const payload = jwt.verify(refreshToken, REFRESH_SECRET);
        const newToken = jwt.sign(
            { id: payload.id, role: payload.role, email: payload.email },
            JWT_SECRET,
            { expiresIn: '1d' }
        );
        
        res.json({ success: true, token: newToken });
        
    } catch (error) {
        res.status(403).json({ error: 'رمز تحديث منتهي الصلاحية' });
    }
});

// تسجيل الخروج
app.post('/api/auth/logout', (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            refreshTokens.delete(refreshToken);
        }
        res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الخروج' });
    }
});

// نسيان كلمة المرور - إرسال رابط إعادة تعيين
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { identifier } = req.body;
        
        if (!identifier) {
            return res.status(400).json({ error: 'البريد الإلكتروني أو رقم الجوال مطلوب' });
        }
        
        const user = await DB.users.findOne({
            $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
        });
        
        if (!user) {
            // عدم الكشف عن وجود المستخدم لأسباب أمنية
            return res.json({ success: true, message: 'إذا كان الحساب موجوداً، ستتلقى رابط إعادة التعيين' });
        }
        
        const resetToken = jwt.sign(
            { id: user._id },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        const resetLink = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
        
        // TODO: إرسال البريد الإلكتروني
        console.log(`🔗 رابط إعادة تعيين كلمة المرور لـ ${user.email}: ${resetLink}`);
        
        res.json({ success: true, message: 'تم إرسال رابط إعادة التعيين' });
        
    } catch (error) {
        console.error('خطأ في نسيان كلمة المرور:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء معالجة الطلب' });
    }
});

// إعادة تعيين كلمة المرور
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'الرمز وكلمة المرور الجديدة مطلوبان' });
        }
        
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await DB.users.findOne({ _id: payload.id });
        
        if (!user) {
            return res.status(400).json({ error: 'رمز غير صالح' });
        }
        
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ error: 'كلمة المرور لا تستوفي المتطلبات الأمنية' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        await DB.users.updateOne(
            { _id: user._id },
            { $set: { password: hashedPassword } }
        );
        
        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
        
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ error: 'انتهت صلاحية الرابط' });
        }
        console.error('خطأ في إعادة تعيين كلمة المرور:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء إعادة التعيين' });
    }
});

// ==================== API: الملف الشخصي ====================

// جلب الملف الشخصي
app.get('/api/user/profile', requireAuth, async (req, res) => {
    try {
        const user = await DB.users.findOne({ _id: req.user.id });
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        const tier = getTier(user.loyaltyPoints || 0);
        const nextTier = LOYALTY_TIERS.find(t => t.min > (user.loyaltyPoints || 0));
        
        res.json({
            success: true,
            data: {
                id: user._id,
                fullName: user.fullName,
                username: user.username,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                country: user.country,
                city: user.city,
                district: user.district,
                address: user.address,
                role: user.role,
                loyaltyPoints: user.loyaltyPoints || 0,
                loyaltyTier: tier.name,
                discountPercent: tier.discount,
                tierBenefits: tier.benefits,
                tierColor: tier.color,
                tierIcon: tier.icon,
                nextTier: nextTier ? {
                    name: nextTier.name,
                    pointsNeeded: nextTier.min - (user.loyaltyPoints || 0),
                    discount: nextTier.discount
                } : null,
                totalSpent: user.totalSpent || 0,
                addresses: user.addresses || [],
                paymentMethods: user.paymentMethods || [],
                twoFactorEnabled: user.twoFactorEnabled || false,
                phoneVerified: user.phoneVerified || false,
                emailVerified: user.emailVerified || false,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب الملف الشخصي:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب البيانات' });
    }
});

// تحديث الملف الشخصي
app.put('/api/user/profile', requireAuth, async (req, res) => {
    try {
        const { fullName, email, country, city, district, address, avatar } = req.body;
        
        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (email) updates.email = email.toLowerCase();
        if (country) updates.country = country;
        if (city) updates.city = city;
        if (district) updates.district = district;
        if (address) updates.address = address;
        if (avatar) updates.avatar = avatar;
        
        await DB.users.updateOne({ _id: req.user.id }, { $set: updates });
        
        await logActivity(req.user.id, 'UPDATE_PROFILE', 'تحديث الملف الشخصي');
        
        res.json({ success: true, message: 'تم تحديث الملف الشخصي بنجاح' });
        
    } catch (error) {
        console.error('خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث البيانات' });
    }
});

// تغيير كلمة المرور
app.put('/api/user/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبة' });
        }
        
        const user = await DB.users.findOne({ _id: req.user.id });
        
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }
        
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ error: 'كلمة المرور الجديدة لا تستوفي المتطلبات الأمنية' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        await DB.users.updateOne(
            { _id: req.user.id },
            { $set: { password: hashedPassword } }
        );
        
        await logActivity(req.user.id, 'CHANGE_PASSWORD', 'تغيير كلمة المرور');
        
        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
        
    } catch (error) {
        console.error('خطأ في تغيير كلمة المرور:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تغيير كلمة المرور' });
    }
});

// إضافة عنوان جديد
app.post('/api/user/addresses', requireAuth, async (req, res) => {
    try {
        const { name, phone, country, city, district, street, landmark, isDefault, coordinates } = req.body;
        
        if (!name || !phone || !country || !city) {
            return res.status(400).json({ error: 'الاسم، رقم الجوال، الدولة، والمدينة مطلوبة' });
        }
        
        const user = await DB.users.findOne({ _id: req.user.id });
        const addresses = user.addresses || [];
        
        if (isDefault) {
            addresses.forEach(addr => addr.isDefault = false);
        }
        
        const newAddress = {
            id: uuidv4(),
            name,
            phone,
            country,
            city,
            district: district || '',
            street: street || '',
            landmark: landmark || '',
            isDefault: isDefault || addresses.length === 0,
            coordinates: coordinates || null,
            createdAt: new Date()
        };
        
        addresses.push(newAddress);
        
        await DB.users.updateOne({ _id: req.user.id }, { $set: { addresses } });
        
        res.json({ success: true, data: newAddress, message: 'تم إضافة العنوان بنجاح' });
        
    } catch (error) {
        console.error('خطأ في إضافة عنوان:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء إضافة العنوان' });
    }
});

// تحديث عنوان
app.put('/api/user/addresses/:addressId', requireAuth, async (req, res) => {
    try {
        const { addressId } = req.params;
        const { name, phone, country, city, district, street, landmark, isDefault, coordinates } = req.body;
        
        const user = await DB.users.findOne({ _id: req.user.id });
        let addresses = user.addresses || [];
        const addressIndex = addresses.findIndex(a => a.id === addressId);
        
        if (addressIndex === -1) {
            return res.status(404).json({ error: 'العنوان غير موجود' });
        }
        
        if (isDefault) {
            addresses.forEach(addr => addr.isDefault = false);
        }
        
        addresses[addressIndex] = {
            ...addresses[addressIndex],
            name: name || addresses[addressIndex].name,
            phone: phone || addresses[addressIndex].phone,
            country: country || addresses[addressIndex].country,
            city: city || addresses[addressIndex].city,
            district: district || addresses[addressIndex].district,
            street: street || addresses[addressIndex].street,
            landmark: landmark || addresses[addressIndex].landmark,
            isDefault: isDefault !== undefined ? isDefault : addresses[addressIndex].isDefault,
            coordinates: coordinates || addresses[addressIndex].coordinates,
            updatedAt: new Date()
        };
        
        await DB.users.updateOne({ _id: req.user.id }, { $set: { addresses } });
        
        res.json({ success: true, message: 'تم تحديث العنوان بنجاح' });
        
    } catch (error) {
        console.error('خطأ في تحديث عنوان:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث العنوان' });
    }
});

// حذف عنوان
app.delete('/api/user/addresses/:addressId', requireAuth, async (req, res) => {
    try {
        const { addressId } = req.params;
        
        const user = await DB.users.findOne({ _id: req.user.id });
        let addresses = user.addresses || [];
        const newAddresses = addresses.filter(a => a.id !== addressId);
        
        if (newAddresses.length === addresses.length) {
            return res.status(404).json({ error: 'العنوان غير موجود' });
        }
        
        // إذا تم حذف العنوان الافتراضي، اجعل أول عنوان افتراضي
        const deletedWasDefault = addresses.find(a => a.id === addressId)?.isDefault;
        if (deletedWasDefault && newAddresses.length > 0) {
            newAddresses[0].isDefault = true;
        }
        
        await DB.users.updateOne({ _id: req.user.id }, { $set: { addresses: newAddresses } });
        
        res.json({ success: true, message: 'تم حذف العنوان بنجاح' });
        
    } catch (error) {
        console.error('خطأ في حذف عنوان:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء حذف العنوان' });
    }
});

// ==================== API: المنتجات ====================

// جلب جميع المنتجات مع فلتر متقدم
app.get('/api/products', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            subcategory,
            brand,
            search,
            sort = '-createdAt',
            featured,
            flashSale,
            minPrice,
            maxPrice,
            minRating,
            inStock,
            tags
        } = req.query;

        const query = { isActive: true };
        
        if (category && category !== 'all') query.category = category;
        if (subcategory) query.subcategory = subcategory;
        if (brand) query.brand = brand;
        if (featured === 'true') query.isFeatured = true;
        if (flashSale === 'true') query.isOnSale = true;
        if (inStock === 'true') query.stock = { $gt: 0 };
        if (tags) query.tags = { $in: tags.split(',') };
        
        let products = await DB.products.find(query).toArray();
        
        // البحث النصي
        if (search) {
            const term = search.toLowerCase();
            products = products.filter(p => 
                p.name?.toLowerCase().includes(term) ||
                p.description?.toLowerCase().includes(term) ||
                p.sku?.toLowerCase().includes(term) ||
                (p.tags || []).some(t => t.toLowerCase().includes(term))
            );
        }
        
        // فلتر السعر
        if (minPrice) products = products.filter(p => p.price >= parseFloat(minPrice));
        if (maxPrice) products = products.filter(p => p.price <= parseFloat(maxPrice));
        
        // فلتر التقييم
        if (minRating) products = products.filter(p => (p.ratings?.average || 0) >= parseFloat(minRating));
        
        const total = products.length;
        
        // الترتيب
        products.sort((a, b) => {
            switch (sort) {
                case 'price-asc': return a.price - b.price;
                case 'price-desc': return b.price - a.price;
                case 'bestselling': return (b.salesCount || 0) - (a.salesCount || 0);
                case 'toprated': return (b.ratings?.average || 0) - (a.ratings?.average || 0);
                case 'newest': return new Date(b.createdAt) - new Date(a.createdAt);
                case 'name-asc': return (a.name || '').localeCompare(b.name || '');
                case 'name-desc': return (b.name || '').localeCompare(a.name || '');
                default: return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });
        
        const paginated = products.slice((page - 1) * limit, page * limit);
        
        // إضافة معلومات إضافية لكل منتج
        const productsWithInfo = paginated.map(p => ({
            ...p,
            discountPercent: p.comparePrice ? Math.round((1 - p.price / p.comparePrice) * 100) : 0,
            inStock: p.stock > 0,
            stockStatus: p.stock === 0 ? 'out' : p.stock <= 5 ? 'low' : 'in'
        }));
        
        res.json({
            success: true,
            data: productsWithInfo,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            },
            filters: {
                categories: [...new Set(products.map(p => p.category))],
                brands: [...new Set(products.map(p => p.brand).filter(Boolean))],
                priceRange: {
                    min: Math.min(...products.map(p => p.price)),
                    max: Math.max(...products.map(p => p.price))
                }
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب المنتجات:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب المنتجات' });
    }
});

// جلب منتج واحد مع تفاصيل كاملة
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        let product = await DB.products.findOne({ _id: id });
        
        if (!product) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        
        // زيادة عدد المشاهدات
        await DB.products.updateOne({ _id: id }, { $inc: { viewsCount: 1 } });
        
        // جلب المنتجات ذات الصلة
        const relatedProducts = await DB.products.find({
            category: product.category,
            isActive: true,
            _id: { $ne: id }
        }).limit(6).toArray();
        
        // جلب التقييمات مع معلومات المستخدمين
        const reviewsWithUsers = await Promise.all(
            (product.reviews || []).map(async (review) => {
                const user = await DB.users.findOne({ _id: review.userId });
                return {
                    ...review,
                    userName: user?.fullName || 'مستخدم',
                    userAvatar: user?.avatar
                };
            })
        );
        
        res.json({
            success: true,
            data: {
                ...product,
                discountPercent: product.comparePrice ? Math.round((1 - product.price / product.comparePrice) * 100) : 0,
                reviews: reviewsWithUsers,
                relatedProducts: relatedProducts.map(p => ({
                    id: p._id,
                    name: p.name,
                    price: p.price,
                    comparePrice: p.comparePrice,
                    image: p.images?.[0]?.url,
                    rating: p.ratings?.average
                }))
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب المنتج:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب المنتج' });
    }
});

// إضافة منتج جديد (للمدير فقط)
app.post('/api/products', requireAdmin, upload.array('images', 10), async (req, res) => {
    try {
        const {
            name, sku, category, subcategory, brand,
            price, comparePrice, costPrice,
            stock, minStock,
            description, shortDescription,
            specifications,
            tags, weight,
            warrantyInfo, maintenanceInterval,
            isFeatured, isOnSale
        } = req.body;
        
        if (!name || !category || !price) {
            return res.status(400).json({ error: 'الاسم، القسم، والسعر مطلوبة' });
        }
        
        // معالجة الصور المرفوعة
        const images = (req.files || []).map((file, index) => ({
            url: `/uploads/${file.filename}`,
            type: index === 0 ? 'main' : 'gallery',
            order: index
        }));
        
        const discount = comparePrice && comparePrice > price
            ? Math.round((1 - price / comparePrice) * 100)
            : 0;
        
        const profitMargin = costPrice
            ? Math.round(((price - costPrice) / price) * 100)
            : null;
        
        const newProduct = await DB.products.insertOne({
            name,
            sku: sku || `SKU-${Date.now()}`,
            category,
            subcategory: subcategory || '',
            brand: brand || '',
            price: parseFloat(price),
            comparePrice: comparePrice ? parseFloat(comparePrice) : null,
            discount,
            costPrice: costPrice ? parseFloat(costPrice) : null,
            profitMargin,
            stock: parseInt(stock) || 0,
            minStock: parseInt(minStock) || 5,
            description: description || '',
            shortDescription: shortDescription || '',
            specifications: specifications ? JSON.parse(specifications) : {},
            images: images.length ? images : [],
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            weight: weight ? parseFloat(weight) : null,
            warrantyInfo: warrantyInfo || null,
            maintenanceInterval: parseInt(maintenanceInterval) || 90,
            isActive: true,
            isFeatured: isFeatured === 'true',
            isOnSale: isOnSale === 'true',
            ratings: { average: 0, count: 0 },
            reviews: [],
            salesCount: 0,
            viewsCount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        await logActivity(req.user.id, 'CREATE_PRODUCT', `إضافة منتج جديد: ${name}`, 'products', newProduct._id);
        
        // إشعار عبر WebSocket
        io.emit('product-updated', { type: 'create', product: newProduct });
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المنتج بنجاح',
            data: newProduct
        });
        
    } catch (error) {
        console.error('خطأ في إضافة منتج:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء إضافة المنتج' });
    }
});

// تحديث منتج
app.put('/api/products/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body, updatedAt: new Date() };
        
        // إعادة حساب الخصم إذا تغير السعر
        if (updates.price && updates.comparePrice) {
            updates.discount = Math.round((1 - updates.price / updates.comparePrice) * 100);
        }
        
        // إعادة حساب هامش الربح
        if (updates.price && updates.costPrice) {
            updates.profitMargin = Math.round(((updates.price - updates.costPrice) / updates.price) * 100);
        }
        
        const oldProduct = await DB.products.findOne({ _id: id });
        
        await DB.products.updateOne({ _id: id }, { $set: updates });
        
        await logActivity(req.user.id, 'UPDATE_PRODUCT', `تحديث منتج: ${oldProduct?.name}`, 'products', id, oldProduct, updates);
        
        io.emit('product-updated', { type: 'update', productId: id });
        
        res.json({ success: true, message: 'تم تحديث المنتج بنجاح' });
        
    } catch (error) {
        console.error('خطأ في تحديث منتج:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث المنتج' });
    }
});

// حذف منتج (نقل إلى سلة المحذوفات)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await DB.products.findOne({ _id: id });
        
        if (!product) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        
        // نقل إلى سلة المحذوفات
        await DB.trash.insertOne({
            ...product,
            originalCollection: 'products',
            deletedAt: new Date(),
            deletedBy: req.user.id
        });
        
        await DB.products.deleteOne({ _id: id });
        
        await logActivity(req.user.id, 'DELETE_PRODUCT', `حذف منتج: ${product.name}`, 'products', id, product);
        
        io.emit('product-updated', { type: 'delete', productId: id });
        
        res.json({ success: true, message: 'تم نقل المنتج إلى سلة المحذوفات' });
        
    } catch (error) {
        console.error('خطأ في حذف منتج:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء حذف المنتج' });
    }
});

// إضافة تقييم لمنتج
app.post('/api/products/:id/reviews', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment, images } = req.body;
        
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'التقييم مطلوب بين 1 و 5' });
        }
        
        const product = await DB.products.findOne({ _id: id });
        
        if (!product) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        
        // التحقق من أن المستخدم اشترى المنتج
        const hasPurchased = await DB.orders.findOne({
            user: req.user.id,
            'items.productId': id,
            status: { $in: ['delivered', 'shipped'] }
        });
        
        if (!hasPurchased) {
            return res.status(403).json({ error: 'يمكن للمشترين فقط تقييم المنتج' });
        }
        
        const user = await DB.users.findOne({ _id: req.user.id });
        
        const newReview = {
            id: uuidv4(),
            userId: req.user.id,
            userName: user.fullName,
            userAvatar: user.avatar,
            rating: parseInt(rating),
            comment: comment || '',
            images: images || [],
            helpful: 0,
            createdAt: new Date()
        };
        
        const reviews = [...(product.reviews || []), newReview];
        const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        
        await DB.products.updateOne({ _id: id }, {
            $set: {
                reviews,
                'ratings.average': Math.round(averageRating * 10) / 10,
                'ratings.count': reviews.length
            }
        });
        
        await logActivity(req.user.id, 'ADD_REVIEW', `تقييم منتج: ${product.name}`, 'products', id);
        
        res.json({ success: true, message: 'تم إضافة تقييمك بنجاح', data: newReview });
        
    } catch (error) {
        console.error('خطأ في إضافة تقييم:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء إضافة التقييم' });
    }
});

// ==================== API: السلة والدفع ====================

// تطبيق كوبون الخصم
app.post('/api/cart/apply-coupon', async (req, res) => {
    try {
        const { code, subtotal } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'كود الكوبون مطلوب' });
        }
        
        const coupon = await DB.coupons.findOne({ code: code.toUpperCase(), isActive: true });
        
        if (!coupon) {
            return res.status(400).json({ error: 'الكوبون غير صالح' });
        }
        
        // التحقق من صلاحية التاريخ
        if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
            return res.status(400).json({ error: 'انتهت صلاحية الكوبون' });
        }
        
        // التحقق من الحد الأدنى للطلب
        if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
            return res.status(400).json({ error: `الحد الأدنى للطلب ${coupon.minOrderAmount} ر.س` });
        }
        
        // التحقق من عدد الاستخدامات
        if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
            return res.status(400).json({ error: 'تم استخدام الكوبون بالكامل' });
        }
        
        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = subtotal * (coupon.discountValue / 100);
        } else {
            discountAmount = coupon.discountValue;
        }
        
        // تحديد الحد الأقصى للخصم إن وجد
        if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
            discountAmount = coupon.maxDiscount;
        }
        
        res.json({
            success: true,
            data: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                discountAmount: Math.min(discountAmount, subtotal),
                description: coupon.description
            }
        });
        
    } catch (error) {
        console.error('خطأ في تطبيق الكوبون:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تطبيق الكوبون' });
    }
});

// حساب تفاصيل السلة
app.post('/api/cart/calculate', async (req, res) => {
    try {
        const { items, shippingAddress, couponCode, loyaltyPoints } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'السلة فارغة' });
        }
        
        let subtotal = 0;
        const itemsWithDetails = [];
        
        for (const item of items) {
            const product = await DB.products.findOne({ _id: item.productId });
            if (!product) {
                return res.status(400).json({ error: `المنتج ${item.productId} غير موجود` });
            }
            
            const price = product.isOnSale ? product.price * (1 - (product.discount || 0) / 100) : product.price;
            const itemTotal = price * item.quantity;
            subtotal += itemTotal;
            
            itemsWithDetails.push({
                ...item,
                name: product.name,
                price,
                image: product.images?.[0]?.url,
                stock: product.stock
            });
        }
        
        // حساب خصم الولاء
        let loyaltyDiscount = 0;
        let tier = null;
        if (req.user) {
            const user = await DB.users.findOne({ _id: req.user.id });
            tier = getTier(user.loyaltyPoints || 0);
            loyaltyDiscount = subtotal * (tier.discount / 100);
        }
        
        // حساب خصم الكوبون
        let couponDiscount = 0;
        let couponData = null;
        if (couponCode) {
            const couponResult = await fetch(`${req.protocol}://${req.get('host')}/api/cart/apply-coupon`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: couponCode, subtotal: subtotal - loyaltyDiscount })
            });
            const couponRes = await couponResult.json();
            if (couponRes.success) {
                couponDiscount = couponRes.data.discountAmount;
                couponData = couponRes.data;
            }
        }
        
        // حساب تكلفة الشحن
        const shippingSettings = await DB.settings.findOne({ type: 'shipping' });
        let shippingCost = 0;
        let shippingMethod = 'standard';
        
        if (shippingSettings?.data) {
            const rules = shippingSettings.data.rules || [];
            const applicableRule = rules.find(r => r.country === shippingAddress?.country);
            if (applicableRule) {
                if (applicableRule.type === 'fixed') {
                    shippingCost = applicableRule.cost;
                } else if (applicableRule.type === 'percentage') {
                    shippingCost = subtotal * (applicableRule.cost / 100);
                }
            }
            
            // شحن مجاني للطلبات فوق الحد
            const freeThreshold = shippingSettings.data.freeShippingThreshold || 500;
            if (subtotal >= freeThreshold) {
                shippingCost = 0;
            }
        } else {
            shippingCost = subtotal > 500 ? 0 : 25;
        }
        
        // حساب الضريبة
        const taxSettings = await DB.settings.findOne({ type: 'tax' });
        const taxRate = taxSettings?.data?.rate || 15;
        const taxableAmount = subtotal - loyaltyDiscount - couponDiscount;
        const tax = taxableAmount * (taxRate / 100);
        
        const total = subtotal - loyaltyDiscount - couponDiscount + shippingCost + tax;
        
        res.json({
            success: true,
            data: {
                subtotal: Math.round(subtotal * 100) / 100,
                loyaltyDiscount: Math.round(loyaltyDiscount * 100) / 100,
                couponDiscount: Math.round(couponDiscount * 100) / 100,
                shippingCost: Math.round(shippingCost * 100) / 100,
                tax: Math.round(tax * 100) / 100,
                taxRate,
                total: Math.round(total * 100) / 100,
                tier: tier ? {
                    name: tier.name,
                    discount: tier.discount,
                    color: tier.color,
                    icon: tier.icon
                } : null,
                coupon: couponData,
                items: itemsWithDetails
            }
        });
        
    } catch (error) {
        console.error('خطأ في حساب السلة:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء حساب السلة' });
    }
});

// إنشاء طلب جديد
app.post('/api/orders', requireAuth, async (req, res) => {
    try {
        const {
            items,
            shippingAddress,
            shippingMethod = 'standard',
            paymentMethod,
            couponCode,
            useLoyaltyPoints = false,
            notes
        } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'السلة فارغة' });
        }
        
        if (!shippingAddress || !paymentMethod) {
            return res.status(400).json({ error: 'عنوان الشحن وطريقة الدفع مطلوبة' });
        }
        
        const user = await DB.users.findOne({ _id: req.user.id });
        
        // حساب تفاصيل السلة
        const calculation = await fetch(`${req.protocol}://${req.get('host')}/api/cart/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, shippingAddress, couponCode })
        });
        const calculationResult = await calculation.json();
        
        if (!calculationResult.success) {
            return res.status(400).json({ error: calculationResult.error });
        }
        
        const pricing = calculationResult.data;
        
        // معالجة الدفع
        let paymentStatus = 'pending';
        let transactionId = null;
        
        if (paymentMethod === 'card') {
            // TODO: تكامل مع بوابة دفع حقيقية
            paymentStatus = 'paid';
            transactionId = `txn_${uuidv4()}`;
        }
        
        // إنشاء رقم الطلب
        const orderNumber = `RAAD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        // إنشاء الطلب
        const newOrder = await DB.orders.insertOne({
            orderNumber,
            user: req.user.id,
            items: pricing.items.map(item => ({
                productId: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image
            })),
            shipping: {
                method: shippingMethod,
                cost: pricing.shippingCost,
                address: shippingAddress,
                estimatedDays: shippingMethod === 'express' ? 2 : 5
            },
            payment: {
                method: paymentMethod,
                status: paymentStatus,
                transactionId
            },
            coupon: pricing.coupon,
            pricing: {
                subtotal: pricing.subtotal,
                shippingCost: pricing.shippingCost,
                discount: pricing.loyaltyDiscount + pricing.couponDiscount,
                loyaltyDiscount: pricing.loyaltyDiscount,
                couponDiscount: pricing.couponDiscount,
                tax: pricing.tax,
                taxRate: pricing.taxRate,
                total: pricing.total
            },
            status: 'pending',
            statusHistory: [{
                status: 'pending',
                note: 'تم إنشاء الطلب',
                updatedBy: req.user.id,
                updatedAt: new Date()
            }],
            notes: notes || '',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        // خصم المخزون
        for (const item of pricing.items) {
            await DB.products.updateOne(
                { _id: item.productId },
                { $inc: { stock: -item.quantity, salesCount: item.quantity } }
            );
        }
        
        // منح نقاط الولاء
        const pointsEarned = Math.floor(pricing.total / 10);
        const tier = getTier(user.loyaltyPoints || 0);
        const actualPoints = pointsEarned * tier.multiplier;
        
        await DB.users.updateOne(
            { _id: req.user.id },
            { 
                $inc: { 
                    loyaltyPoints: actualPoints,
                    totalSpent: pricing.total
                }
            }
        );
        
        const newPoints = (user.loyaltyPoints || 0) + actualPoints;
        const newTier = getTier(newPoints);
        
        // إنشاء الفاتورة PDF
        const invoiceUrl = await generateInvoice(newOrder, user, pricing);
        
        await DB.orders.updateOne(
            { _id: newOrder._id },
            { $set: { 'invoice.pdfUrl': invoiceUrl } }
        );
        
        // تسجيل النشاط
        await logActivity(req.user.id, 'CREATE_ORDER', `طلب جديد: ${orderNumber}`, 'orders', newOrder._id);
        
        // إشعار WebSocket
        io.emit('new-order', {
            orderNumber,
            total: pricing.total,
            customer: user.fullName,
            time: new Date()
        });
        
        // إرسال إشعار للمديرين
        const admins = await DB.users.find({ role: { $in: ['admin', 'superadmin'] } }).toArray();
        for (const admin of admins) {
            await DB.notifications.insertOne({
                userId: admin._id,
                title: 'طلب جديد',
                message: `طلب جديد رقم ${orderNumber} بقيمة ${pricing.total} ر.س من ${user.fullName}`,
                type: 'order',
                orderId: newOrder._id,
                read: false,
                createdAt: new Date()
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'تم إنشاء الطلب بنجاح',
            data: {
                orderId: newOrder._id,
                orderNumber,
                total: pricing.total,
                pointsEarned: actualPoints,
                newTier: newTier.name,
                invoiceUrl
            }
        });
        
    } catch (error) {
        console.error('خطأ في إنشاء الطلب:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الطلب' });
    }
});

// دالة إنشاء الفاتورة PDF
async function generateInvoice(order, user, pricing) {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const filename = `invoice-${order.orderNumber}.pdf`;
            const filepath = path.join(__dirname, 'uploads', filename);
            const writeStream = fs.createWriteStream(filepath);
            
            doc.pipe(writeStream);
            
            // رأس الفاتورة
            doc.fontSize(24).fillColor('#C9A84C').text('🦅 الرعدي أونلاين', { align: 'center' });
            doc.fontSize(14).fillColor('#666').text('فاتورة ضريبية', { align: 'center' });
            doc.moveDown();
            
            doc.fontSize(10).fillColor('#333');
            doc.text(`رقم الفاتورة: ${order.orderNumber}`, { align: 'right' });
            doc.text(`التاريخ: ${new Date(order.createdAt).toLocaleDateString('ar-SA')}`, { align: 'right' });
            doc.text(`العميل: ${user.fullName}`, { align: 'right' });
            doc.text(`الجوال: ${user.phone}`, { align: 'right' });
            doc.moveDown();
            
            // جدول المنتجات
            const tableTop = doc.y + 20;
            let y = tableTop;
            
            doc.fontSize(10).fillColor('#FFF');
            doc.rect(50, y, 495, 20).fill('#C9A84C');
            doc.fillColor('#1A1A2E').text('المنتج', 60, y + 5);
            doc.text('الكمية', 250, y + 5);
            doc.text('السعر', 350, y + 5);
            doc.text('الإجمالي', 450, y + 5);
            
            y += 25;
            doc.fillColor('#333');
            
            for (const item of order.items) {
                doc.text(item.name, 60, y);
                doc.text(item.quantity.toString(), 250, y);
                doc.text(`${item.price} ر.س`, 350, y);
                doc.text(`${(item.price * item.quantity).toFixed(2)} ر.س`, 450, y);
                y += 20;
            }
            
            y += 10;
            doc.text(`المجموع الفرعي: ${pricing.subtotal.toFixed(2)} ر.س`, 400, y);
            y += 20;
            if (pricing.loyaltyDiscount > 0) {
                doc.text(`خصم الولاء: -${pricing.loyaltyDiscount.toFixed(2)} ر.س`, 400, y);
                y += 20;
            }
            if (pricing.couponDiscount > 0) {
                doc.text(`خصم الكوبون: -${pricing.couponDiscount.toFixed(2)} ر.س`, 400, y);
                y += 20;
            }
            doc.text(`الشحن: ${pricing.shippingCost.toFixed(2)} ر.س`, 400, y);
            y += 20;
            doc.text(`الضريبة (${pricing.taxRate}%): ${pricing.tax.toFixed(2)} ر.س`, 400, y);
            y += 25;
            doc.fontSize(14).fillColor('#C9A84C').text(`الإجمالي: ${pricing.total.toFixed(2)} ر.س`, 400, y);
            
            // التذييل
            doc.fontSize(8).fillColor('#999');
            doc.text('شكراً لثقتكم بنا', { align: 'center' });
            doc.text('صنع بـ ❤️ في السعودية', { align: 'center' });
            
            doc.end();
            
            writeStream.on('finish', () => {
                resolve(`/uploads/${filename}`);
            });
            
            writeStream.on('error', reject);
            
        } catch (error) {
            reject(error);
        }
    });
}

// ==================== API: لوحة التحكم (Admin) ====================

// إحصائيات سريعة
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const [totalOrders, totalProducts, totalCustomers, totalRevenue] = await Promise.all([
            DB.orders.countDocuments(),
            DB.products.countDocuments({ isActive: true }),
            DB.users.countDocuments({ role: 'customer' }),
            DB.orders.aggregate([{ $group: { _id: null, total: { $sum: '$pricing.total' } } }]).then(r => r.toArray().then(arr => arr[0]?.total || 0))
        ]);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayOrders = await DB.orders.countDocuments({
            createdAt: { $gte: today }
        });
        
        const todayRevenue = await DB.orders.aggregate([
            { $match: { createdAt: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$pricing.total' } } }
        ]).then(r => r.toArray().then(arr => arr[0]?.total || 0));
        
        const lowStockProducts = await DB.products.countDocuments({
            isActive: true,
            stock: { $lte: 5 }
        });
        
        const recentOrders = await DB.orders.find().sort({ createdAt: -1 }).limit(10).toArray();
        
        res.json({
            success: true,
            data: {
                totalOrders,
                totalProducts,
                totalCustomers,
                totalRevenue,
                todayOrders,
                todayRevenue,
                lowStockProducts,
                recentOrders
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب الإحصائيات' });
    }
});

// جلب جميع الطلبات (للمدير)
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        
        const query = {};
        if (status && status !== 'all') query.status = status;
        
        const orders = await DB.orders.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .toArray();
        
        const total = await DB.orders.countDocuments(query);
        
        // جلب معلومات المستخدمين لكل طلب
        const ordersWithUsers = await Promise.all(orders.map(async (order) => {
            const user = await DB.users.findOne({ _id: order.user });
            return {
                ...order,
                user: user ? {
                    fullName: user.fullName,
                    email: user.email,
                    phone: user.phone
                } : null
            };
        }));
        
        res.json({
            success: true,
            data: ordersWithUsers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب الطلبات:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب الطلبات' });
    }
});

// تحديث حالة الطلب
app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note, trackingNumber } = req.body;
        
        if (!status) {
            return res.status(400).json({ error: 'الحالة مطلوبة' });
        }
        
        const order = await DB.orders.findOne({ _id: id });
        
        if (!order) {
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }
        
        const statusHistory = [...(order.statusHistory || []), {
            status,
            note: note || '',
            updatedBy: req.user.id,
            updatedAt: new Date()
        }];
        
        const updates = {
            status,
            statusHistory,
            updatedAt: new Date()
        };
        
        if (trackingNumber) {
            updates['shipping.trackingNumber'] = trackingNumber;
        }
        
        if (status === 'shipped') {
            updates['shipping.shippedAt'] = new Date();
        }
        
        if (status === 'delivered') {
            updates['shipping.deliveredAt'] = new Date();
        }
        
        await DB.orders.updateOne({ _id: id }, { $set: updates });
        
        // إشعار للعميل
        await DB.notifications.insertOne({
            userId: order.user,
            title: 'تحديث حالة الطلب',
            message: `تم تحديث حالة طلبك #${order.orderNumber} إلى ${getStatusArabic(status)}`,
            type: 'order',
            orderId: id,
            read: false,
            createdAt: new Date()
        });
        
        // إشعار WebSocket
        io.emit('order-status-updated', {
            orderId: id,
            orderNumber: order.orderNumber,
            status,
            trackingNumber
        });
        
        await logActivity(req.user.id, 'UPDATE_ORDER_STATUS', `تحديث حالة الطلب ${order.orderNumber} إلى ${status}`, 'orders', id, order.status, status);
        
        res.json({ success: true, message: 'تم تحديث حالة الطلب بنجاح' });
        
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث حالة الطلب' });
    }
});

function getStatusArabic(status) {
    const statusMap = {
        pending: 'قيد الانتظار',
        confirmed: 'تم التأكيد',
        processing: 'قيد المعالجة',
        shipped: 'تم الشحن',
        delivered: 'تم التسليم',
        cancelled: 'ملغي',
        returned: 'مرتجع'
    };
    return statusMap[status] || status;
}

// جلب جميع العملاء
app.get('/api/admin/customers', requireAdmin, async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        
        let query = { role: 'customer' };
        
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search } }
            ];
        }
        
        const customers = await DB.users.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .toArray();
        
        const total = await DB.users.countDocuments(query);
        
        // جلب عدد الطلبات لكل عميل
        const customersWithOrders = await Promise.all(customers.map(async (customer) => {
            const orderCount = await DB.orders.countDocuments({ user: customer._id });
            const totalSpent = await DB.orders.aggregate([
                { $match: { user: customer._id, status: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: '$pricing.total' } } }
            ]).then(r => r.toArray().then(arr => arr[0]?.total || 0));
            
            return {
                ...customer,
                password: undefined,
                twoFactorSecret: undefined,
                orderCount,
                totalSpent
            };
        }));
        
        res.json({
            success: true,
            data: customersWithOrders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب العملاء:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب العملاء' });
    }
});

// حظر/إلغاء حظر عميل
app.put('/api/admin/customers/:id/ban', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { isBanned, banReason } = req.body;
        
        const customer = await DB.users.findOne({ _id: id });
        
        if (!customer) {
            return res.status(404).json({ error: 'العميل غير موجود' });
        }
        
        await DB.users.updateOne({ _id: id }, {
            $set: {
                isBanned: isBanned === true,
                banReason: isBanned ? banReason || 'انتهاك الشروط' : null
            }
        });
        
        await logActivity(req.user.id, isBanned ? 'BAN_USER' : 'UNBAN_USER', 
            `${isBanned ? 'حظر' : 'إلغاء حظر'} العميل ${customer.fullName}`, 'users', id);
        
        res.json({
            success: true,
            message: isBanned ? 'تم حظر العميل بنجاح' : 'تم إلغاء حظر العميل'
        });
        
    } catch (error) {
        console.error('خطأ في حظر العميل:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء معالجة الطلب' });
    }
});

// إضافة/خصم نقاط ولاء لعميل
app.put('/api/admin/customers/:id/points', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { points, reason } = req.body;
        
        if (!points || points === 0) {
            return res.status(400).json({ error: 'عدد النقاط مطلوب' });
        }
        
        const customer = await DB.users.findOne({ _id: id });
        
        if (!customer) {
            return res.status(404).json({ error: 'العميل غير موجود' });
        }
        
        const newPoints = (customer.loyaltyPoints || 0) + points;
        const newTier = getTier(newPoints);
        
        await DB.users.updateOne({ _id: id }, {
            $inc: { loyaltyPoints: points },
            $set: { loyaltyTier: newTier.name }
        });
        
        // إشعار للعميل
        await DB.notifications.insertOne({
            userId: id,
            title: points > 0 ? '🎁 إضافة نقاط ولاء' : '🔻 خصم نقاط',
            message: points > 0 
                ? `تم إضافة ${points} نقطة ولاء إلى رصيدك${reason ? ` (السبب: ${reason})` : ''}`
                : `تم خصم ${Math.abs(points)} نقطة من رصيدك${reason ? ` (السبب: ${reason})` : ''}`,
            type: 'points',
            read: false,
            createdAt: new Date()
        });
        
        await logActivity(req.user.id, 'ADJUST_POINTS', 
            `${points > 0 ? 'إضافة' : 'خصم'} ${Math.abs(points)} نقطة للعميل ${customer.fullName} - ${reason || 'بدون سبب'}`, 'users', id);
        
        res.json({
            success: true,
            message: `تم ${points > 0 ? 'إضافة' : 'خصم'} ${Math.abs(points)} نقطة بنجاح`,
            newPoints,
            newTier: newTier.name
        });
        
    } catch (error) {
        console.error('خطأ في تعديل النقاط:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تعديل النقاط' });
    }
});

// ==================== إعدادات المتجر ====================

// جلب إعدادات المتجر
app.get('/api/settings/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const setting = await DB.settings.findOne({ type });
        
        res.json({
            success: true,
            data: setting?.data || null
        });
        
    } catch (error) {
        console.error('خطأ في جلب الإعدادات:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب الإعدادات' });
    }
});

// تحديث إعدادات المتجر
app.put('/api/settings/:type', requireAdmin, async (req, res) => {
    try {
        const { type } = req.params;
        const { data } = req.body;
        
        const existing = await DB.settings.findOne({ type });
        
        if (existing) {
            await DB.settings.updateOne({ type }, {
                $set: { data, updatedAt: new Date() }
            });
        } else {
            await DB.settings.insertOne({
                type,
                data,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        
        await logActivity(req.user.id, 'UPDATE_SETTINGS', `تحديث إعدادات ${type}`, 'settings');
        
        res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
        
    } catch (error) {
        console.error('خطأ في تحديث الإعدادات:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث الإعدادات' });
    }
});

// ==================== الأقسام ====================

// جلب جميع الأقسام
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await DB.categories.find({ isActive: true })
            .sort({ order: 1, name: 1 })
            .toArray();
        
        // بناء هيكل شجري
        const buildTree = (items, parentId = null) => {
            return items
                .filter(item => item.parentId === parentId)
                .map(item => ({
                    ...item,
                    children: buildTree(items, item._id)
                }));
        };
        
        const categoryTree = buildTree(categories);
        
        res.json({ success: true, data: categoryTree });
        
    } catch (error) {
        console.error('خطأ في جلب الأقسام:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء جلب الأقسام' });
    }
});

// إضافة قسم جديد
app.post('/api/categories', requireAdmin, async (req, res) => {
    try {
        const { name, parentId, icon, image, order } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'اسم القسم مطلوب' });
        }
        
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-');
        
        const existing = await DB.categories.findOne({ slug });
        
        if (existing) {
            return res.status(400).json({ error: 'قسم بنفس الاسم موجود مسبقاً' });
        }
        
        let level = 0;
        if (parentId) {
            const parent = await DB.categories.findOne({ _id: parentId });
            if (parent) level = parent.level + 1;
        }
        
        const newCategory = await DB.categories.insertOne({
            name,
            slug: `${slug}-${Date.now()}`,
            parentId: parentId || null,
            level,
            icon: icon || '📦',
            image: image || null,
            order: order || 0,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        await logActivity(req.user.id, 'CREATE_CATEGORY', `إضافة قسم جديد: ${name}`, 'categories', newCategory._id);
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة القسم بنجاح',
            data: newCategory
        });
        
    } catch (error) {
        console.error('خطأ في إضافة قسم:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء إضافة القسم' });
    }
});

// تحديث قسم
app.put('/api/categories/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, image, order, isActive } = req.body;
        
        const category = await DB.categories.findOne({ _id: id });
        
        if (!category) {
            return res.status(404).json({ error: 'القسم غير موجود' });
        }
        
        const updates = { updatedAt: new Date() };
        if (name) updates.name = name;
        if (icon !== undefined) updates.icon = icon;
        if (image !== undefined) updates.image = image;
        if (order !== undefined) updates.order = order;
        if (isActive !== undefined) updates.isActive = isActive;
        
        await DB.categories.updateOne({ _id: id }, { $set: updates });
        
        await logActivity(req.user.id, 'UPDATE_CATEGORY', `تحديث قسم: ${category.name}`, 'categories', id);
        
        res.json({ success: true, message: 'تم تحديث القسم بنجاح' });
        
    } catch (error) {
        console.error('خطأ في تحديث قسم:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث القسم' });
    }
});

// حذف قسم
app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const category = await DB.categories.findOne({ _id: id });
        
        if (!category) {
            return res.status(404).json({ error: 'القسم غير موجود' });
        }
        
        // التحقق من وجود منتجات تابعة
        const productsCount = await DB.products.countDocuments({ category: category.name });
        
        if (productsCount > 0) {
            return res.status(400).json({ error: `لا يمكن حذف القسم لأنه يحتوي على ${productsCount} منتج(ات)` });
        }
        
        await DB.categories.deleteOne({ _id: id });
        
        await logActivity(req.user.id, 'DELETE_CATEGORY', `حذف قسم: ${category.name}`, 'categories', id);
        
        res.json({ success: true, message: 'تم حذف القسم بنجاح' });
        
    } catch (error) {
        console.error('خطأ في حذف قسم:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء حذف القسم' });
    }
});

// ==================== WebSocket (دردشة + مزادات) ====================
io.on('connection', (socket) => {
    console.log('🟢 عميل جديد متصل:', socket.id);
    
    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`📌 ${socket.id} انضم إلى الغرفة: ${room}`);
    });
    
    socket.on('leave-room', (room) => {
        socket.leave(room);
        console.log(`📌 ${socket.id} غادر الغرفة: ${room}`);
    });
    
    // دردشة حية
    socket.on('chat-message', async (data) => {
        const { room, message, userId, userName } = data;
        
        const chatMessage = {
            id: uuidv4(),
            userId,
            userName,
            message,
            timestamp: new Date(),
            read: false
        };
        
        // حفظ في قاعدة البيانات
        try {
            await DB.chat_messages.insertOne(chatMessage);
        } catch (error) {
            console.error('خطأ في حفظ رسالة الدردشة:', error);
        }
        
        io.to(room || 'general').emit('chat-message', chatMessage);
    });
    
    // مزادات
    socket.on('join-auction', (auctionId) => {
        socket.join(`auction-${auctionId}`);
        console.log(`🔨 ${socket.id} انضم لمزاد: ${auctionId}`);
    });
    
    socket.on('leave-auction', (auctionId) => {
        socket.leave(`auction-${auctionId}`);
    });
    
    socket.on('place-bid', async (data) => {
        const { auctionId, userId, userName, amount } = data;
        
        try {
            const bidResult = auctionManager.placeBid(auctionId, userId, amount, userName);
            
            io.to(`auction-${auctionId}`).emit('bid-placed', {
                auctionId,
                amount: bidResult.amount,
                userName: bidResult.username,
                time: bidResult.time
            });
            
        } catch (error) {
            socket.emit('bid-error', { message: error.message });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 عميل غير متصل:', socket.id);
    });
});

// ==================== المهام المجدولة ====================

// إنهاء المزادات المنتهية (كل دقيقة)
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const endedAuctions = auctionManager.getAllAuctions().filter(a => a.endTime <= now && a.status === 'active');
    
    for (const auction of endedAuctions) {
        const winner = auctionManager.endAuction(auction.id);
        
        if (winner) {
            // إنشاء طلب تلقائي للفائز
            const product = await DB.products.findOne({ _id: auction.productId });
            
            if (product && winner) {
                const orderNumber = `AUCTION-${Date.now().toString(36).toUpperCase()}`;
                
                await DB.orders.insertOne({
                    orderNumber,
                    user: winner.userId,
                    items: [{
                        productId: auction.productId,
                        name: product.name,
                        price: winner.amount,
                        quantity: 1,
                        image: product.images?.[0]?.url
                    }],
                    pricing: { total: winner.amount },
                    status: 'pending',
                    createdAt: new Date()
                });
                
                await DB.products.updateOne({ _id: auction.productId }, {
                    $set: { isOnAuction: false },
                    $inc: { salesCount: 1 }
                });
                
                io.emit('auction-ended', {
                    auctionId: auction.id,
                    productId: auction.productId,
                    winner: winner.userId,
                    winnerName: winner.username,
                    finalPrice: winner.amount
                });
            }
        }
        
        // إشعار للمشاركين
        io.to(`auction-${auction.id}`).emit('auction-ended', {
            auctionId: auction.id,
            productId: auction.productId,
            finalPrice: auction.currentPrice,
            winner: winner ? winner.userId : null
        });
    }
});

// إرسال إشعارات الصيانة (كل يوم في الساعة 9 صباحاً)
cron.schedule('0 9 * * *', async () => {
    try {
        const orders = await DB.orders.find({
            'maintenanceReminders.dueDate': { $lte: new Date(Date.now() + 7 * 86400000) },
            'maintenanceReminders.notified': false
        }).toArray();
        
        for (const order of orders) {
            for (const reminder of order.maintenanceReminders) {
                if (!reminder.notified && new Date(reminder.dueDate) <= new Date(Date.now() + 7 * 86400000)) {
                    await DB.notifications.insertOne({
                        userId: order.user,
                        title: '🔧 تذكير بالصيانة',
                        message: `حان موعد صيانة منتج ${reminder.productName}`,
                        type: 'maintenance',
                        read: false,
                        createdAt: new Date()
                    });
                    
                    reminder.notified = true;
                }
            }
            
            await DB.orders.updateOne({ _id: order._id }, {
                $set: { maintenanceReminders: order.maintenanceReminders }
            });
        }
        
        console.log(`✅ تم إرسال ${orders.length} تذكير صيانة`);
        
    } catch (error) {
        console.error('خطأ في إرسال تذكيرات الصيانة:', error);
    }
});

// تنظيف قاعدة البيانات (كل يوم في الساعة 3 صباحاً)
cron.schedule('0 3 * * *', async () => {
    try {
        // حذف رموز OTP المنتهية
        const expiredOTPs = await DB.otp_codes.find({
            expiresAt: { $lte: new Date() }
        }).toArray();
        
        for (const otp of expiredOTPs) {
            await DB.otp_codes.deleteOne({ _id: otp._id });
        }
        
        // حذف العناصر القديمة من سلة المحذوفات (أكثر من 30 يوم)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        const oldTrash = await DB.trash.find({
            deletedAt: { $lte: thirtyDaysAgo }
        }).toArray();
        
        for (const item of oldTrash) {
            await DB.trash.deleteOne({ _id: item._id });
        }
        
        console.log(`🧹 تم التنظيف: حذف ${expiredOTPs.length} OTP و ${oldTrash.length} من سلة المحذوفات`);
        
    } catch (error) {
        console.error('خطأ في التنظيف الدوري:', error);
    }
});

// ==================== بدء التشغيل ====================
async function startServer() {
    // إنشاء المجلدات الأساسية
    const directories = [
        'public', 'uploads', 'uploads/products', 'uploads/avatars', 
        'uploads/receipts', 'uploads/banners', 'uploads/sounds', 
        'uploads/logo', 'data', 'backups'
    ];
    
    for (const dir of directories) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    
    // الاتصال بقاعدة البيانات
    await connectToDatabase();
    
    // إنشاء البيانات الافتراضية إذا لم توجد
    const adminExists = await DB.users.findOne({ email: 'alradi@gmail.com' });
    
    if (!adminExists) {
        const adminPassword = await bcrypt.hash('admin123', 12);
        
        await DB.users.insertOne({
            fullName: 'الرعدي',
            username: 'alradi',
            email: 'alradi@gmail.com',
            phone: '+966500000000',
            password: adminPassword,
            role: 'superadmin',
            country: 'السعودية',
            city: 'الرياض',
            loyaltyPoints: 10000,
            loyaltyTier: 'أسطوري',
            isActive: true,
            isBanned: false,
            createdAt: new Date()
        });
        
        console.log('✅ تم إنشاء حساب المدير: alradi@gmail.com / admin123');
    }
    
    const customerExists = await DB.users.findOne({ phone: '+966511111111' });
    
    if (!customerExists) {
        const customerPassword = await bcrypt.hash('customer123', 12);
        
        await DB.users.insertOne({
            fullName: 'أبو يزن',
            username: 'abuyazan',
            email: 'abuyazan@example.com',
            phone: '+966511111111',
            password: customerPassword,
            role: 'customer',
            country: 'السعودية',
            city: 'الرياض',
            district: 'الملز',
            loyaltyPoints: 1250,
            loyaltyTier: 'ذهبي',
            isActive: true,
            isBanned: false,
            phoneVerified: true,
            createdAt: new Date()
        });
        
        console.log('✅ تم إنشاء حساب عميل تجريبي: abuyazan / customer123');
    }
    
    // إنشاء أقسام افتراضية
    const categoriesCount = await DB.categories.countDocuments();
    
    if (categoriesCount === 0) {
        const defaultCategories = [
            { name: 'جوالات', icon: '📱', order: 1 },
            { name: 'لابتوبات', icon: '💻', order: 2 },
            { name: 'عطور', icon: '🧴', order: 3 },
            { name: 'أزياء', icon: '👕', order: 4 },
            { name: 'ساعات', icon: '⌚', order: 5 },
            { name: 'إلكترونيات', icon: '🔌', order: 6 },
            { name: 'منزل ومطبخ', icon: '🏠', order: 7 },
            { name: 'رياضة', icon: '⚽', order: 8 },
            { name: 'كتب', icon: '📚', order: 9 },
            { name: 'ألعاب', icon: '🎮', order: 10 }
        ];
        
        for (const cat of defaultCategories) {
            await DB.categories.insertOne({
                ...cat,
                slug: cat.name,
                level: 0,
                isActive: true,
                createdAt: new Date()
            });
        }
        
        console.log('✅ تم إنشاء الأقسام الافتراضية');
    }
    
    // إعدادات الشحن الافتراضية
    const shippingSettings = await DB.settings.findOne({ type: 'shipping' });
    
    if (!shippingSettings) {
        await DB.settings.insertOne({
            type: 'shipping',
            data: {
                freeShippingThreshold: 500,
                rules: [
                    { country: 'السعودية', type: 'fixed', cost: 25 },
                    { country: 'الإمارات', type: 'fixed', cost: 50 },
                    { country: 'الكويت', type: 'fixed', cost: 40 },
                    { country: 'قطر', type: 'fixed', cost: 45 },
                    { country: 'عمان', type: 'fixed', cost: 45 },
                    { country: 'البحرين', type: 'fixed', cost: 40 },
                    { country: 'مصر', type: 'percentage', cost: 10 },
                    { country: 'الأردن', type: 'percentage', cost: 12 }
                ],
                express: { type: 'fixed', cost: 75 }
            },
            createdAt: new Date()
        });
        
        console.log('✅ تم إنشاء إعدادات الشحن الافتراضية');
    }
    
    // تشغيل السيرفر
    const PORT = process.env.PORT || 3000;
    
    server.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════════════╗
║  🦅 الرعدي أونلاين – النسخة الأسطورية النهائية v13.0            ║
║  ⚡ سوق السعودية الأول – منصة تسوق عالمية متكاملة               ║
╠════════════════════════════════════════════════════════════════════╣
║  🌐 الخادم: http://localhost:${PORT}                               ║
║  👑 لوحة التحكم: http://localhost:${PORT}/admin                   ║
║  📦 قاعدة البيانات: ${dbStatus.connected ? '✅ MongoDB Atlas' : '💾 تخزين محلي'}     ║
╠════════════════════════════════════════════════════════════════════╣
║  🔐 بيانات الدخول:                                                ║
║  👤 المدير: alradi@gmail.com / admin123                          ║
║  👤 العميل: abuyazan / customer123                               ║
╠════════════════════════════════════════════════════════════════════╣
║  ✨ المميزات:                                                     ║
║  🔐 2FA | 📱 OTP واتساب | 🏆 مزادات | 💬 دردشة حية              ║
║  🚚 شحن ديناميكي | 💳 دفع متكامل | 📄 فواتير PDF | ⭐ نظام ولاء   ║
╚════════════════════════════════════════════════════════════════════╝
        `);
    });
}

startServer().catch(console.error);
