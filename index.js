const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

mongoose.connect('mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority');

const User = mongoose.model('User', new mongoose.Schema({
    login: { type: String, unique: true },
    password: { type: String },
    uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
    user: String, uid: String, text: String,
    createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

app.post('/auth', async (req, res) => {
    const { login, password, isReg } = req.body;
    try {
        let user = await User.findOne({ login });
        if (isReg) {
            if (user) return res.status(400).json({ error: "Логин занят" });
            const hash = await bcrypt.hash(password, 7);
            const uid = Math.floor(1000 + Math.random() * 9000).toString();
            user = new User({ login, password: hash, uid });
            await user.save();
        } else {
            if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Ошибка" });
        }
        res.json({ login: user.login, uid: user.uid });
    } catch (e) { res.status(500).json({ error: "Ошибка БД" }); }
});

io.on('connection', (socket) => {
    socket.on('join', async () => {
        const history = await Msg.find().sort({ createdAt: 1 });
        socket.emit('history', history);
    });
    socket.on('message', async (data) => {
        const saved = await new Msg(data).save();
        io.emit('renderMsg', saved);
    });
});

server.listen(process.env.PORT || 10000, '0.0.0.0');