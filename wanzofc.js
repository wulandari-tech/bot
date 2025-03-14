const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files from the current directory

app.post('/api/chatbot', async (req, res) => {
    const userMessage = req.body.message;
    const apiKey = 'C68xIhWt'; // Ganti dengan API key Anda jika berbeda
    const apiUrl = `https://api.only-awan.biz.id/api/ai/gpt3?prompt=${encodeURIComponent('kamu adalah wanzofc yang sangat toxic dan kasar dan sopan santun dan gunakan emoji juga dan menggunakan huruf kecil juga')}&content=${encodeURIComponent(userMessage)}&apikey=${apiKey}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.result && data.data.status) {
            const botResponse = data.data.data;
            res.json({ response: botResponse });
        } else {
            res.status(500).json({ error: 'Terjadi kesalahan saat memproses permintaan.' });
        }
    } catch (error) {
        console.error('Error fetching bot response:', error);
        res.status(500).json({ error: 'Gagal terhubung ke server AI.' });
    }
});

// Serve the index.html file for the root route ("/")
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// For any other routes, return a 404 error (or handle them specifically if needed)
app.use((req, res, next) => {
  res.status(404).send("Sorry, that route doesn't exist!");
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});
