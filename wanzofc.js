const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true })); // Untuk memproses form data
app.use(express.static('public')); // Untuk file statis (CSS, JS, images, dll.) - opsional

// --- Fungsi Scraping (Sama seperti sebelumnya, tapi diperbaiki) ---

async function scrapeInflactProfile(usernameOrUrl) {
    try {
        let url;
        let username;

        if (usernameOrUrl.startsWith("https://www.instagram.com/")) {
            username = usernameOrUrl.split("/").filter(part => part !== "").pop(); // Lebih aman
             url = `https://inflact.com/instagram-viewer/profile/${username}/`;
        } else if (!usernameOrUrl.includes("/")) {
            url = `https://inflact.com/instagram-viewer/profile/${usernameOrUrl}/`;
            username = usernameOrUrl;
        } else {
            //Asumsi input URL inflact
            const parts = usernameOrUrl.split("/");
            const profileIndex = parts.indexOf("profile");
             if (profileIndex !== -1 && parts.length > profileIndex + 1) {
                username = parts[profileIndex + 1];
                 url = `https://inflact.com/instagram-viewer/profile/${username}/`;
            } else {
                throw new Error("Invalid Inflact URL");
            }
        }

        // Pastikan URL diakhiri dengan '/'
        if (!url.endsWith('/')) {
            url += '/';
        }


        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        const response = await fetch(url, { headers });
        if (!response.ok) {
          if(response.status === 404){
            throw new Error(`User not found`);
          } else {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        const profileData = {};

         // Mendapatkan foto profil
        const profilePictureElement = $('img.user__img'); //Ganti selector
        if (profilePictureElement.length) {
            profileData.profile_picture_url = profilePictureElement.attr('src');
        }


        //Mendapatkan username (jika belum dari input)
        if (!username) { //cek jika username belum didapat dari input
          const usernameElement = $('h1.user__title.title');  // Ganti selector CSS
           if (usernameElement.length) {
              username = usernameElement.text().trim().replace("@", "");
              profileData.username = username;
           }
        } else {
            profileData.username = username;
        }


        // Mendapatkan jumlah postingan, followers, following
        const statsElements = $('span.profile-data-stat-count-number'); // Ganti selector CSS
        if (statsElements.length >= 3) {
            profileData.posts = statsElements.eq(0).text().trim();
            profileData.followers = statsElements.eq(1).text().trim();
            profileData.following = statsElements.eq(2).text().trim();
        }

        //Mendapatkan Bio
        const bioElement = $('div.user__info-desc'); // Ganti selector
        if (bioElement.length) {
            profileData.bio = bioElement.text().trim();
        }
        return profileData;

    } catch (error) {
        console.error("Error:", error);
        throw error; // Re-throw agar bisa ditangani di route handler
    }
}

// --- Route Handlers (Express) ---

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Instagram Scraper</title>
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

        if (profileData) {
            // Tampilkan data di halaman HTML
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Scraped Profile: ${profileData.username}</title>
                </head>
                <body>
                    <h1>Profile: ${profileData.username}</h1>
                    <img src="${profileData.profile_picture_url}" alt="Profile Picture">
                    <p>Posts: ${profileData.posts}</p>
                    <p>Followers: ${profileData.followers}</p>
                    <p>Following: ${profileData.following}</p>
                    <p>Bio: ${profileData.bio}</p>

                    <a href="/">Back to Scraper</a>
                </body>
                </html>
            `);
        } else {
             res.status(404).send("User not found or error occurred."); //harusnya sudah ditangani
        }
    } catch (error) {
      if (error.message === "User not found") {
        res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>User Not Found</h1>
                <p>The Instagram user you entered was not found.</p>
                <a href="/">Go Back</a>
            </body>
            </html>
        `);
    } else {
        console.error(error);  // Log kesalahan ke konsol
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>Internal Server Error</h1>
                <p>An error occurred while scraping the profile.</p>
                <p>${error.message}</p>
                <a href="/">Go Back</a>
            </body>
            </html>
        `);
    }
    }
});



app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
