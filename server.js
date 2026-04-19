const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 1. Сокеты
const io = new Server(server, { cors: { origin: "*" } });

// 2. PeerJS (Звонки)
const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 3. Подключение к БД
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI).then(function() { console.log("DB Connected"); });

const Msg = mongoose.model('Msg', { user: String, text: String, room: String, createdAt: { type: Date, default: Date.now } });

// 4. Логика сокетов
io.on('connection', function(socket) {
    socket.on('join', function(room) {
        socket.join(room);
        Msg.find({ room: room }).sort({ createdAt: 1 }).limit(50).then(function(ms) {
            socket.emit('history', ms);
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
server.listen(PORT, '0.0.0.0', function() { console.log('Server running on port ' + PORT); });