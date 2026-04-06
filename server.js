const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

app.use(express.json({limit: '100mb'}));
app.use(express.static(__dirname));

const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

// Схемы базы данных
const User = mongoose.model('User', new mongoose.Schema({
login: { type: String, unique: true },
password: { type: String },
uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
user: String, uid: String, text: String, room: String,
fileUrl: String, fileId: String, fileType: String, fileName: String,
createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

let gfsBucket;
const connect = () => {
mongoose.connect(MONGO_URI)
.then(() => {
console.log("✅ База подключена");
gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
})
.catch(e => { console.log("❌ Ошибка БД. Рестарт через 5 сек..."); setTimeout(connect, 5000); });
};
connect();

const checkDB = (req, res, next) => {
if (mongoose.connection.readyState !== 1 || !gfsBucket) return res.status(503).json({error: "База не готова"});
next();
};

app.post('/auth', checkDB, async (req, res) => {
const { login, password, isReg } = req.body;
try {
let user = await User.findOne({ login });
if (isReg) {
if (user) return res.status(400).json({ error: "Логин занят" });
const uid = Math.floor(1000 + Math.random() * 9000).toString();
user = new User({ login, password: await bcrypt.hash(password, 7), uid });
await user.save();
} else {
if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Ошибка входа" });
}
res.json({ login: user.login, uid: user.uid });
} catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

// Отправка и скачивание файлов
const upload = multer({ dest: 'uploads/' });
app.post('/upload', checkDB, upload.single('file'), (req, res) => {
if (!req.file) return res.status(400).send('Нет файла');
let name = req.file.originalname;
try { name = Buffer.from(name, 'latin1').toString('utf8'); } catch(e){}

const writeStream = gfsBucket.openUploadStream(name, { contentType: req.file.mimetype });
fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
fs.promises.unlink(req.file.path);
res.json({ fileUrl: `/file/${writeStream.id}`, fileId: writeStream.id, fileType: req.file.mimetype, fileName: name });
});
});

app.get('/file/:id', checkDB, (req, res) => {
gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(req.params.id)).pipe(res);
});

io.on('connection', (socket) => {
socket.on('join', async (room) => {
socket.join(room);
if(mongoose.connection.readyState === 1) {
const h = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50).lean();
socket.emit('history', h);
}
});
socket.on('message', async (data) => {
const m = new Msg(data);
await m.save();
io.to(data.room).emit('renderMsg', m);
});
});

server.listen(process.env.PORT || 10000, '0.0.0.0');