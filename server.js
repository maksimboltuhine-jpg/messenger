const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer'); // Подтянули PeerJS
const mongoose = require('mongoose');
const multer = require('multer');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// 1. НАСТРОЙКА СОКЕТОВ (ЧАТ)
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

// 2. НАСТРОЙКА PEERJS (ЗВОНКИ)
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
// Указываем, что все запросы для звонков идут по маршруту /peerjs
app.use('/peerjs', peerServer); 

// 3. БАЗОВЫЕ НАСТРОЙКИ EXPRESS
app.use(compression());
app.use(express.json({limit: '100mb'}));

// ВАЖНО: Теперь сервер отдает файлы только из папки public!
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ДАЛЬШЕ ИДЕТ ТВОЙ КОД ИЗ МЕССЕНДЖЕРА (БД, СХЕМЫ, РОУТЫ)
// ==========================================

const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';

// СХЕМЫ БАЗЫ ДАННЫХ
const User = mongoose.model('User', new mongoose.Schema({
  login: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
  user: String, uid: String, text: String, room: String,
  fileUrl: String, fileType: String, fileName: String,
  createdAt: { type: Date, default: Date.now, expires: 86400 } // удаление через 24ч
}));

// ПОДКЛЮЧЕНИЕ К MONGO И GRIDFS
let gfsBucket;
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("MongoDB Connected");
    gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  })
  .catch(err => console.log("Mongo Error:", err));

// АВТОРИЗАЦИЯ
app.post('/auth', async (req, res) => {
  const { login, password, isReg } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Пустые поля' });
  try {
    if (isReg) {
      const exist = await User.findOne({ login });
      if (exist) return res.status(400).json({ error: 'Логин занят' });
      const hash = await bcrypt.hash(password, 10);
      const uid = 'u' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      await User.create({ login, password: hash, uid });
      return res.json({ login, uid });
    } else {
      const user = await User.findOne({ login });
      if (!user) return res.status(400).json({ error: 'Не найден' });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ error: 'Неверный пароль' });
      return res.json({ login, uid: user.uid });
    }
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ФАЙЛЫ И СОКЕТЫ (Оставил структуру, добавь сюда остаток своего кода загрузки файлов и io.on('connection'))
// ... твой код multer и сокетов ...

// ЗАПУСК ЕДИНОГО СЕРВЕРА
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on port ${PORT}`);
});