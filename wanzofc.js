const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Opsional: untuk file statis

// Fungsi untuk menambahkan delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Fungsi Scraping (Diperbaiki dan Ditingkatkan) ---
async function scrapeInflactProfile(usernameOrUrl) {
    try {
        let url;
        let username;

        // 1. Penanganan URL (Sama seperti sebelumnya, tapi lebih jelas)
        if (usernameOrUrl.startsWith("https://www.instagram.com/")) {
            username = usernameOrUrl.split("/").filter(part => part !== "").pop();
            url = `https://inflact.com/instagram-viewer/profile/${username}/`;
        } else if (!usernameOrUrl.includes("/")) {
            url = `https://inflact.com/instagram-viewer/profile/${usernameOrUrl}/`;
            username = usernameOrUrl;
        } else {
            const parts = usernameOrUrl.split("/");
            const profileIndex = parts.indexOf("profile");
            if (profileIndex !== -1 && parts.length > profileIndex + 1) {
                username = parts[profileIndex + 1];
                url = `https://inflact.com/instagram-viewer/profile/${username}/`;
            } else {
                throw new Error("Invalid Inflact URL");
            }
        }
        if (!url.endsWith('/')) {
            url += '/';
        }

        console.log("Scraping URL:", url); // Debug: Cek URL

        // 2. Header (User-Agent - Bisa diubah jika perlu)
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36' // Ganti jika perlu
        };

        // 3. Permintaan HTTP (dengan delay)
        const response = await fetch(url, { headers });
        await delay(1500); // Tambahkan delay 1.5 detik (sesuaikan)

        // 4. Penanganan Status HTTP
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`User not found (HTTP ${response.status})`);
            } else {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
        }

        // 5. Parsing HTML dengan Cheerio
        const html = await response.text();
        const $ = cheerio.load(html);


        // --- CONTOH SELECTOR (HARUS DISESUAIKAN) ---
        // Gunakan Inspect Element di browser Anda untuk mendapatkan selector yang BENAR.
        // Ini HANYA CONTOH, dan mungkin tidak berfungsi langsung.

        const profileData = {};

        // Foto Profil:  Cari tag <img> dengan class atau ID yang unik.
        const profilePictureElement = $('img.user__img'); // CONTOH - GANTI
        if (profilePictureElement.length > 0) {
            profileData.profile_picture_url = profilePictureElement.attr('src');
            console.log("Profile Picture Found:", profileData.profile_picture_url); // Debug
        } else {
            console.log("Profile Picture NOT Found"); // Debug
            profileData.profile_picture_url = null; // Atau URL placeholder
        }


        // Username: Cari tag yang berisi username (misalnya, <h1>, <h2>, atau <div>).
        if (!username) {
            const usernameElement = $('h1.user__title'); // CONTOH - GANTI
            if (usernameElement.length > 0) {
                username = usernameElement.text().trim().replace('@', '');
                profileData.username = username;
                console.log("Username Found:", profileData.username);
            } else {
                 console.log("Username NOT Found"); // Debug
                profileData.username = null;
            }
        } else {
             profileData.username = username;
        }


        // Stats (Postingan, Followers, Following): Cari elemen yang membungkus stats, lalu ambil teksnya.
        const statsElements = $('span.profile-data-stat-count-number'); //CONTOH GANTI
        if (statsElements.length >= 3) {
            profileData.posts = statsElements.eq(0).text().trim();
            profileData.followers = statsElements.eq(1).text().trim();
            profileData.following = statsElements.eq(2).text().trim();
            console.log("Stats Found:", profileData.posts, profileData.followers, profileData.following); // Debug
        } else {
            console.log("Stats NOT Found"); // Debug
        }

        // Bio: Cari elemen yang berisi bio (misalnya, <div>).
        const bioElement = $('div.user__info-desc'); // CONTOH - GANTI
        if (bioElement.length > 0) {
            profileData.bio = bioElement.text().trim();
            console.log("Bio Found:", profileData.bio); // Debug
        } else {
             console.log("Bio NOT Found"); // Debug
            profileData.bio = null;
        }

        return profileData;

    } catch (error) {
        console.error("Scraping Error:", error); // Log error ke konsol
        throw error; // Re-throw agar bisa ditangani di route handler Express
    }
}


// --- Route Handlers (Express) ---

app.get('/', (req, res) => {
    // Halaman utama dengan form
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Instagram Scraper</title>
            <style>
                body { font-family: sans-serif; }
                label { display: block; margin-bottom: 5px; }
                input[type="text"] { width: 300px; padding: 8px; margin-bottom: 10px; }
                button { padding: 10px 15px; background-color: #4CAF50; color: white; border: none; cursor: pointer; }
                .error { color: red; }
            </style>
        </head>
        <body>
            <h1>Instagram Profile Scraper</h1>
            <form method="POST" action="/scrape">
                <label for="username">Username or Instagram URL:</label>
                <input type="text" id="username" name="usernameOrUrl" required>
                <button type="submit">Scrape</button>
            </form>
        </body>
        </html>
    `);
});

app.post('/scrape', async (req, res) => {
    try {
        const { usernameOrUrl } = req.body;
        const profileData = await scrapeInflactProfile(usernameOrUrl);

        // Halaman hasil scraping (dengan struktur yang lebih baik)
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Scraped Profile: ${profileData.username || 'N/A'}</title>
                <style>
                    body { font-family: sans-serif; }
                    img { max-width: 200px; height: auto; margin-bottom: 10px; }
                    .profile-data { margin-bottom: 20px; }
                    .profile-data p { margin: 5px 0; }
                    .go-back{text-decoration: none; padding: 5px; background-color: royalblue; color:white;}
                </style>
            </head>
            <body>
                <h1>Profile: ${profileData.username || 'N/A'}</h1>
                <div class="profile-data">
                    <img src="${profileData.profile_picture_url || 'https://via.placeholder.com/150'}" alt="Profile Picture">
                    <p><strong>Posts:</strong> ${profileData.posts || 'N/A'}</p>
                    <p><strong>Followers:</strong> ${profileData.followers || 'N/A'}</p>
                    <p><strong>Following:</strong> ${profileData.following || 'N/A'}</p>
                    <p><strong>Bio:</strong> ${profileData.bio || 'N/A'}</p>
                </div>
                <a class="go-back" href="/">Go Back</a>
            </body>
            </html>
        `);

    } catch (error) {
        // Halaman error (dengan penanganan yang lebih baik)
        if (error.message.startsWith("User not found")) {
            res.status(404).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Error</title>
                     <style>
                        body { font-family: sans-serif; }
                        .error { color: red; }
                        .go-back{text-decoration: none; padding: 5px; background-color: royalblue; color:white;}
                    </style>
                </head>
                <body>
                    <h1 class="error">User Not Found</h1>
                    <p>The Instagram user you entered was not found.</p>
                    <a class="go-back" href="/">Go Back</a>
                </body>
                </html>
            `);
        } else {
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Error</title>
                     <style>
                        body { font-family: sans-serif; }
                        .error { color: red; }
                        .go-back{text-decoration: none; padding: 5px; background-color: royalblue; color:white;}
                    </style>
                </head>
                <body>
                    <h1 class="error">Internal Server Error</h1>
                    <p>An error occurred while scraping the profile: ${error.message}</p>
                     <a class="go-back" href="/">Go Back</a>
                </body>
                </html>
            `);
        }
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
