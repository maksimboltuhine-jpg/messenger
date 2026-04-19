const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 1. Настройка Socket.io
const io = new Server(server, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 
});

// 2. Настройка PeerJS
const peerServer = ExpressPeerServer(server, { 
    debug: true, 
    path: '/' 
});
app.use('/peerjs', peerServer);

// 3. Базовые настройки
app.use(express.json({limit: '100mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// 4. Подключение к базе данных
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
  .then(function() { console.log("✅ MongoDB Connected"); })
  .catch(function(err) { console.log("❌ DB Error:", err); });

const Msg = mongoose.model('Msg', { 
    user: String, 
    uid: String, 
    text: String, 
    room: String, 
    createdAt: { type: Date, default: Date.now } 
});

// 5. Роуты (пример авторизации)
app.post('/auth', function(req, res) {
    const data = req.body;
    // Упрощенная логика для теста: выдаем ID на основе логина
    const uid = data.login.toLowerCase().replace(/\s/g, '') + Math.floor(Math.random() * 99);
    res.json({ login: data.login, uid: uid });
});

// 6. Сокеты
io.on('connection', function(socket) {
    socket.on('join', function(room) {
        socket.join(room);
        Msg.find({ room: room }).sort({ createdAt: 1 }).limit(50)
            .then(function(history) {
                socket.emit('history', history);
            });
    });

    socket.on('message', function(data) {
        const newMsg = new Msg(data);
        newMsg.save().then(function() {
            io.to(data.room).emit('message', data);
        });
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', function() {
    console.log('🚀 Server is running on port ' + PORT);
});