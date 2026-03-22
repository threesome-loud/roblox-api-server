const express = require('express');
const axios = require('axios');
const Archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

const ACCESS_KEY = "mandem"; 
const PROXY_API_KEY = "9ba79628-4f3a-42fa-a584-dd98798d9fe4"; // Put your WebScraping.ai key here

app.get('/client/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    const clientKey = req.headers['x-api-key'];

    console.log(`Request for User: ${userId}`);

    if (clientKey !== ACCESS_KEY) {
        return res.status(403).send("Unauthorized");
    }

    try {
        // 1. Get the 3D Config via Residential Proxy (Bypasses Roblox 403)
        const robloxUrl = `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`;
        const proxyUrl = `https://api.webscraping.ai/html?api_key=${PROXY_API_KEY}&url=${encodeURIComponent(robloxUrl)}&proxy=residential`;
        
        console.log("Fetching Roblox config via proxy...");
        const thumbRes = await axios.get(proxyUrl);
        
        // WebScraping.ai returns the HTML/JSON string; we parse it if it's a string
        const data = typeof thumbRes.data === 'string' ? JSON.parse(thumbRes.data) : thumbRes.data;
        const configUrl = data.imageUrl;

        if (!configUrl) return res.status(404).send("Avatar data not found.");

        // 2. Fetch the Scene JSON (Usually doesn't need proxy, but we use it to be safe)
        const sceneRes = await axios.get(`https://api.webscraping.ai/html?api_key=${PROXY_API_KEY}&url=${encodeURIComponent(configUrl)}`);
        const scene = typeof sceneRes.data === 'string' ? JSON.parse(sceneRes.data) : sceneRes.data;

        // 3. Prepare ZIP
        const archive = Archiver('zip');
        res.attachment(`avatar_${userId}.zip`);
        archive.pipe(res);

        const cdn = "https://t6.rbxcdn.com/";

        // 4. Download Assets (CDN usually doesn't block data centers, saving proxy credits)
        const [mtlReq, objReq] = await Promise.all([
            axios.get(`${cdn}${scene.mtl}`, { responseType: 'arraybuffer' }),
            axios.get(`${cdn}${scene.obj}`, { responseType: 'arraybuffer' })
        ]);

        let mtlText = mtlReq.data.toString();
        scene.textures.forEach((hash, i) => {
            mtlText = mtlText.split(hash).join(`tex${i}.png`);
        });

        archive.append(mtlText, { name: 'model.mtl' });
        archive.append(objReq.data, { name: 'model.obj' });

        for (let i = 0; i < scene.textures.length; i++) {
            const tex = await axios.get(`${cdn}${scene.textures[i]}`, { responseType: 'arraybuffer' });
            archive.append(tex.data, { name: `tex${i}.png` });
        }

        await archive.finalize();
        console.log("Success!");

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).send("Proxy/Roblox Error: " + error.message);
    }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server live on port ${PORT}`));
