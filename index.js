const express = require('express');
const axios = require('axios');
const Archiver = require('archiver');
const app = express();

const ACCESS_KEY = "mandem"; 
const PROXY_API_KEY = "9ba79628-4f3a-42fa-a584-dd98798d9fe4"; // Ensure this is correct!

app.get('/client/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    if (req.headers['x-api-key'] !== ACCESS_KEY) return res.status(403).send("Unauthorized");

    try {
        // 1. Fetch from Proxy
        const robloxUrl = encodeURIComponent(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
        const proxyUrl = `https://api.webscraping.ai/html?api_key=${PROXY_API_KEY}&url=${robloxUrl}&proxy=residential`;
        
        const thumbRes = await axios.get(proxyUrl);
        
        // Ensure data is an object
        let data = thumbRes.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) { throw new Error("Roblox returned invalid JSON via proxy"); }
        }
        
        if (!data || !data.imageUrl) throw new Error("No imageUrl found in Roblox response");

        // 2. Fetch Scene Config
        const sceneRes = await axios.get(data.imageUrl);
        const scene = sceneRes.data;
        const cdn = "https://t6.rbxcdn.com/";

        // 3. Create ZIP
        const archive = Archiver('zip', { zlib: { level: 5 } });
        res.attachment(`avatar_${userId}.zip`);
        archive.pipe(res);

        // Helper to download to buffer
        const download = async (url) => {
            const r = await axios.get(url, { responseType: 'arraybuffer' });
            return r.data;
        };

        // Add MTL
        let mtlBuffer = await download(`${cdn}${scene.mtl}`);
        let mtlText = mtlBuffer.toString();
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

    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        // This sends the actual error message back to your C# app so you can see it
        if (!res.headersSent) {
            res.status(500).send(err.message);
        }
    }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
