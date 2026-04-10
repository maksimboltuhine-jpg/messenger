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
app.use(express.static(path.join(__dirname, 'public')));

// Отдаем index.html из корня на случай, если папки public нет
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 4. БАЗА ДАННЫХ MONGODB
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';
let gfsBucket;

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("🔥 БАЗА ДАННЫХ ПОДКЛЮЧЕНА");
    gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  }).catch(err => console.log("Mongo Error:", err));

// СХЕМЫ
const User = mongoose.model('User', new mongoose.Schema({
  login: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  uid: { type: String, required: true }
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
  user: String, uid: String, text: String, room: String,
  fileUrl: String, fileType: String, fileName: String,
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Авто-удаление через 24ч
}));

// 5. АВТОРИЗАЦИЯ
app.post('/auth', async (req, res) => {
  const { login, password, isReg } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Пустые поля' });
  
  try {
    if (isReg) {
      const exist = await User.findOne({ login });
      if (exist) return res.status(400).json({ error: 'Логин занят' });
      const hash = await bcrypt.hash(password, 10);
      const uid = 'u' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      await User.create({ login, password: hash, uid });
      return res.json({ login, uid });
    } else {
      const user = await User.findOne({ login });
      if (!user) return res.status(400).json({ error: 'Не найден' });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ error: 'Неверный пароль' });
      return res.json({ login, uid: user.uid });
    }
  } catch (e) { 
    res.status(500).json({ error: 'Ошибка сервера' }); 
  }
});

// 6. ЗАГРУЗКА И СКАЧИВАНИЕ ФАЙЛОВ
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!gfsBucket || !req.file) return res.status(500).send('Ошибка БД');
  
  let name = req.file.originalname;
  try { name = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch(e) {}
  
  const writeStream = gfsBucket.openUploadStream(name, { contentType: req.file.mimetype });
  fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
    fs.promises.unlink(req.file.path).catch(()=>{}); // удаляем временный файл
    res.json({ fileUrl: `/file/${writeStream.id}`, fileId: writeStream.id, fileType: req.file.mimetype, fileName: name });
  });
});

app.get('/file/:id', (req, res) => {
  if (!gfsBucket) return res.status(503).send("База не готова");
  const fileId = new mongoose.Types.ObjectId(req.params.id);
  gfsBucket.openDownloadStream(fileId).pipe(res);
});

// 7. ЛОГИКА ЧАТА (СОКЕТЫ)
io.on('connection', (socket) => {
  socket.on('join', async (room) =>{
    socket.join(room);
    if (mongoose.connection.readyState === 1) {
      const history= await Msg.find({ room }).sort({ createdAt: 1 }).limit(100).lean();
      socket.emit('history', history);
    }
  });

  socket.on('message', async (data) => {
    try {
      const m = await Msg.create(data);
      io.to(data.room).emit('message', m);
    } catch(e) { console.log("Ошибка отправки:", e); }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`);
});