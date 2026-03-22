const express = require('express');
const axios = require('axios');
const Archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

const ACCESS_KEY = "mandem"; // Your C# key

// Mimic a real browser to avoid Roblox 403 blocks
const http = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.roblox.com',
        'Referer': 'https://www.roblox.com/'
    }
});

app.get('/client/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    const clientKey = req.headers['x-api-key'];

    console.log(`Request for User: ${userId} | Key: ${clientKey}`);

    if (clientKey !== ACCESS_KEY) {
        console.log("Invalid API Key provided.");
        return res.status(403).send("Unauthorized");
    }

    try {
        // 1. Get the 3D Avatar Config
        // We use the thumbnail API first to get the URL of the actual json config
        const thumbUrl = `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`;
        const thumbRes = await http.get(thumbUrl);
        
        if (!thumbRes.data || !thumbRes.data.imageUrl) {
            return res.status(404).send("Roblox could not generate 3D data for this user.");
        }

        // 2. Download the actual scene config (contains hashes for obj, mtl, textures)
        const sceneRes = await http.get(thumbRes.data.imageUrl);
        const scene = sceneRes.data;

        const archive = Archiver('zip');
        res.attachment(`avatar_${userId}.zip`);
        archive.pipe(res);

        const cdn = "https://t6.rbxcdn.com/";

        // Helper to download from Roblox CDN
        const downloadAsset = (hash) => http.get(`${cdn}${hash}`, { responseType: 'arraybuffer' });

        // 3. Download and Fix MTL
        const mtlReq = await downloadAsset(scene.mtl);
        let mtlText = mtlReq.data.toString();
        
        scene.textures.forEach((hash, i) => {
            mtlText = mtlText.split(hash).join(`tex${i}.png`);
        });
        archive.append(mtlText, { name: 'model.mtl' });

        // 4. Download OBJ
        const objReq = await downloadAsset(scene.obj);
        archive.append(objReq.data, { name: 'model.obj' });

        // 5. Download Textures
        for (let i = 0; i < scene.textures.length; i++) {
            const texReq = await downloadAsset(scene.textures[i]);
            archive.append(texReq.data, { name: `tex${i}.png` });
        }

        console.log(`Finalizing ZIP for ${userId}...`);
        await archive.finalize();

    } catch (error) {
        console.error("Roblox API Error Detail:", error.response ? error.response.status : error.message);
        res.status(500).send("Roblox blocked the request (403). Try redeploying your server to get a new IP.");
    }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server live on port ${PORT}`));
