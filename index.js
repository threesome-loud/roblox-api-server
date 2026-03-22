const express = require('express');
const axios = require('axios');
const Archiver = require('archiver');
const app = express();

const ACCESS_KEY = "mandem"; 
const PROXY_API_KEY = "9ba79628-4f3a-42fa-a584-dd98798d9fe4"; // REPLACE THIS

app.get('/client/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    if (req.headers['x-api-key'] !== ACCESS_KEY) return res.status(403).send("Unauthorized");

    try {
        // 1. Get Roblox Config via Proxy
        const robloxUrl = encodeURIComponent(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
        const proxyUrl = `https://api.webscraping.ai/html?api_key=${PROXY_API_KEY}&url=${robloxUrl}&proxy=residential`;
        
        const thumbRes = await axios.get(proxyUrl);
        const data = typeof thumbRes.data === 'string' ? JSON.parse(thumbRes.data) : thumbRes.data;
        
        if (!data.imageUrl) return res.status(404).send("Avatar not ready");

        // 2. Get Scene JSON
        const sceneRes = await axios.get(data.imageUrl);
        const scene = sceneRes.data;
        const cdn = "https://t6.rbxcdn.com/";

        // 3. Create ZIP
        const archive = Archiver('zip');
        res.attachment(`avatar_${userId}.zip`);
        archive.pipe(res);

        // Download MTL
        const mtlReq = await axios.get(`${cdn}${scene.mtl}`, { responseType: 'arraybuffer' });
        let mtlText = mtlReq.data.toString();
        scene.textures.forEach((hash, i) => { mtlText = mtlText.split(hash).join(`tex${i}.png`); });
        archive.append(mtlText, { name: 'model.mtl' });

        // Download OBJ
        const objReq = await axios.get(`${cdn}${scene.obj}`, { responseType: 'arraybuffer' });
        archive.append(objReq.data, { name: 'model.obj' });

        // Download Textures
        for (let i = 0; i < scene.textures.length; i++) {
            const texReq = await axios.get(`${cdn}${scene.textures[i]}`, { responseType: 'arraybuffer' });
            archive.append(texReq.data, { name: `tex${i}.png` });
        }

        await archive.finalize();
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
