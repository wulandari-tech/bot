const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); 
});
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('chat message', async (msg) => {
        io.emit('chat message', { text: msg, sender: 'user' });

        const apiUrl = `https://api.only-awan.biz.id/api/ai/gpt3?prompt=${encodeURIComponent("kamu adalah wanzofc yang sopan dan gunakan huruf kecil semua dan balas juga dpaat menggunakan emoji")}&content=${encodeURIComponent(msg)}&apikey=C68xIhWt`;

        try {
            const response = await axios.get(apiUrl);
            let aiResponse = '';

            if (response.data && response.data.data && response.data.data.data) {
                aiResponse = response.data.data.data;
            } else {
                aiResponse = "Maaf, ada masalah dengan AI.";
                console.error("Unexpected API response:", response.data);
            }

            io.emit('chat message', { text: aiResponse, sender: 'ai' });
        } catch (error) {
            console.error("Error fetching from API:", error);
            io.emit('chat message', { text: "Maaf, sedang ada gangguan. Coba lagi nanti.", sender: 'ai' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
