const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static('public'));

// سجل الدردشة المؤقت
let chatLog = [];

io.on('connection', (socket) => {
    console.log('عميل جديد متصل');
    socket.emit('chatHistory', chatLog);
    socket.on('chatMessage', (msg) => {
        chatLog.push(msg);
        io.emit('chatMessage', msg);
    });
    socket.on('disconnect', () => console.log('عميل غادر'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 متجر الرعدي يعمل على المنفذ ${PORT}`));