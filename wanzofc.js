const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Optional: for static files

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeInflactProfile(usernameOrUrl) {
    try {
        let url;
        let username;

        // URL Handling (same as before, but with extra logging)
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
        console.log("Scraping URL:", url); // Log the URL

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36' // Try different User-Agents if needed
        };

        const response = await fetch(url, { headers });
        await delay(1500); // Add delay

        console.log("Response Status:", response.status); // Log the HTTP status code

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`User not found (HTTP ${response.status})`);
            } else {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
        }

        const html = await response.text();
        // console.log("Full HTML:", html); // Uncomment to see the full HTML (can be large)

        const $ = cheerio.load(html);


        // --- SELECTOR SECTION (CRITICAL - MUST BE CORRECT) ---

        const profileData = {};

        // 1. Profile Picture
        const profilePictureElement = $('img.user__img'); // EXAMPLE - REPLACE WITH CORRECT SELECTOR
        console.log("Profile Picture Element Length:", profilePictureElement.length); // Check if element is found
        if (profilePictureElement.length > 0) {
            profileData.profile_picture_url = profilePictureElement.attr('src');
            console.log("Profile Picture URL:", profileData.profile_picture_url);
        } else {
            profileData.profile_picture_url = 'https://via.placeholder.com/150'; // Placeholder
        }


        // 2. Username
        if(!username){
           const usernameElement = $('h1.user__title'); // EXAMPLE - REPLACE
            console.log("Username Element Length:", usernameElement.length);
            if (usernameElement.length > 0) {
                username = usernameElement.text().trim().replace('@', '');
                profileData.username = username;
                console.log("Username:", profileData.username);
             } else {
                profileData.username = 'N/A';
            }
        } else {
            profileData.username = username;
        }

        // 3. Stats (Posts, Followers, Following)
        const statsElements = $('span.profile-data-stat-count-number'); // EXAMPLE - REPLACE
        console.log("Stats Elements Length:", statsElements.length);
        if (statsElements.length >= 3) {
            profileData.posts = statsElements.eq(0).text().trim();
            profileData.followers = statsElements.eq(1).text().trim();
            profileData.following = statsElements.eq(2).text().trim();
        } else {
            profileData.posts = 'N/A';
            profileData.followers = 'N/A';
            profileData.following = 'N/A';
        }

        // 4. Bio
        const bioElement = $('div.user__info-desc'); // EXAMPLE - REPLACE
        console.log("Bio Element Length:", bioElement.length);
        if (bioElement.length > 0) {
            profileData.bio = bioElement.text().trim();
        } else {
            profileData.bio = 'N/A';
        }

        return profileData;

    } catch (error) {
        console.error("Scraping Error:", error);
        throw error; // Re-throw the error
    }
}

// --- Express Routes ---

app.get('/', (req, res) => {
    // Home page with form (same as before, but included for completeness)
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Instagram Scraper</title>
            <style>/* Basic styling */</style>
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

        // Result page (HTML directly in the backend)
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Scraped Profile: ${profileData.username || 'N/A'}</title>
                <style>/* Basic styling */</style>
            </head>
            <body>
                <h1>Profile: ${profileData.username || 'N/A'}</h1>
                <img src="${profileData.profile_picture_url}" alt="Profile Picture">
                <p>Posts: ${profileData.posts}</p>
                <p>Followers: ${profileData.followers}</p>
                <p>Following: ${profileData.following}</p>
                <p>Bio: ${profileData.bio}</p>
                <a href="/">Go Back</a>
            </body>
            </html>
        `);

    } catch (error) {
        // Error page (HTML directly in the backend)
        let errorMessage = "An unexpected error occurred.";
        let statusCode = 500;

        if (error.message.startsWith("User not found")) {
            errorMessage = "The Instagram user you entered was not found.";
            statusCode = 404;
        }

        res.status(statusCode).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <style>/* Basic styling */</style>
            </head>
            <body>
                <h1>${statusCode === 404 ? 'User Not Found' : 'Error'}</h1>
                <p>${errorMessage}</p>
                <a href="/">Go Back</a>
            </body>
            </html>
        `);
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
