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
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

// Интеграция PeerJS сервера по пути /peerjs
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/'
});

app.use(compression());
app.use(express.json({limit: '100mb'}));
app.use(express.static(__dirname));
app.use('/peerjs', peerServer);

const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

// СХЕМЫ
const User = mongoose.model('User', new mongoose.Schema({
    login: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
    user: String, uid: String, text: String, room: String,
    fileUrl: String, fileType: String, fileName: String,
    createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

let gfsBucket;

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('🚀 SYSTEM READY: DB & PEER ONLINE');
        gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    } catch (err) {
        console.error('❌ DB Fail, retrying...', err.message);
        setTimeout(connectDB, 5000);
    }
};
connectDB();

app.post('/auth', async (req, res) => {
    const { login, password, isReg } = req.body;
    try {
        let user = await User.findOne({ login });
        if (isReg) {
            if (user) return res.status(400).json({ error: "Логин занят" });
            const hashPassword = await bcrypt.hash(password, 7);
            const uid = Math.floor(1000 + Math.random() * 9000);
            user = new User({ login, password: hashPassword, uid: `#${uid}` });
            await user.save();
        } else {
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(400).json({ error: "Ошибка входа" });
            }
        }
        res.json({ login: user.login, uid: user.uid });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

const upload = multer({ dest: 'uploads/' });
app.post('/upload', upload.single('file'), (req, res) => {
    if (!gfsBucket || !req.file) return res.status(500).send('Ошибка');
    const writeStream = gfsBucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
    fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
        fs.promises.unlink(req.file.path);
        res.json({ fileUrl: `/file/${writeStream.id}`, fileId: writeStream.id, fileType: req.file.mimetype, fileName: req.file.originalname });
    });
});

app.get('/file/:id', (req, res) => {
    if (!gfsBucket) return res.status(503).send("База не готова");
    gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(req.params.id)).pipe(res);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    socket.on('join', async (room) => {
        socket.join(room);
        const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50).lean();
        socket.emit('history', history);
    });
    socket.on('message', async (data) => {
        const m = new Msg(data);
        await m.save();
        io.to(data.room).emit('renderMsg', { ...data, _id: m._id });
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));