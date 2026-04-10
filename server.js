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

// 1. СОКЕТЫ (Чат)
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

// 2. PEERJS (Звонки)
const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

// 3. БАЗОВЫЕ НАСТРОЙКИ
app.use(compression());
app.use(express.json({limit: '100mb'}));

// ВАЖНО: Если index.html в корне, этот маршрут обязателен!
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 4. БАЗА ДАННЫХ MONGODB
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';
let gfsBucket;

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('✅ MongoDB подключена');
    gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  })
  .catch(err => console.error('❌ Ошибка БД:', err));

const User = mongoose.model('User', { login: {type:String, unique:true}, password: String, uid: String });
const Msg = mongoose.model('Msg', { user: String, uid: String, text: String, room: String, fileUrl: String, fileId: String, fileType: String, fileName: String, createdAt: { type: Date, default: Date.now } });

// 5. АВТОРИЗАЦИЯ
app.post('/auth', async (req, res) => {
  const { login, password, isReg } = req.body;
  try {
    if (isReg) {
      const hash = await bcrypt.hash(password, 10);
      const uid = Math.floor(1000 + Math.random() * 9000).toString();
      const user = new User({ login, password: hash, uid });
      await user.save();
      return res.json({ login, uid });
    } else {
      const user = await User.findOne({ login });
      if (!user || !await bcrypt.compare(password, user.password)) return res.json({ error: 'Неверные данные' });
      res.json({ login: user.login, uid: user.uid });
    }
  } catch (e) { res.json({ error: 'Ошибка сервера или логин занят' }); }
});

// 6. ЗАГРУЗКА ФАЙЛОВ
const upload = multer({ dest: 'temp/' });
app.post('/upload', upload.single('file'), (req, res) => {
  if (!gfsBucket || !req.file) return res.status(500).send('Ошибка БД');
  const writeStream = gfsBucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
  fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
    fs.promises.unlink(req.file.path).catch(()=>{});
    res.json({ fileUrl: `/file/${writeStream.id}`, fileId: writeStream.id, fileType: req.file.mimetype, fileName: req.file.originalname });
  });
});

app.get('/file/:id', (req, res) => {
  const fileId = new mongoose.Types.ObjectId(req.params.id);
  gfsBucket.openDownloadStream(fileId).pipe(res);
});

// 7. СОКЕТЫ
io.on('connection', (socket) => {
  socket.on('join', async (room) => {
    socket.join(room);
    const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50);
    socket.emit('history', history);
  });
  socket.on('message', async (data) => {
    const msg = new Msg(data);
    await msg.save();
    io.to(data.room).emit('message', data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));