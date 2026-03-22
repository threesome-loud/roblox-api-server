const express = require('express');
const axios = require('axios');
const Archiver = require('archiver');
const app = express();

const ACCESS_KEY = "mandem"; 
const PROXY_API_KEY = "9ba79628-4f3a-42fa-a584-dd98798d9fe4"; 

app.get('/client/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    if (req.headers['x-api-key'] !== ACCESS_KEY) return res.status(403).send("Unauthorized");

    try {
        // 1. Get Roblox Config (Residential Proxy)
        const robloxUrl = encodeURIComponent(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
        const proxyUrl = `https://api.webscraping.ai/html?api_key=${PROXY_API_KEY}&url=${robloxUrl}&proxy=residential`;
        
        const thumbRes = await axios.get(proxyUrl, { timeout: 40000 });
        let data = thumbRes.data;
        if (typeof data === 'string') data = JSON.parse(data);
        if (!data.imageUrl) throw new Error("Roblox Blocked Request");

        // 2. Get Scene
        const sceneRes = await axios.get(data.imageUrl);
        const scene = sceneRes.data;
        const cdn = "https://t6.rbxcdn.com/";

        // 3. Setup Archiver to Buffer
        const archive = Archiver('zip');
        const chunks = [];
        archive.on('data', (chunk) => chunks.push(chunk));

        // Helper to download
        const getBuf = async (url) => (await axios.get(url, { responseType: 'arraybuffer' })).data;

        // Add Files
        let mtlText = (await getBuf(`${cdn}${scene.mtl}`)).toString();
        scene.textures.forEach((hash, i) => {
            mtlText = mtlText.split(hash).join(`tex${i}.png`);
        });
        archive.append(mtlText, { name: 'model.mtl' });
        archive.append(await getBuf(`${cdn}${scene.obj}`), { name: 'model.obj' });

        for (let i = 0; i < scene.textures.length; i++) {
            archive.append(await getBuf(`${cdn}${scene.textures[i]}`), { name: `tex${i}.png` });
        }

        // 4. Finalize and THEN send
        archive.on('end', () => {
            const finalBuffer = Buffer.concat(chunks);
            res.set('Content-Type', 'application/zip');
            res.set('Content-Disposition', `attachment; filename=avatar.zip`);
            res.send(finalBuffer);
            console.log(`Sent ZIP for ${userId} (${finalBuffer.length} bytes)`);
        });

        await archive.finalize();

    } catch (err) {
        console.error("Error:", err.message);
        if (!res.headersSent) res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 3000, "0.0.0.0");
