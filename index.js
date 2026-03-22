const express = require('express');
const axios = require('axios');
const Archiver = require('archiver');
const app = express();

const ACCESS_KEY = "mandem"; 
const PROXY_API_KEY = "9ba79628-4f3a-42fa-a584-dd98798d9fe4"; // Double check this!

app.get('/client/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    if (req.headers['x-api-key'] !== ACCESS_KEY) return res.status(403).send("Unauthorized");

    try {
        // 1. Fetch via Proxy with RESIDENTIAL IP and HEADERS enabled
        // We add &proxy=residential and &headers=true
        const robloxUrl = encodeURIComponent(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
        const proxyUrl = `https://api.webscraping.ai/html?api_key=${PROXY_API_KEY}&url=${robloxUrl}&proxy=residential&headers=true`;
        
        console.log(`Bypassing Roblox for user ${userId}...`);
        
        const thumbRes = await axios.get(proxyUrl, { timeout: 30000 });
        
        let data = thumbRes.data;
        if (typeof data === 'string') data = JSON.parse(data);
        
        if (!data.imageUrl) throw new Error("Roblox denied request (403 still active or invalid ID)");

        // 2. Fetch Scene Config (CDN is usually safe, no proxy needed)
        const sceneRes = await axios.get(data.imageUrl);
        const scene = sceneRes.data;
        const cdn = "https://t6.rbxcdn.com/";

        // 3. Create ZIP
        const archive = Archiver('zip');
        res.attachment(`avatar_${userId}.zip`);
        archive.pipe(res);

        const download = async (url) => {
            const r = await axios.get(url, { responseType: 'arraybuffer' });
            return r.data;
        };

        // Add MTL with texture path mapping
        let mtlText = (await download(`${cdn}${scene.mtl}`)).toString();
        scene.textures.forEach((hash, i) => {
            mtlText = mtlText.split(hash).join(`tex${i}.png`);
        });
        archive.append(mtlText, { name: 'model.mtl' });

        // Add OBJ
        archive.append(await download(`${cdn}${scene.obj}`), { name: 'model.obj' });

        // Add Textures
        for (let i = 0; i < scene.textures.length; i++) {
            archive.append(await download(`${cdn}${scene.textures[i]}`), { name: `tex${i}.png` });
        }

        await archive.finalize();
        console.log("Download complete!");

    } catch (err) {
        console.error("CRITICAL ERROR:", err.message);
        if (!res.headersSent) res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
