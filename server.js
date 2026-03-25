const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

app.use(compression());
app.use(express.json({limit: '50mb'}));
app.use(express.static(__dirname));

// !!! ВНИМАНИЕ: ЗАМЕНИ ЭТУ СТРОКУ НА СВОЮ ИЗ ATLAS !!!
// Ошибка ENOTFOUND была из-за того, что здесь стояло "abcde"
const MONGO_URI = 'mongodb+srv://maksim:Gfynthf2010@cluster0.XXXXX.mongodb.net/messenger?retryWrites=true&w=majority';

const User = mongoose.model('User', new mongoose.Schema({
login: { type: String, unique: true, required: true },
password: { type: String, required: true },
displayName: String,
avatar: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' },
uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
user: String, uid: String, text: String, room: String,
fileUrl: String, fileType: String, avatar: String,
createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

let gfsBucket;
mongoose.connect(MONGO_URI).then(() => {
console.log('🚀 БАЗА ПОДКЛЮЧЕНА');
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
}).catch(err => {
console.error('❌ КРИТИЧЕСКАЯ ОШИБКА БАЗЫ:', err.message);
});

app.post('/auth', async (req, res) => {
const { login, password, isReg } = req.body;
try {
if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "База данных еще грузится..." });

let user = await User.findOne({ login });
if (isReg) {
if (user) return res.status(400).json({ error: "Логин занят" });
const hash = await bcrypt.hash(password, 7);
const uid = `#${Math.floor(1000 + Math.random() * 9000)}`;
user = new User({ login, password: hash, uid, displayName: login });
await user.save();
} else {
if (!user || !(await bcrypt.compare(password, user.password))) {
return res.status(400).json({ error: "Неверный логин или пароль" });
}
}
res.json({ login: user.login, uid: user.uid, avatar: user.avatar, displayName: user.displayName });
} catch (e) {
console.log(e);
res.status(500).json({ error: "Ошибка сервера" });
}
});

app.post('/update-profile', async (req, res) => {
const { login, displayName, avatar } = req.body;
try {
await User.findOneAndUpdate({ login }, { displayName, avatar });
res.json({ success: true });
} catch (e) { res.status(500).send(); }
});

const upload = multer({ dest: 'uploads/' });
app.post('/upload', upload.single('file'), (req, res) => {
if (!gfsBucket || !req.file) return res.status(500).send();
const ws = gfsBucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
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

server.listen(process.env.PORT || 10000, '0.0.0.0');