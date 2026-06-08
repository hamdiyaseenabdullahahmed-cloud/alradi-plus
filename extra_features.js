// ==============================================
// extra_features.js - الإضافات العبقرية للمتجر
// ==============================================

// 1. الفاتورة الذكية (Smart QR)
function generateSmartQR(productName, productId) {
    const videoGuide = `https://raadi-store.com/guide/${productId}`;
    const qrData = JSON.stringify({
        product: productName,
        guide: videoGuide,
        support: `https://wa.me/${systemSettings.whatsappNumber}?text=طلب صيانة للمنتج ${productName}`
    });
    return generateQR(qrData);
}

// 2. نظام الصيانة التنبؤية (تم إضافته في core.js)
function scheduleMaintenance(orderId, productName, customerPhone) {
    const purchaseDate = new Date();
    const reminderDate = new Date();
    reminderDate.setMonth(reminderDate.getMonth() + 3);
    
    const reminder = {
        orderId,
        productName,
        customerPhone,
        reminderDate: reminderDate.toISOString(),
        sent: false
    };
    
    let reminders = JSON.parse(localStorage.getItem('maintenanceReminders')) || [];
    reminders.push(reminder);
    localStorage.setItem('maintenanceReminders', JSON.stringify(reminders));
    
    console.log(`✅ تم جدولة تذكير صيانة للمنتج ${productName} في ${reminderDate.toLocaleDateString()}`);
}

// 3. نظام مكافحة الاحتيال (Anti-Fraud) - تم إضافته في core.js

// 4. الطلب السريع عبر واتساب - تم إضافته في core.js

// 5. التفريغ الذكي للسلة
function smartClearCart(userId) {
    const cart = JSON.parse(localStorage.getItem(`cart_${userId}`)) || [];
    if (cart.length > 0) {
        localStorage.removeItem(`cart_${userId}`);
        console.log(`🧹 تم تفريغ سلة المستخدم ${userId} تلقائياً`);
        return true;
    }
    return false;
}

// 6. نظام الذكاء العاطفي - المساعد الشخصي
function emotionalAssistant(userId, userBehavior) {
    const user = users.find(u => u.id === userId);
    if (!user) return null;
    
    const suggestions = [];
    
    // اقتراحات بناءً على سجل الشراء
    const userOrders = orders.filter(o => o.userId === userId);
    if (userOrders.length > 0) {
        const lastProduct = userOrders[userOrders.length - 1].productName;
        suggestions.push({
            message: `مرحباً ${user.name}! العملاء الذين اشتروا ${lastProduct} أعجبهم أيضاً...`,
            products: products.filter(p => p.category === 'electronics').slice(0, 3)
        });
    }
    
    // رسائل ترحيبية للعملاء الجدد
    if (userOrders.length === 0) {
        suggestions.push({
            message: `🎉 أهلاً بك ${user.name} في الرعدي أونلاين! استخدم كود WELCOME20 للحصول على خصم 20% على أول طلب`,
            coupon: 'WELCOME20'
        });
    }
    
    return suggestions;
}

// 7. نظام التسعير الديناميكي
function dynamicPricing(productId, demandLevel) {
    const product = products.find(p => p.id === productId);
    if (!product) return null;
    
    let newPrice = product.price;
    
    // إذا كان الطلب مرتفعاً، يزيد السعر بنسبة 10%
    if (demandLevel > 80) {
        newPrice = product.price * 1.1;
    }
    // إذا كان الطلب منخفضاً، يخفض السعر بنسبة 15%
    else if (demandLevel < 20) {
        newPrice = product.price * 0.85;
    }
    
    return {
        originalPrice: product.price,
        dynamicPrice: Math.round(newPrice),
        discount: product.price - Math.round(newPrice)
    };
}

// 8. نظام الخرائط الحرارية (Heatmaps)
function trackUserInteraction(userId, productId, interactionType) {
    const heatmapData = JSON.parse(localStorage.getItem('heatmapData')) || [];
    heatmapData.push({
        userId,
        productId,
        interactionType, // 'view', 'click', 'add_to_cart', 'purchase'
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('heatmapData', JSON.stringify(heatmapData));
    
    // الاحتفاظ فقط بآخر 1000 تفاعل
    if (heatmapData.length > 1000) {
        heatmapData.shift();
        localStorage.setItem('heatmapData', JSON.stringify(heatmapData));
    }
}

// 9. نظام التنبؤ بالطلب (Demand Forecasting)
function forecastDemand(productId, days = 30) {
    const heatmapData = JSON.parse(localStorage.getItem('heatmapData')) || [];
    const productViews = heatmapData.filter(d => d.productId === productId && d.interactionType === 'view');
    const productPurchases = heatmapData.filter(d => d.productId === productId && d.interactionType === 'purchase');
    
    const conversionRate = productViews.length > 0 ? productPurchases.length / productViews.length : 0;
    const dailyViews = productViews.length / 30; // متوسط المشاهدات اليومية
    
    const predictedSales = Math.round(dailyViews * conversionRate * days);
    
    return {
        productId,
        predictedSales,
        confidence: conversionRate * 100,
        recommendation: predictedSales > 50 ? 'زيادة المخزون' : 'مستوى الطلب طبيعي'
    };
}

// 10. نظام مشاركة السلة بين الأصدقاء (Social Cart)
function shareCart(userId, friendEmail) {
    const cart = JSON.parse(localStorage.getItem(`cart_${userId}`)) || [];
    if (cart.length === 0) return false;
    
    const shareLink = `${window.location.origin}/shared-cart.html?cart=${encodeURIComponent(JSON.stringify(cart))}&from=${userId}`;
    
    // محاكاة إرسال البريد
    console.log(`📧 تم إرسال السلة إلى ${friendEmail}: ${shareLink}`);
    
    return shareLink;
}

// 11. نظام معاينة الألوان اللحظي
function previewColor(productId, color) {
    const product = products.find(p => p.id === productId);
    if (!product || !product.colors.includes(color)) return null;
    
    // تغيير صورة المنتج بناءً على اللون (محاكاة)
    const colorImages = {
        'أسود': 'https://picsum.photos/id/0/300/300',
        'أبيض': 'https://picsum.photos/id/20/300/300',
        'أزرق': 'https://picsum.photos/id/21/300/300',
        'فضي': 'https://picsum.photos/id/22/300/300',
        'ذهبي': 'https://picsum.photos/id/23/300/300',
        'بني': 'https://picsum.photos/id/24/300/300'
    };
    
    return {
        productId,
        selectedColor: color,
        imageUrl: colorImages[color] || product.image
    };
}

// 12. عدسة التكبير (Zoom Lens)
function activateZoomLens(imageElement, zoomLevel = 2) {
    const lens = document.createElement('div');
    lens.className = 'zoom-lens';
    lens.style.cssText = `
        position: absolute;
        border: 2px solid var(--primary-color);
        width: 150px;
        height: 150px;
        border-radius: 50%;
        pointer-events: none;
        background-repeat: no-repeat;
        display: none;
        z-index: 1000;
    `;
    
    imageElement.parentElement.style.position = 'relative';
    imageElement.parentElement.appendChild(lens);
    
    imageElement.addEventListener('mousemove', (e) => {
        const rect = imageElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (x > 0 && x < rect.width && y > 0 && y < rect.height) {
            lens.style.display = 'block';
            lens.style.left = `${e.clientX - 75}px`;
            lens.style.top = `${e.clientY - 75}px`;
            
            const bgX = (x / rect.width) * 100;
            const bgY = (y / rect.height) * 100;
            lens.style.backgroundImage = `url(${imageElement.src})`;
            lens.style.backgroundSize = `${rect.width * zoomLevel}px ${rect.height * zoomLevel}px`;
            lens.style.backgroundPosition = `${bgX}% ${bgY}%`;
        } else {
            lens.style.display = 'none';
        }
    });
    
    imageElement.addEventListener('mouseleave', () => {
        lens.style.display = 'none';
    });
}

// 13. نظام الإشعارات الصوتية المتقدم
const soundEffects = {
    welcome: () => playSound('welcome'),
    addToCart: () => playSound('addToCart'),
    orderSuccess: () => playSound('success'),
    notification: () => playSound('notify'),
    checkout: () => {
        playSound('success');
        setTimeout(() => {
            const audio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3');
            audio.volume = 0.2;
            audio.play();
        }, 500);
    }
};

// 14. نظام الحجز المؤقت للسلة (Cart Timer)
function startCartTimer(cartId, minutes = 10) {
    const expiryTime = Date.now() + (minutes * 60 * 1000);
    localStorage.setItem(`cart_timer_${cartId}`, expiryTime);
    
    const timerInterval = setInterval(() => {
        const remaining = localStorage.getItem(`cart_timer_${cartId}`);
        if (!remaining) {
            clearInterval(timerInterval);
            return;
        }
        
        const timeLeft = Math.max(0, Math.floor((remaining - Date.now()) / 1000));
        const minutesLeft = Math.floor(timeLeft / 60);
        const secondsLeft = timeLeft % 60;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            localStorage.removeItem(`cart_timer_${cartId}`);
            localStorage.removeItem(`cart_${cartId}`);
            showNotification('⚠️ انتهت صلاحية الحجز المؤقت على منتجاتك', 'warning');
        }
    }, 1000);
    
    return timerInterval;
}

// 15. نظام الطباعة الذكي للفواتير
function printSmartInvoice(order) {
    const invoiceHtml = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head><meta charset="UTF-8"><title>فاتورة الرعدي أونلاين</title>
        <style>
            body { font-family: 'Cairo', sans-serif; padding: 30px; }
            .invoice { border: 1px solid #ddd; border-radius: 20px; padding: 25px; max-width: 400px; margin: auto; }
            .header { text-align: center; border-bottom: 2px solid #b87333; padding-bottom: 15px; }
            .qr { text-align: center; margin: 20px 0; }
            .total { font-size: 1.5rem; color: #b87333; font-weight: bold; }
            button { background: #b87333; color: white; padding: 10px 20px; border: none; border-radius: 30px; cursor: pointer; }
        </style>
        </head>
        <body>
        <div class="invoice">
            <div class="header">
                <h2>الرعدي أونلاين</h2>
                <p>فاتورة شراء رقم: ${order.id}</p>
                <p>التاريخ: ${order.date}</p>
            </div>
            <h3>بيانات العميل</h3>
            <p>الاسم: ${order.userName}</p>
            <p>الهاتف: ${order.phone || 'غير مسجل'}</p>
            <h3>المنتج</h3>
            <p>${order.productName}</p>
            <h3 class="total">المجموع: ${order.total} ريال</h3>
            <div class="qr">
                <img src="${generateSmartQR(order.productName, order.productId)}" width="120">
                <p>امسح QR لمشاهدة دليل الاستخدام</p>
            </div>
            <button onclick="window.print()">طباعة الفاتورة</button>
        </div>
        </body>
        </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(invoiceHtml);
    printWindow.document.close();
    
    playSound('success');
}

// تصدير الدوال للاستخدام العام
window.extraFeatures = {
    generateSmartQR,
    scheduleMaintenance,
    smartClearCart,
    emotionalAssistant,
    dynamicPricing,
    trackUserInteraction,
    forecastDemand,
    shareCart,
    previewColor,
    activateZoomLens,
    soundEffects,
    startCartTimer,
    printSmartInvoice
};