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

// SOCKET.IO
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8
});

// 🔥 FIX: УБРАЛ path из peerServer
const peerServer = ExpressPeerServer(server, {
  debug: true
});

app.use('/peerjs', peerServer);

// БАЗА
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';
let gfsBucket;

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🔥 Mongo OK");
    gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });
  });

// SCHEMAS
const User = mongoose.model('User', new mongoose.Schema({
  login: String,
  password: String,
  uid: String
}));

const Msg = mongoose.model('Msg', new mongoose.Schema({
  user: String,
  uid: String,
  text: String,
  room: String,
  fileUrl: String,
  fileType: String,
  fileName: String,
  createdAt: { type: Date, default: Date.now }
}));

// MIDDLEWARE
app.use(compression());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// AUTH
app.post('/auth', async (req, res) => {
  const { login, password, isReg } = req.body;

  if (isReg) {
    const hash = await bcrypt.hash(password, 10);
    const uid = 'u' + Date.now().toString(36);

    await User.create({ login, password: hash, uid });
    return res.json({ login, uid });
  }

  const user = await User.findOne({ login });
  if (!user) return res.json({ error: 'нет юзера' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ error: 'пароль' });

  res.json({ login, uid: user.uid });
});

// FILE UPLOAD
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), (req, res) => {
  const stream = gfsBucket.openUploadStream(req.file.originalname);

  fs.createReadStream(req.file.path)
    .pipe(stream)
    .on('finish', () => {
      fs.unlinkSync(req.file.path);

      res.json({
        fileUrl: `/file/${stream.id}`,
        fileName: req.file.originalname,
        fileType: req.file.mimetype
      });
    });
});

app.get('/file/:id', (req, res) => {
  const id = new mongoose.Types.ObjectId(req.params.id);
  gfsBucket.openDownloadStream(id).pipe(res);
});

// SOCKETS
io.on('connection', (socket) => {

  socket.on('join', async (room) => {
    socket.join(room);

    const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(100);
    socket.emit('history', history);
  });

  socket.on('message', async (data) => {
    const m = await Msg.create(data);
    io.to(data.room).emit('message', m);
  });

});

server.listen(3000, () => {
  console.log("🚀 http://localhost:3000");
});