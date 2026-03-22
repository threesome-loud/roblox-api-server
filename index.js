const express = require('express');
const axios = require('axios');
const Archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: This must match your C# code exactly
const ACCESS_KEY = "mandem";

async function fetchAsset(hash) {
    const response = await axios.get(`https://t6.rbxcdn.com/${hash}`, { responseType: 'arraybuffer' });
    return response.data;
}

// This route matches: /client/avatar/USERID
app.get('/client/avatar/:userId', async (req, res) => {
    const { userId } = req.params;
    const clientKey = req.headers['x-api-key'];

    console.log(`Request for User: ${userId} | Key: ${clientKey}`);

    if (clientKey !== ACCESS_KEY) {
        return res.status(403).send("Unauthorized");
    }

    try {
        const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
        const configUrl = thumbRes.data.imageUrl;
        if (!configUrl) return res.status(404).send("Avatar not found.");

        const sceneRes = await axios.get(configUrl);
        const scene = sceneRes.data;

        const archive = Archiver('zip');
        res.attachment(`avatar_${userId}.zip`);
        archive.pipe(res);

        // Fix MTL
        let mtlText = (await fetchAsset(scene.mtl)).toString();
        scene.textures.forEach((hash, i) => {
            mtlText = mtlText.split(hash).join(`tex${i}.png`);
        });

        archive.append(mtlText, { name: 'model.mtl' });
        archive.append(await fetchAsset(scene.obj), { name: 'model.obj' });

        for (let i = 0; i < scene.textures.length; i++) {
            const texData = await fetchAsset(scene.textures[i]);
            archive.append(texData, { name: `tex${i}.png` });
        }

        archive.finalize();
        console.log(`Success: Sent avatar for ${userId}`);
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).send("Roblox API Error");
    }
});

app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
