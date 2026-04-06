const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

// Схемы
const User = mongoose.model('User', new mongoose.Schema({
login: { type: String, unique: true },
password: { type: String },
uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
user: String, uid: String, text: String, room: String,
createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

// Подключение с ожиданием
const connect = () => {
mongoose.connect(MONGO_URI)
.then(() => console.log("✅ DB Connected"))
.catch(e => { console.log("❌ Retry in 5s..."); setTimeout(connect, 5000); });
};
connect();

app.post('/auth', async (req, res) => {
if (mongoose.connection.readyState !== 1) return res.status(503).json({error: "DB not ready"});
const { login, password, isReg } = req.body;
try {
let user = await User.findOne({ login });
if (isReg) {
if (user) return res.status(400).json({ error: "Занято" });
const uid = Math.floor(1000 + Math.random() * 9000).toString();
user = new User({ login, password: await bcrypt.hash(password, 7), uid });
await user.save();
} else {
if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Ошибка" });
}
res.json({ login: user.login, uid: user.uid });
} catch (e) { res.status(500).json({ error: "Server error" }); }
});

io.on('connection', (socket) => {
socket.on('join', async (room) => {
socket.join(room);
if(mongoose.connection.readyState === 1) {
const h = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50);
socket.emit('history', h);
}
});
socket.on('message', async (data) => {
const m = new Msg(data);
await m.save();
io.to(data.room).emit('renderMsg', data);
});
});

server.listen(process.env.PORT || 10000, '0.0.0.0');