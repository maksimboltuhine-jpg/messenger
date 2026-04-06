const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
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
app.use(express.json());
app.use(express.static(__dirname));

const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

// СХЕМЫ
const User = mongoose.model('User', new mongoose.Schema({
    login: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
    user: String, uid: String, text: String, room: String,
    fileUrl: String, fileName: String, fileType: String,
    createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

let gfsBucket;
mongoose.connect(MONGO_URI).then(() => {
    console.log('✅ DATABASE CONNECTED');
    gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
}).catch(err => console.error('DB Connection Error:', err));

// PEER SERVER
const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

// АВТОРИЗАЦИЯ
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
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(400).json({ error: "Неверный логин или пароль" });
            }
        }
        res.json({ login: user.login, uid: user.uid });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

// ФАЙЛЫ
const upload = multer({ dest: 'uploads/' });
app.post('/upload', upload.single('file'), (req, res) => {
    if (!gfsBucket || !req.file) return res.status(500).json({ error: 'Ошибка файла' });
    const writeStream = gfsBucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
    fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
        fs.promises.unlink(req.file.path);
        res.json({ fileUrl: `/file/${writeStream.id}`, fileName: req.file.originalname, fileType: req.file.mimetype });
    });
});

app.get('/file/:id', (req, res) => {
    try {
        gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(req.params.id)).pipe(res);
    } catch (e) { res.status(404).send('Not found'); }
});

// СОКЕТЫ
io.on('connection', (socket) => {
    socket.on('join', async (room) => {
        socket.join(room);
        const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50).lean();
        socket.emit('history', history);
    });

    socket.on('message', async (data) => {
        const savedMsg = await new Msg(data).save();
        io.to(data.room).emit('renderMsg', savedMsg);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 СЕРВЕР ГОТОВ: ПОРТ ${PORT}`));