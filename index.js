const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose');
const multer = require('multer');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(compression());
app.use(express.json());
app.use(express.static(__dirname));

// Твоя база данных
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

const User = mongoose.model('User', new mongoose.Schema({
    login: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
    user: String, uid: String, text: String, room: String,
    fileUrl: String, fileName: String,
    createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

mongoose.connect(MONGO_URI).then(() => console.log('✅ База подключена'));

// PeerJS сервер внутри Express
const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

// Авторизация
app.post('/auth', async (req, res) => {
    const { login, password, isReg } = req.body;
    try {
        let user = await User.findOne({ login });
        if (isReg) {
            if (user) return res.status(400).json({ error: "Логин занят" });
            const hash = await bcrypt.hash(password, 7);
            const uid = Math.floor(1000 + Math.random() * 9000);
            user = new User({ login, password: hash, uid: `${uid}` }); // Без решетки!
            await user.save();
        } else {
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(400).json({ error: "Неверный логин/пароль" });
            }
        }
        res.json({ login: user.login, uid: user.uid });
    } catch (e) { res.status(500).json({ error: "Ошибка БД" }); }
});

io.on('connection', (socket) => {
    socket.on('join', async (room) => {
        socket.join(room);
        const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50);
        socket.emit('history', history);
    });
    socket.on('message', async (data) => {
        await new Msg(data).save();
        io.to(data.room).emit('renderMsg', data);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 ОК: Порт ${PORT}`));