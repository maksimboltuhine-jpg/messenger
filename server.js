const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose');
const multer = require('multer');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// 1. ПИР-СЕРВЕР (Звонки)
const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

// 2. СОКЕТЫ (Чат)
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

// 3. НАСТРОЙКИ СЕРВЕРА
app.use(compression());
app.use(express.json({limit: '100mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// 4. БАЗА ДАННЫХ MONGODB (Твоя ссылка)
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';
let gfsBucket;

mongoose.connect(MONGO_URI).then(() => {
    console.log('🚀 DATABASE ONLINE & STABLE');
    gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
}).catch(err => console.error('❌ DB Error:', err));

// СХЕМЫ
const User = mongoose.model('User', new mongoose.Schema({
    login: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    uid: { type: String, required: true }
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
    user: String, uid: String, text: String, room: String,
    fileUrl: String, fileType: String, fileName: String, fileId: String,
    createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

// 5. АВТОРИЗАЦИЯ (Генерируем чистые UID для PeerJS)
app.post('/auth', async (req, res) => {
    const { login, password, isReg } = req.body;
    try {
        let user = await User.findOne({ login });
        if (isReg) {
            if (user) return res.status(400).json({ error: "Логин занят" });
            const hash = await bcrypt.hash(password, 7);
            // Чистый ID без символов для PeerJS
            const uid = 'id' + Math.random().toString(36).substr(2, 9);
            user = await User.create({ login, password: hash, uid });
        } else {
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(400).json({ error: "Ошибка входа" });
            }
        }
        res.json({ login: user.login, uid: user.uid });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

// 6. ФАЙЛЫ (Upload/Download)
const upload = multer({ dest: 'uploads/' });
app.post('/upload', upload.single('file'), (req, res) => {
    if (!gfsBucket || !req.file) return res.status(500).send('Ошибка');
    let name = req.file.originalname;
    try { name = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}

    const writeStream = gfsBucket.openUploadStream(name, { contentType: req.file.mimetype });
    fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
        fs.promises.unlink(req.file.path).catch(()=>{});
        res.json({ fileUrl: `/file/${writeStream.id}`, fileId: writeStream.id.toString(), fileType: req.file.mimetype, fileName: name });
    });
});

app.get('/file/:id', (req, res) => {
    try {
        const fileId = new mongoose.Types.ObjectId(req.params.id);
        gfsBucket.openDownloadStream(fileId).pipe(res);
    } catch(e) { res.status(404).send("Файл не найден"); }
});

// 7. ЛОГИКА СОКЕТОВ
io.on('connection', (socket) => {
    socket.on('join', async (room) => {
        socket.join(room);
        const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50).lean();
        socket.emit('history', history);
    });

    socket.on('message', async (data) => {
        const m = await Msg.create(data);
        io.to(data.room).emit('renderMsg', { ...data, _id: m._id });
    });

    socket.on('deleteMsg', asy


nc ({ id, room, fileId }) => {
        await Msg.findByIdAndDelete(id);
        if (fileId && gfsBucket) {
            try { await gfsBucket.delete(new mongoose.Types.ObjectId(fileId)); } catch(e) {}
        }
        io.to(room).emit('msgDeleted', id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 MONOLITH UP ON PORT ${PORT}`));