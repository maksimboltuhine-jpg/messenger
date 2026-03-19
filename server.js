const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
// Получаем сообщение и пересылаем всем
socket.on('chat_message', (data) => {
io.emit('chat_message', data);
});
});

// Облако само выдаст порт, иначе берем 3000
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
console.log(`Сервер запущен на порту ${PORT}`);
});