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

// Настройка PeerJS
const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

app.use(compression());
app.use(express.json({limit: '100mb'}));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// База данных
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';
let gfsBucket;

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("🔥 DB CONNECTED");
    gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  }).catch(err => console.log("Mongo Error:", err));

const User = mongoose.model('User', new mongoose.Schema({
  login: { type: String, unique: true },
  password: { type: String },
  uid: { type: String }
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
  user: String, uid: String, text: String, room: String,
  fileUrl: String, fileType: String, fileName: String,
  createdAt: { type: Date, default: Date.now, expires: 86400 }
}));

// Авторизация
app.post('/auth', async (req, res) => {
  const { login, password, isReg } = req.body;
  try {
    if (isReg) {
      const hash = await bcrypt.hash(password, 10);
      const uid = 'u' + Math.random().toString(36).substring(7);
      await User.create({ login, password: hash, uid });
      return res.json({ login, uid });
    } else {
      const user = await User.findOne({ login });
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(400).json({ error: 'Неверные данные' });
      }
      res.json({ login: user.login, uid: user.uid });
    }
  } catch (e) { res.status(500).json({ error: 'Ошибка или логин занят' }); }
});

// Файлы
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!gfsBucket || !req.file) return res.status(500).send('Ошибка БД');
  const writeStream = gfsBucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
  fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
    fs.promises.unlink(req.file.path).catch(()=>{});
    res.json({ fileUrl: `/file/${writeStream.id}`, fileType: req.file.mimetype, fileName: req.file.originalname });
  });
});

app.get('/file/:id', (req, res) => {
  if (!gfsBucket) return res.status(503).send("База не готова");
  gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(req.params.id)).pipe(res);
});

io.on('connection', (socket) => {
  socket.on('join', async (room) => {
    socket.join(room);
    const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50);
    socket.emit('history', history);
  });
  socket.on('message', async (data) => {
    await Msg.create(data);
    io.to(data.room).emit('message', data);
  });
});

server.listen(process.env.PORT || 10000, '0.0.0.0', () => console.log('🚀 WORK ON PORT 10000'));