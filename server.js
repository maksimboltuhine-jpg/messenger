const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

app.use(express.json({limit: '100mb'}));
app.use(express.static(__dirname));

// PeerJS сервер для звонков
const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

// Схемы
const User = mongoose.model('User', new mongoose.Schema({
login: { type: String, unique: true, required: true },
password: { type: String, required: true },
uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
user: String, uid: String, text: String, room: String,
fileUrl: String, fileId: String, fileType: String, fileName: String,
createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

let gfsBucket;
const connectDB = async () => {
try {
await mongoose.connect(MONGO_URI);
console.log('🚀 v13.1: CHAT & ULTIMATE CALLS ONLINE');
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
} catch (err) {
console.error('❌ DB Fail, retrying...', err.message);
setTimeout(connectDB, 5000);
}
};
connectDB();

const checkDB = (req, res, next) => {
if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "База спит, жди 10 сек" });
next();
};

app.post('/auth', checkDB, async (req, res) => {
const { login, password, isReg } = req.body;
try {
let user = await User.findOne({ login });
if (isReg) {
if (user) return res.status(400).json({ error: "Логин занят" });
const hashPassword = await bcrypt.hash(password, 7);
const uid = Math.floor(1000 + Math.random() * 9000).toString();
user = new User({ login, password: hashPassword, uid });
await user.save();
} else {
if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Ошибка входа" });
}
res.json({ login: user.login, uid: user.uid });
} catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

// Работа с файлами
const upload = multer({ dest: 'uploads/' });
app.post('/upload', checkDB, upload.single('file'), (req, res) => {
if (!gfsBucket || !req.file) return res.status(500).send('Ошибка');
const writeStream = gfsBucket.openUploadStream(req.file.originalname);
fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
fs.promises.unlink(req.file.path);
res.json({ fileUrl: `/file/${writeStream.id}`, fileId: writeStream.id, fileType: req.file.mimetype, fileName: req.file.originalname });
});
});

app.get('/file/:id', (req, res) => {
if (!gfsBucket) return res.status(503).send("База не готова");
gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(req.params.id)).pipe(res);
});

// Сокеты для чата
io.on('connection', (socket) => {
socket.on('join', async (room) => {
socket.join(room);
if (mongoose.connection.readyState === 1) {
const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50).lean();
socket.emit('history', history);
}
});
socket.on('message', async (data) => {
const m = new Msg(data); await m.save();
io.to(data.room).emit('renderMsg', { ...data, _id: m._id });
});
});

server.listen(process.env.PORT || 10000, '0.0.0.0');