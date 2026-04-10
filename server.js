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
const io = new Server(server, { cors: { origin: "*" } });

const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

app.use(compression());
app.use(express.json());
app.use(express.static(__dirname)); 

const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Maksim12345@cluster0.peuxhxx.mongodb.net/chatDB?retryWrites=true&w=majority';
let gfsBucket;

mongoose.connect(MONGO_URI).then(() => {
  gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  console.log("DB OK");
}).catch(err => console.log(err));

const User = mongoose.model('User', { login: {type:String, unique:true}, password: String, uid: String });
const Msg = mongoose.model('Msg', { user: String, uid: String, text: String, room: String, fileUrl: String, fileName: String, createdAt: { type: Date, default: Date.now } });

app.post('/auth', async (req, res) => {
  const { login, password } = req.body;
  try {
    let user = await User.findOne({ login });
    if (!user) {
      const hash = await bcrypt.hash(password, 10);
      const uid = 'u' + Math.random().toString(36).substr(2, 5);
      user = await User.create({ login, password: hash, uid });
      return res.json({ login, uid });
    }
    if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error: 'Wrong pass' });
    res.json({ login: user.login, uid: user.uid });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

const upload = multer({ dest: '/tmp/' }); // Для GitHub/Render лучше юзать /tmp/
app.post('/upload', upload.single('file'), (req, res) => {
  if (!gfsBucket || !req.file) return res.status(500).send('Error');
  const writeStream = gfsBucket.openUploadStream(req.file.originalname);
  fs.createReadStream(req.file.path).pipe(writeStream).on('finish', () => {
    fs.promises.unlink(req.file.path).catch(()=>{});
    res.json({ fileUrl: `/file/${writeStream.id}`, fileName: req.file.originalname });
  });
});

app.get('/file/:id', (req, res) => {
  gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(req.params.id)).pipe(res);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
  socket.on('join', async (room) => {
    socket.join(room);
    const history = await Msg.find({ room }).sort({ createdAt: 1 }).limit(50);
    socket.emit('history', history);
  });
  socket.on('message', async (data) => {
    await new Msg(data).save();
    io.to(data.room).emit('message', data);
  });
});

server.listen(process.env.PORT || 10000, '0.0.0.0');