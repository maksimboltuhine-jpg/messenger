const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

// ВАЖНО: Я добавил +srv обратно, но убрал все лишние параметры в конце.
// Пароль: Messenger12345
const MONGO_URI = 'mongodb+srv://maksimboltuhine_db_user:Messenger12345@cluster0.p8qzvcu.mongodb.net/messenger?retryWrites=true&w=majority';

const connectWithRetry = () => {
console.log('--- ПОПЫТКА ПОДКЛЮЧЕНИЯ К БАЗЕ... ---');
mongoose.connect(MONGO_URI)
.then(() => console.log("--- ПОБЕДА: БАЗА ДАННЫХ НА СВЯЗИ! ---"))
.catch((err) => {
console.log("--- ОШИБКА: БАЗА ВСЕ ЕЩЕ БЛОКИРУЕТ IP ---");
console.log("Пробую еще раз через 5 секунд...");
setTimeout(connectWithRetry, 5000); // Рекурсивный повтор
});
};

connectWithRetry();

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
} catch (e) {
socket.emit('login_error', 'База спит, подожди 10 сек...');
}
});

socket.on('join_room', async () => {
socket.join('Общий');
try {
const history = await Message.find({ room: 'Общий' }).sort({ time: 1 }).limit(50);
socket.emit('history', history);
} catch (e) { console.log("Ошибка истории"); }
});

socket.on('chat_message', async (text) => {
if (!currentUser) return;
try {
const msg = new Message({ room: 'Общий', user: currentUser, text: text });
await msg.save();
io.to('Общий').emit('chat_message', msg);
} catch (e) { console.log("Ошибка сохранения"); }
});
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));