const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

// Твоя строка подключения к MongoDB
const mongoURI = "mongodb+srv://maksimboltuhine_db_user:Maksim12345@m0m9o.mongodb.net/messenger_db?retryWrites=true&w=majority";

let gfs, gridfsBucket;

mongoose.connect(mongoURI)
.then(() => {
console.log("MongoDB Connected!");
const db = mongoose.connection.db;
gridfsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
gfs = db.collection('uploads.files');
})
.catch(err => console.error("MongoDB Error:", err));

// МИДДЛВЕЙР: Проверка готовности БД (чтобы не было 500 ошибки)
const checkDB = (req, res, next) => {
if (mongoose.connection.readyState !== 1) {
return res.status(503).json({ error: "DB not ready. Please wait 10 seconds and try again." });
}
next();
};

const User = mongoose.model('User', new mongoose.Schema({
username: { type: String, unique: true, required: true },
password: { type: String, required: true },
avatar: String,
status: String,
lastSeen: { type: Date, default: Date.now }
}));

// АВТОРИЗАЦИЯ
app.post('/auth', checkDB, async (req, res) => {
const { type, username, password } = req.body;
try {
if (type === 'register') {
const hashed = await bcrypt.hash(password, 10);
const user = new User({ username, password: hashed });
await user.save();
return res.json({ success: true, user: { username } });
} else {
const user = await User.findOne({ username });
if (user && await bcrypt.compare(password, user.password)) {
return res.json({ success: true, user: { username, avatar: user.avatar, status: user.status } });
}
res.status(401).json({ error: "Wrong credentials" });
}
} catch (e) { res.status(500).json({ error: e.message }); }
});

// ПРОФИЛЬ
app.post('/update-profile', checkDB, async (req, res) => {
const { username, avatar, status } = req.body;
await User.findOneAndUpdate({ username }, { avatar, status });
res.json({ success: true });
});

// СОКЕТЫ (Чат)
io.on('connection', (socket) => {
socket.on('join', (room) => socket.join(room));
socket.on('message', (data) => {
io.to(data.room).emit('message', data);
});
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));