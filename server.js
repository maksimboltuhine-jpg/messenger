const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// ВАЖНО: Твоя ссылка для подключения
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:4zb3uMS8TTKaMnQZ@cluster0.p0qzvcu.mongodb.net/messenger?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
.then(() => console.log("--- БАЗА ПОДКЛЮЧЕНА ---"))
.catch((err) => console.log("--- ОШИБКА БАЗЫ: " + err.message));

const User = mongoose.model('User', new mongoose.Schema({ username: String, pass: String }));
const Message = mongoose.model('Message', new mongoose.Schema({ room: String, user: String, text: String, time: { type: Date, default: Date.now } }));

app.use(express.static(__dirname));

io.on('connection', (socket) => {
let currentUser = null;
socket.on('login', async (data) => {
try {
let user = await User.findOne({ username: data.username });
if (!user) {
user = new User({ username: data.username, pass: data.pass });
await user.save();
} else if (user.pass !== data.pass) {
return socket.emit('login_error', 'Неверный пароль');
}
currentUser = user.username;
socket.emit('login_success', user.username);
} catch (e) { socket.emit('login_error', 'Ошибка базы'); }
});

socket.on('join_room', async (room) => {
socket.join(room || 'Общий');
try {
const history = await Message.find({ room: room || 'Общий' }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
} catch (e) {}
});

socket.on('chat_message', async (data) => {
if (!currentUser) return;
try {
const msg = new Message({ room: data.room || 'Общий', user: currentUser, text: data.text });
await msg.save();
io.to(data.room || 'Общий').emit('chat_message', msg);
} catch (e) {}
});
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log("--- СЕРВЕР ЗАПУЩЕН НА ПОРТУ " + PORT + " ---"));