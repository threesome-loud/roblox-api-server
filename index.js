const express = require('express');
const axios = require('axios');
const Archiver = require('archiver');
const app = express();

const ACCESS_KEY = "mandem"; 
const PROXY_API_KEY = "9ba79628-4f3a-42fa-a584-dd98798d9fe4"; // PUT KEY HERE

app.get('/client/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    if (req.headers['x-api-key'] !== ACCESS_KEY) return res.status(403).send("Unauthorized");

    // Create zip immediately to keep the connection "warm"
    const archive = Archiver('zip');
    res.attachment(`avatar_${userId}.zip`);
    archive.pipe(res);

    try {
        // 1. Roblox API via Residential Proxy
        const robloxUrl = encodeURIComponent(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
        const proxyUrl = `https://api.webscraping.ai/html?api_key=${PROXY_API_KEY}&url=${robloxUrl}&proxy=residential`;
        
        const thumbRes = await axios.get(proxyUrl, { timeout: 60000 }); // 60s timeout
        let data = thumbRes.data;
        if (typeof data === 'string') data = JSON.parse(data);
        
        if (!data.imageUrl) throw new Error("Invalid Roblox Response");

        // 2. Scene Config
        const sceneRes = await axios.get(data.imageUrl, { timeout: 30000 });
        const scene = sceneRes.data;
        const cdn = "https://t6.rbxcdn.com/";

        // 3. Downloads
        const getBuf = async (url) => (await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 })).data;

        // MTL
        let mtlText = (await getBuf(`${cdn}${scene.mtl}`)).toString();
        scene.textures.forEach((hash, i) => {
            mtlText = mtlText.split(hash).join(`tex${i}.png`);
        });
        archive.append(mtlText, { name: 'model.mtl' });

        // OBJ
        archive.append(await getBuf(`${cdn}${scene.obj}`), { name: 'model.obj' });

        // Textures
        for (let i = 0; i < scene.textures.length; i++) {
            archive.append(await getBuf(`${cdn}${scene.textures[i]}`), { name: `tex${i}.png` });
        }

        await archive.finalize();
    } catch (err) {
        console.error("FATAL:", err.message);
        // If we can't get the files, we abort the zip
        archive.abort(err.message);
    }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
