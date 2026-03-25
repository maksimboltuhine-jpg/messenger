const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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

// ПРОВЕРЬ ЭТУ ССЫЛКУ ЕЩЕ РАЗ. Я взял данные с твоего скрина.
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.m0m9o.mongodb.net/messenger?retryWrites=true&w=majority';

const userSchema = new mongoose.Schema({
login: { type: String, unique: true, required: true },
password: { type: String, required: true },
displayName: String,
avatar: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' },
uid: String
});

const User = mongoose.model('User', userSchema);

const Msg = mongoose.model('Msg', new mongoose.Schema({
user: String, uid: String, text: String, room: String,
fileUrl: String, avatar: String, displayName: String,
createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

let gfsBucket;

// Функция подключения с повтором
const connectDB = async () => {
try {
await mongoose.connect(MONGO_URI);
console.log('--- DATABASE CONNECTED SUCCESSFULLY ---');
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
} catch (err) {
console.error('--- DATABASE CONNECTION ERROR ---');
console.error(err.message);
setTimeout(connectDB, 5000); // Пробуем снова через 5 секунд
}
};

connectDB();

app.post('/auth', async (req, res) => {
const { login, password, isReg } = req.body;

// Если база еще не подключена - отвечаем клиенту
if (mongoose.connection.readyState !== 1) {
return res.status(503).json({ error: "DB not ready. Please wait 10 seconds and try again." });
}

try {
let user = await User.findOne({ login });
if (isReg) {
if (user) return res.status(400).json({ error: "Login taken" });
const hash = await bcrypt.hash(password, 7);
const uid = `#${Math.floor(1000 + Math.random() * 9000)}`;
user = new User({ login, password: hash, uid, displayName: login });
await user.save();
} else {
if (!user || !(await bcrypt.compare(password, user.password))) {
return res.status(400).json({ error: "Wrong login or password" });
}
}
res.json({ login: user.login, uid: user.uid, avatar: user.avatar, displayName: user.displayName });
} catch (e) {
res.status(500).json({ error: "Server Error: " + e.message });
}
});

// Роут для обновления профиля (чтобы не было ошибок в index.html)
app.post('/update-profile', async (req, res) => {
const { login, displayName, avatar } = req.body;
try {
await User.findOneAndUpdate({ login }, { displayName, avatar });
res.json({ success: true });
} catch (e) { res.status(500).json({ error: e.message }); }
});

const upload = multer({ dest: 'uploads/' });
app.post('/upload', upload.single('file'), (req, res) => {
if (!gfsBucket || !req.file) return res.status(500).send("Upload failed");
const ws = gfsBucket.openUploadStream(req.file.originalname);
fs.createReadStream(req.file.path).pipe(ws).on('finish', () => {
fs.promises.unlink(req.file.path);
res.json({ fileUrl: `/file/${ws.id}` });
});
});

app.get('/file/:id', (req, res) => {
if(!gfsBucket) return res.status(500).send();
gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(req.params.id)).pipe(res);
});

io.on('connection', (socket) => {
socket.on('join', async (room) => {
socket.join(room);
if (mongoose.connection.readyState === 1) {
const history = await Msg.find({ room }).sort({ createdAt: -1 }).limit(50).lean();
socket.emit('history', history.reverse());
}
});
socket.on('message', async (data) => {
const m = new Msg(data);
await m.save();
io.to(data.room).emit('renderMsg', data);
});
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
console.log(`Server running on port ${PORT}`);
});