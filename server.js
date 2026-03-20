const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// ДЛИННАЯ ССЫЛКА (Fix для ошибки ENOTFOUND)
// Вставлен твой пароль: KdTKqIVfR1zhkVqD
const MONGO_URI = 'mongodb://maksimboltuhine_db_user:KdTKqIVfR1zhkVqD@cluster0-shard-00-00.p8qzvcu.mongodb.net:27017,cluster0-shard-00-01.p8qzvcu.mongodb.net:27017,cluster0-shard-00-02.p8qzvcu.mongodb.net:27017/messenger?ssl=true&replicaSet=atlas-p8qzvcu-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
.then(() => console.log("--- ПОБЕДА: БАЗА ПОДКЛЮЧЕНА ЧЕРЕЗ DIRECT LINK ---"))
.catch((err) => {
console.log("--- КРИТИЧЕСКАЯ ОШИБКА БАЗЫ ---");
console.log(err.message);
});

const User = mongoose.model('User', new mongoose.Schema({ username: String, pass: String }));
const Message = mongoose.model('Message', new mongoose.Schema({ room: String, user: String, text: String, time: { type: Date, default: Date.now } }));

app.use(express.static(__dirname));

io.on('connection', (socket) => {
let currentUser = null;
let currentRoom = 'Общий';

socket.on('login', async (data) => {
try {
if (!data.username || !data.pass) return socket.emit('login_error', 'Заполни все поля');
let user = await User.findOne({ username: data.username });
if (!user) {
user = new User({ username: data.username, pass: data.pass });
await user.save();
} else if (user.pass !== data.pass) {
return socket.emit('login_error', 'Неверный пароль');
}
currentUser = user.username;
socket.emit('login_success', user.username);
} catch (e) {
socket.emit('login_error', 'Ошибка базы данных');
}
});

socket.on('join_room', async (roomName) => {
if (currentRoom) socket.leave(currentRoom);
currentRoom = roomName || 'Общий';
socket.join(currentRoom);
try {
const history = await Message.find({ room: currentRoom }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
} catch (e) { console.log("Ошибка истории"); }
});

socket.on('chat_message', async (text) => {
if (!currentUser) return;
try {
const msg = new Message({ room: currentRoom, user: currentUser, text: text });
await msg.save();
io.to(currentRoom).emit('chat_message', msg);
} catch (e) { console.log("Ошибка сохранения"); }
});
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log("Сервер запущен на порту: " + PORT));