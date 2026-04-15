const puppeteer = require('puppeteer');
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const axios = require('axios'); 
const FormData = require('form-data'); 

console.log("\n" + "=".repeat(50));
console.log("   🚀 NODE.JS SUPER HYBRID CLOUD (HD THUMBNAIL + FB MONITOR)");
console.log("=".repeat(50));

// ==========================================
// ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// ==========================================
const START_TIME = Date.now();
const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000; 

const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
const REFERER = "https://bhalocast.com/";

const VIDEO_TITLE = (process.env.VIDEO_TITLE || "Live_Match")
    .replace(/[^\w\s-]/g, '') 
    .trim()
    .replace(/\s+/g, '_');

const PROXY_IP = process.env.PROXY_IP || '';
const PROXY_PORT = process.env.PROXY_PORT || '';
const PROXY_USER = process.env.PROXY_USER || '';
const PROXY_PASS = process.env.PROXY_PASS || '';

// GitHub API Token
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_PAT; 
const REPO_NAME = process.env.GITHUB_REPOSITORY;

// ==========================================
// 📘 FACEBOOK BOT SETTINGS
// ==========================================
const CUSTOM_TITLE = (process.env.CUSTOM_TITLE || '🔴 Live Match!').trim();
const BASE_COMMENT = "📺 Watch Full Match Without Buffering Here: https://bulbul4u-live.xyz";
const COMMENT_TEXT = `${CUSTOM_TITLE}\n\n${BASE_COMMENT}`;
const COMMENT_IMG_PATH = "comment_image.jpeg";

const TARGET_PAGE = process.env.TARGET_PAGE || 'Primary Page';
const CUSTOM_TOKEN = (process.env.CUSTOM_TOKEN || '').trim();

const AVAILABLE_TOKENS = {
    'Primary Page': (process.env.PRIMARY_TOKEN || '').trim(),
    'Secondary Page': (process.env.SECONDARY_TOKEN || '').trim(),
    'Page 3': (process.env.TOKEN_3 || '').trim(),
    'Page 4': (process.env.TOKEN_4 || '').trim(),
};

let ACTIVE_TOKEN = "";
if (TARGET_PAGE === 'Custom Token (Below)') {
    ACTIVE_TOKEN = CUSTOM_TOKEN;
    console.log(`[📘 FB Mode] Custom Token Provided.`);
} else {
    ACTIVE_TOKEN = AVAILABLE_TOKENS[TARGET_PAGE] || "";
    console.log(`[📘 FB Mode] '${TARGET_PAGE}' Selected.`);
}

let consecutiveErrors = 0;

// ⏱️ TIME FORMATTER
function formatPKT() {
    const now = new Date();
    const displayTime = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit' }).formatToParts(now);
    let h = parts.find(p => p.type === 'hour').value;
    let m = parts.find(p => p.type === 'minute').value;
    let ampm = parts.find(p => p.type === 'dayPeriod').value.toUpperCase();
    const fileNameTime = `${h}_${m}_${ampm}`; 
    return { displayTime, fileNameTime };
}

// ==========================================
// 🧹 PREPARE GITHUB RELEASES
// ==========================================
async function setupGitHubReleaseAPI() {
    console.log(`\n[⚙️] GitHub Releases ki safai aur setup kar raha hoon...`);
    try {
        const checkRes = await axios.get(`https://api.github.com/repos/${REPO_NAME}/releases/tags/Live-Clips`, {
            headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (checkRes.data && checkRes.data.id) {
            await axios.delete(`https://api.github.com/repos/${REPO_NAME}/releases/${checkRes.data.id}`, { headers: { 'Authorization': `token ${GH_TOKEN}` } });
            console.log(`  [🧹] Purani release delete ho gayi.`);
        }
    } catch (e) {}

    try {
        await axios.post(`https://api.github.com/repos/${REPO_NAME}/releases`, {
            tag_name: "Live-Clips", name: "🔴 Live Cricket Clips", body: "Yahan aapki current match ki videos aayengi."
        }, { headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
        console.log(`  [✅] Naya Release Box tayyar hai!`);
    } catch (e) {}
}

async function uploadToReleaseAPI(filePath, fileName) {
    try {
        const relRes = await axios.get(`https://api.github.com/repos/${REPO_NAME}/releases/tags/Live-Clips`, {
            headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        const uploadUrlBase = relRes.data.upload_url.split('{')[0];
        const fileData = fs.readFileSync(filePath);
        const finalUploadUrl = `${uploadUrlBase}?name=${fileName}`;
        
        const uploadRes = await axios.post(finalUploadUrl, fileData, {
            headers: { 'Authorization': `token ${GH_TOKEN}`, 'Content-Type': 'video/mp4', 'Content-Length': fileData.length, 'Accept': 'application/vnd.github.v3+json' },
            maxBodyLength: Infinity, maxContentLength: Infinity
        });
        if (uploadRes.status === 201) return true;
        return false;
    } catch (e) {
        console.log(`[❌] Upload Failed Details:`, e.response ? e.response.data : e.message);
        return false;
    }
}

// ==========================================
// 🔍 WORKER 0: GET M3U8 LINK
// ==========================================
async function getStreamData() {
    console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon...`);
    let browserArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'];
    if (PROXY_IP && PROXY_PORT) browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);

    const browser = await puppeteer.launch({ headless: true, args: browserArgs });
    const page = await browser.newPage();

    if (PROXY_USER && PROXY_PASS) await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

    let streamData = null;
    page.on('request', (request) => {
        const url = request.url();
        if (url.includes('.m3u8')) streamData = { url: url, ua: request.headers()['user-agent'] || '', cookie: request.headers()['cookie'] || '', referer: REFERER };
    });

    try {
        console.log(`[🌐] Target URL par ja raha hoon (Proxy on)...`);
        await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.click('body').catch(() => {});
        for (let i = 1; i <= 3; i++) {
            await new Promise(r => setTimeout(r, 5000));
            if (streamData) break;
        }
    } catch (e) {}
    await browser.close();
    
    if (streamData) {
        console.log(`[✅ BINGO] M3U8 Link mil gaya!`);
        return streamData;
    } else process.exit(1); 
}

// ==========================================
// 📸 WORKER 0.5: CAPTURE HD THUMBNAIL (PUPPETEER)
// ==========================================
async function captureHDLiveFrame(data, titleText, outputImagePath) {
    console.log(`\n[📸 Step 0.5] HTML/CSS se VIP HD Thumbnail bana raha hoon...`);
    const rawFrame = `temp_raw_frame_${Date.now()}.jpg`;
    
    try {
        const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
        execSync(`ffmpeg -y -headers "${headersCmd}" -i "${data.url}" -vframes 1 -q:v 2 ${rawFrame}`, { stdio: 'ignore' });
    } catch (e) { 
        console.log(`  [❌] FFmpeg simple frame nahi nikal saka.`);
        return false; 
    }

    if (!fs.existsSync(rawFrame)) return false;
    
    const b64Image = "data:image/jpeg;base64," + fs.readFileSync(rawFrame).toString('base64');
    
    const htmlCode = `
        <!DOCTYPE html><html><head>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@700;900&display=swap" rel="stylesheet">
        <style>
            body { margin: 0; width: 1280px; height: 720px; background: #0f0f0f; font-family: 'Roboto', sans-serif; color: white; display: flex; flex-direction: column; overflow: hidden; }
            .header { height: 100px; display: flex; align-items: center; padding: 0 40px; justify-content: space-between; z-index: 10; }
            .logo { font-size: 50px; font-weight: 900; letter-spacing: 1px; text-shadow: 0 0 10px rgba(255,255,255,0.8); }
            .live-badge { border: 4px solid #cc0000; border-radius: 12px; padding: 5px 20px; font-size: 40px; font-weight: 700; display: flex; gap: 10px; }
            .hero-container { position: relative; width: 100%; height: 440px; }
            .hero-img { width: 100%; height: 100%; object-fit: cover; filter: blur(5px); opacity: 0.6; }
            .pip-img { position: absolute; top: 20px; right: 40px; width: 45%; border: 6px solid white; box-shadow: -15px 15px 30px rgba(0,0,0,0.8); }
            .text-container { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 10px 40px; }
            .main-title { font-size: 70px; font-weight: 900; line-height: 1.1; text-shadow: 6px 6px 15px rgba(0,0,0,0.9); }
            .live-text { color: #cc0000; }
        </style>
        </head><body>
            <div class="header"><div class="logo">SPORTSHUB</div><div class="live-badge"><span style="color:#cc0000">●</span> LIVE</div></div>
            <div class="hero-container"><img src="${b64Image}" class="hero-img"><img src="${b64Image}" class="pip-img"></div>
            <div class="text-container"><div class="main-title"><span class="live-text">LIVE NOW: </span>${titleText}</div></div>
        </body></html>`;

    try {
        const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(htmlCode);
        await page.screenshot({ path: outputImagePath });
        await browser.close();
    } catch (e) {
        console.log(`  [❌] Puppeteer error: ${e.message}`);
    }
    
    if (fs.existsSync(rawFrame)) fs.unlinkSync(rawFrame); 

    if (fs.existsSync(outputImagePath)) {
        console.log(`  [✅] HD Thumbnail Ready: ${outputImagePath}`);
        return true;
    }
    return false;
}

// ==========================================
// 🎥 WORKER 1 & 2: FFMPEG ENGINE
// ==========================================
function processVideo(data, rawLiveClip, finalMergedVideo) {
    console.log(`\n[🎬 Step 1] Capturing 15-second MUTE Live Clip...`);
    const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
    const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
    let filterComplex1 = `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_drawn]; [v_drawn]scale=1920:1080,setsar=1,fps=30[v_out]`;

    let args1 = [
        "-y", "-thread_queue_size", "1024", "-headers", headersCmd, "-i", data.url,
        "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
        "-filter_complex", filterComplex1, "-map", "[v_out]", "-t", "15",
        "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30", "-an", rawLiveClip
    ];

    try {
        spawnSync('ffmpeg', args1, { stdio: 'inherit' });
        if (fs.existsSync(rawLiveClip)) {
            console.log(`\n[🎬 Step 2] Merging Videos (1920x1080) & Adding Global Audio...`);
            let filterComplex2 = `[0:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[v1]; [v0][v1]concat=n=2:v=1:a=0[v_out]`;
            let args2 = [
                "-y", "-i", rawLiveClip, "-i", "main_video.mp4", "-stream_loop", "-1", "-i", "marya_live.mp3", 
                "-filter_complex", filterComplex2, "-map", "[v_out]", "-map", "2:a", "-shortest", 
                "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-c:a", "aac", "-b:a", "128k", finalMergedVideo
            ];
            spawnSync('ffmpeg', args2, { stdio: 'inherit' });
            return fs.existsSync(finalMergedVideo);
        }
    } catch (e) {}
    return false;
}

// ==========================================
// 📘 FACEBOOK WORKER ENGINE
// ==========================================
async function fbCheckAndComment(token, framePath) {
    try {
        const resPage = await axios.get("https://graph.facebook.com/v18.0/me", { params: { access_token: token, fields: "id,name" } });
        if (!resPage.data || !resPage.data.id) return;
        const pageId = resPage.data.id;
        
        console.log(`\n[🔍 FB] Monitoring Page: ${resPage.data.name} (ID: ${pageId})`);
        
        const resPosts = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/posts`, { params: { fields: "id,created_time", access_token: token } });
        const posts = resPosts.data?.data || [];
        const now = Date.now();
        
        let recentPosts = [];
        for (const post of posts) {
            if ((now - new Date(post.created_time).getTime()) / 1000 <= 3600) recentPosts.push(post);
        }
        
        console.log(`  [📊 FB] Found ${recentPosts.length} post(s) created in the last 1 hour.`);
        
        for (const post of recentPosts) {
            const postId = post.id;
            console.log(`  [👉 FB] Checking Post ID: ${postId}`);
            
            const resComments = await axios.get(`https://graph.facebook.com/v18.0/${postId}/comments`, { params: { fields: "from", access_token: token } });
            let alreadyCommented = false;
            for (const comment of (resComments.data?.data || [])) {
                if (comment.from && comment.from.id === pageId) { alreadyCommented = true; break; }
            }
            
            if (alreadyCommented) {
                console.log("  [✅ FB] Page has ALREADY commented on this post. Skipping.");
            } else {
                console.log("  [🚨 FB] Author comment NOT FOUND! Taking action...");
                
                // 1. Post Comment
                try {
                    const commentUrl = `https://graph.facebook.com/v18.0/${postId}/comments`;
                    if (fs.existsSync(COMMENT_IMG_PATH)) {
                        const form = new FormData();
                        form.append('message', COMMENT_TEXT);
                        form.append('access_token', token);
                        form.append('source', fs.createReadStream(COMMENT_IMG_PATH));
                        await axios.post(commentUrl, form, { headers: form.getHeaders() });
                    } else {
                        await axios.post(commentUrl, null, { params: { message: COMMENT_TEXT, access_token: token } });
                    }
                    console.log(`  [✅ FB] Promotional Comment Placed Successfully!`);
                } catch (e) { console.log(`  [❌ FB] Comment Error.`); }
                
                // 2. Force Video Thumbnail (Using Live Frame)
                if (fs.existsSync(framePath)) {
                    console.log(`  [🖼️ FB] Updating Thumbnail with HD LIVE FRAME...`);
                    try {
                        const resAttach = await axios.get(`https://graph.facebook.com/v18.0/${postId}`, { params: { fields: "attachments", access_token: token } });
                        const attachments = resAttach.data.attachments?.data || [];
                        let videoId = null;
                        if (attachments.length > 0 && attachments[0].target && attachments[0].target.id) videoId = attachments[0].target.id;
                        
                        if (videoId) {
                            const formThumb = new FormData();
                            formThumb.append('access_token', token);
                            formThumb.append('is_preferred', 'true');
                            formThumb.append('source', fs.createReadStream(framePath));
                            const resThumb = await axios.post(`https://graph.facebook.com/v18.0/${videoId}/thumbnails`, formThumb, { headers: formThumb.getHeaders() });
                            if (resThumb.data && resThumb.data.success) console.log("  [✅ FB] HD Live Frame set as Video Cover Photo!");
                        }
                    } catch (e) { console.log(`  [❌ FB] Thumbnail Error.`); }
                }
            }
        }
    } catch (e) { console.log(`  [❌ FB] API Error.`); }
}

// ==========================================
// 🚀 MAIN LOOP (THE BRAIN)
// ==========================================
async function main() {
    await setupGitHubReleaseAPI(); 

    let streamData = await getStreamData();
    let clipCounter = 1;

    while (true) {
        const elapsedTimeMs = Date.now() - START_TIME;
        if (elapsedTimeMs > END_TIME_LIMIT_MS) break;

        const timeInfo = formatPKT();

        console.log(`\n${"-".repeat(50)}`);
        console.log(`--- 🔄 STARTING CYCLE #${clipCounter} ---`);
        console.log(`${"-".repeat(50)}`);

        const rawLiveClip = `raw_live.mp4`;
        const videoName = `${VIDEO_TITLE}_Clip_${clipCounter}_${timeInfo.fileNameTime}_PKT.mp4`; 
        // Image .png mein save kar rahe hain kyunke yeh ab puppeteer ki HD file hai
        const liveFramePath = `live_frame_${clipCounter}.png`; 

        // 1. HD Live Frame Capture (For FB Thumbnail) - NAYA ENGINE
        await captureHDLiveFrame(streamData, CUSTOM_TITLE, liveFramePath);

        // 2. Video Capture & Build
        const success = processVideo(streamData, rawLiveClip, videoName);

        if (success) {
            console.log(`\n[🚀 Upload] Video ko GitHub Releases mein daal raha hoon...`);
            const isUploaded = await uploadToReleaseAPI(videoName, videoName);
            
            if (isUploaded) {
                console.log(`\n🎉 VIDEO IS LIVE ON GITHUB RELEASES! (YouTube 1920x1080)`);
                console.log(`👉 Link: https://github.com/${REPO_NAME}/releases/download/Live-Clips/${videoName}`);
            }

            if (fs.existsSync(rawLiveClip)) fs.unlinkSync(rawLiveClip);
            if (fs.existsSync(videoName)) fs.unlinkSync(videoName);
            consecutiveErrors = 0;
        } else {
            consecutiveErrors++;
            if (consecutiveErrors >= 2) {
                streamData = await getStreamData();
                consecutiveErrors = 0;
            }
        }
        
        // ==========================================
        // ⏳ SMART WAIT TIME + FACEBOOK MONITOR
        // ==========================================
        console.log(`\n[⏳] 3 Minute ka wait shuru... Is dauran Facebook Worker apna kaam karega!`);
        const waitStartTime = Date.now();

        if (ACTIVE_TOKEN) {
            // Is Function ko naya HD Thumbnail de rahe hain taake wo set ho sake
            await fbCheckAndComment(ACTIVE_TOKEN, liveFramePath);
        } else {
            console.log(`  [⚠️] Facebook Token missing, skipping FB Monitor.`);
        }

        // Frame ka kaam khatam, isay delete kar dein
        if (fs.existsSync(liveFramePath)) fs.unlinkSync(liveFramePath);

        const timeSpentInFB = Date.now() - waitStartTime;
        let remainingWait = 180000 - timeSpentInFB;
        
        if (remainingWait < 10000) remainingWait = 10000; 

        console.log(`[💤] FB Scan Done. Aglay clip ke liye ${Math.round(remainingWait/1000)} seconds rest kar raha hoon...`);
        await new Promise(r => setTimeout(r, remainingWait)); 
        clipCounter++;
    }
}

main();





















// ============ great yeh below code 100% teek hai , sab kuch kar raha hai , bas ooper waley code mei thumbnail ko beautiful style deya hai and pher upload krta hai facebook mei ======================



// const puppeteer = require('puppeteer');
// const { spawnSync, execSync } = require('child_process');
// const fs = require('fs');
// const axios = require('axios'); 
// const FormData = require('form-data'); // YAHAN FORM DATA ADD KIYA GAYA HAI

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS SUPER HYBRID CLOUD (VIDEO FACTORY + FB MONITOR)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000; 

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// const VIDEO_TITLE = (process.env.VIDEO_TITLE || "Live_Match")
//     .replace(/[^\w\s-]/g, '') 
//     .trim()
//     .replace(/\s+/g, '_');

// const PROXY_IP = process.env.PROXY_IP || '';
// const PROXY_PORT = process.env.PROXY_PORT || '';
// const PROXY_USER = process.env.PROXY_USER || '';
// const PROXY_PASS = process.env.PROXY_PASS || '';

// // GitHub API Token
// const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_PAT; 
// const REPO_NAME = process.env.GITHUB_REPOSITORY;

// // ==========================================
// // 📘 FACEBOOK BOT SETTINGS
// // ==========================================
// const CUSTOM_TITLE = (process.env.CUSTOM_TITLE || '🔴 Live Match!').trim();
// const BASE_COMMENT = "📺 Watch Full Match Without Buffering Here: https://bulbul4u-live.xyz";
// const COMMENT_TEXT = `${CUSTOM_TITLE}\n\n${BASE_COMMENT}`;
// const COMMENT_IMG_PATH = "comment_image.jpeg";

// const TARGET_PAGE = process.env.TARGET_PAGE || 'Primary Page';
// const CUSTOM_TOKEN = (process.env.CUSTOM_TOKEN || '').trim();

// const AVAILABLE_TOKENS = {
//     'Primary Page': (process.env.PRIMARY_TOKEN || '').trim(),
//     'Secondary Page': (process.env.SECONDARY_TOKEN || '').trim(),
//     'Page 3': (process.env.TOKEN_3 || '').trim(),
//     'Page 4': (process.env.TOKEN_4 || '').trim(),
// };

// let ACTIVE_TOKEN = "";
// if (TARGET_PAGE === 'Custom Token (Below)') {
//     ACTIVE_TOKEN = CUSTOM_TOKEN;
//     console.log(`[📘 FB Mode] Custom Token Provided.`);
// } else {
//     ACTIVE_TOKEN = AVAILABLE_TOKENS[TARGET_PAGE] || "";
//     console.log(`[📘 FB Mode] '${TARGET_PAGE}' Selected.`);
// }

// let consecutiveErrors = 0;

// // ⏱️ TIME FORMATTER
// function formatPKT() {
//     const now = new Date();
//     const displayTime = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
//     const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit' }).formatToParts(now);
//     let h = parts.find(p => p.type === 'hour').value;
//     let m = parts.find(p => p.type === 'minute').value;
//     let ampm = parts.find(p => p.type === 'dayPeriod').value.toUpperCase();
//     const fileNameTime = `${h}_${m}_${ampm}`; 
//     return { displayTime, fileNameTime };
// }

// // ==========================================
// // 🧹 PREPARE GITHUB RELEASES
// // ==========================================
// async function setupGitHubReleaseAPI() {
//     console.log(`\n[⚙️] GitHub Releases ki safai aur setup kar raha hoon...`);
//     try {
//         const checkRes = await axios.get(`https://api.github.com/repos/${REPO_NAME}/releases/tags/Live-Clips`, {
//             headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
//         });
//         if (checkRes.data && checkRes.data.id) {
//             await axios.delete(`https://api.github.com/repos/${REPO_NAME}/releases/${checkRes.data.id}`, { headers: { 'Authorization': `token ${GH_TOKEN}` } });
//             console.log(`  [🧹] Purani release delete ho gayi.`);
//         }
//     } catch (e) {}

//     try {
//         await axios.post(`https://api.github.com/repos/${REPO_NAME}/releases`, {
//             tag_name: "Live-Clips", name: "🔴 Live Cricket Clips", body: "Yahan aapki current match ki videos aayengi."
//         }, { headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
//         console.log(`  [✅] Naya Release Box tayyar hai!`);
//     } catch (e) {}
// }

// async function uploadToReleaseAPI(filePath, fileName) {
//     try {
//         const relRes = await axios.get(`https://api.github.com/repos/${REPO_NAME}/releases/tags/Live-Clips`, {
//             headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
//         });
//         const uploadUrlBase = relRes.data.upload_url.split('{')[0];
//         const fileData = fs.readFileSync(filePath);
//         const finalUploadUrl = `${uploadUrlBase}?name=${fileName}`;
        
//         const uploadRes = await axios.post(finalUploadUrl, fileData, {
//             headers: { 'Authorization': `token ${GH_TOKEN}`, 'Content-Type': 'video/mp4', 'Content-Length': fileData.length, 'Accept': 'application/vnd.github.v3+json' },
//             maxBodyLength: Infinity, maxContentLength: Infinity
//         });
//         if (uploadRes.status === 201) return true;
//         return false;
//     } catch (e) {
//         console.log(`[❌] Upload Failed Details:`, e.response ? e.response.data : e.message);
//         return false;
//     }
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon...`);
//     let browserArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'];
//     if (PROXY_IP && PROXY_PORT) browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);

//     const browser = await puppeteer.launch({ headless: true, args: browserArgs });
//     const page = await browser.newPage();

//     if (PROXY_USER && PROXY_PASS) await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) streamData = { url: url, ua: request.headers()['user-agent'] || '', cookie: request.headers()['cookie'] || '', referer: REFERER };
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon (Proxy on)...`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) break;
//         }
//     } catch (e) {}
//     await browser.close();
    
//     if (streamData) {
//         console.log(`[✅ BINGO] M3U8 Link mil gaya!`);
//         return streamData;
//     } else process.exit(1); 
// }

// // ==========================================
// // 📸 WORKER 0.5: CAPTURE LIVE FRAME
// // ==========================================
// function captureLiveFrame(data, framePath) {
//     console.log(`\n[📸 Step 0.5] Capturing Live Frame for Facebook Thumbnail...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     let args = ["-y", "-headers", headersCmd, "-i", data.url, "-vframes", "1", "-q:v", "2", framePath];
    
//     try {
//         spawnSync('ffmpeg', args, { stdio: 'ignore' });
//         if (fs.existsSync(framePath)) {
//             console.log(`  [✅] Live Frame captured successfully!`);
//             return true;
//         }
//     } catch (e) {}
//     console.log(`  [❌] Failed to capture Live Frame.`);
//     return false;
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second MUTE Live Clip...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     let filterComplex1 = `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_drawn]; [v_drawn]scale=1920:1080,setsar=1,fps=30[v_out]`;

//     let args1 = [
//         "-y", "-thread_queue_size", "1024", "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-filter_complex", filterComplex1, "-map", "[v_out]", "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30", "-an", rawLiveClip
//     ];

//     try {
//         spawnSync('ffmpeg', args1, { stdio: 'inherit' });
//         if (fs.existsSync(rawLiveClip)) {
//             console.log(`\n[🎬 Step 2] Merging Videos (1920x1080) & Adding Global Audio...`);
//             let filterComplex2 = `[0:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[v1]; [v0][v1]concat=n=2:v=1:a=0[v_out]`;
//             let args2 = [
//                 "-y", "-i", rawLiveClip, "-i", "main_video.mp4", "-stream_loop", "-1", "-i", "marya_live.mp3", 
//                 "-filter_complex", filterComplex2, "-map", "[v_out]", "-map", "2:a", "-shortest", 
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-c:a", "aac", "-b:a", "128k", finalMergedVideo
//             ];
//             spawnSync('ffmpeg', args2, { stdio: 'inherit' });
//             return fs.existsSync(finalMergedVideo);
//         }
//     } catch (e) {}
//     return false;
// }

// // ==========================================
// // 📘 FACEBOOK WORKER ENGINE
// // ==========================================
// async function fbCheckAndComment(token, framePath) {
//     try {
//         const resPage = await axios.get("https://graph.facebook.com/v18.0/me", { params: { access_token: token, fields: "id,name" } });
//         if (!resPage.data || !resPage.data.id) return;
//         const pageId = resPage.data.id;
        
//         console.log(`\n[🔍 FB] Monitoring Page: ${resPage.data.name} (ID: ${pageId})`);
        
//         const resPosts = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/posts`, { params: { fields: "id,created_time", access_token: token } });
//         const posts = resPosts.data?.data || [];
//         const now = Date.now();
        
//         let recentPosts = [];
//         for (const post of posts) {
//             if ((now - new Date(post.created_time).getTime()) / 1000 <= 3600) recentPosts.push(post);
//         }
        
//         console.log(`  [📊 FB] Found ${recentPosts.length} post(s) created in the last 1 hour.`);
        
//         for (const post of recentPosts) {
//             const postId = post.id;
//             console.log(`  [👉 FB] Checking Post ID: ${postId}`);
            
//             const resComments = await axios.get(`https://graph.facebook.com/v18.0/${postId}/comments`, { params: { fields: "from", access_token: token } });
//             let alreadyCommented = false;
//             for (const comment of (resComments.data?.data || [])) {
//                 if (comment.from && comment.from.id === pageId) { alreadyCommented = true; break; }
//             }
            
//             if (alreadyCommented) {
//                 console.log("  [✅ FB] Page has ALREADY commented on this post. Skipping.");
//             } else {
//                 console.log("  [🚨 FB] Author comment NOT FOUND! Taking action...");
                
//                 // 1. Post Comment
//                 try {
//                     const commentUrl = `https://graph.facebook.com/v18.0/${postId}/comments`;
//                     if (fs.existsSync(COMMENT_IMG_PATH)) {
//                         const form = new FormData();
//                         form.append('message', COMMENT_TEXT);
//                         form.append('access_token', token);
//                         form.append('source', fs.createReadStream(COMMENT_IMG_PATH));
//                         await axios.post(commentUrl, form, { headers: form.getHeaders() });
//                     } else {
//                         await axios.post(commentUrl, null, { params: { message: COMMENT_TEXT, access_token: token } });
//                     }
//                     console.log(`  [✅ FB] Promotional Comment Placed Successfully!`);
//                 } catch (e) { console.log(`  [❌ FB] Comment Error.`); }
                
//                 // 2. Force Video Thumbnail (Using Live Frame)
//                 if (fs.existsSync(framePath)) {
//                     console.log(`  [🖼️ FB] Updating Thumbnail with LIVE FRAME...`);
//                     try {
//                         const resAttach = await axios.get(`https://graph.facebook.com/v18.0/${postId}`, { params: { fields: "attachments", access_token: token } });
//                         const attachments = resAttach.data.attachments?.data || [];
//                         let videoId = null;
//                         if (attachments.length > 0 && attachments[0].target && attachments[0].target.id) videoId = attachments[0].target.id;
                        
//                         if (videoId) {
//                             const formThumb = new FormData();
//                             formThumb.append('access_token', token);
//                             formThumb.append('is_preferred', 'true');
//                             formThumb.append('source', fs.createReadStream(framePath));
//                             const resThumb = await axios.post(`https://graph.facebook.com/v18.0/${videoId}/thumbnails`, formThumb, { headers: formThumb.getHeaders() });
//                             if (resThumb.data && resThumb.data.success) console.log("  [✅ FB] Live Frame set as Video Cover Photo!");
//                         }
//                     } catch (e) { console.log(`  [❌ FB] Thumbnail Error.`); }
//                 }
//             }
//         }
//     } catch (e) { console.log(`  [❌ FB] API Error.`); }
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     await setupGitHubReleaseAPI(); 

//     let streamData = await getStreamData();
//     let clipCounter = 1;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) break;

//         const timeInfo = formatPKT();

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING CYCLE #${clipCounter} ---`);
//         console.log(`${"-".repeat(50)}`);

//         const rawLiveClip = `raw_live.mp4`;
//         const videoName = `${VIDEO_TITLE}_Clip_${clipCounter}_${timeInfo.fileNameTime}_PKT.mp4`; 
//         const liveFramePath = `live_frame_${clipCounter}.jpg`;

//         // 1. Live Frame Capture (For FB Thumbnail)
//         captureLiveFrame(streamData, liveFramePath);

//         // 2. Video Capture & Build
//         const success = processVideo(streamData, rawLiveClip, videoName);

//         if (success) {
//             console.log(`\n[🚀 Upload] Video ko GitHub Releases mein daal raha hoon...`);
//             const isUploaded = await uploadToReleaseAPI(videoName, videoName);
            
//             if (isUploaded) {
//                 console.log(`\n🎉 VIDEO IS LIVE ON GITHUB RELEASES! (YouTube 1920x1080)`);
//                 console.log(`👉 Link: https://github.com/${REPO_NAME}/releases/download/Live-Clips/${videoName}`);
//             }

//             if (fs.existsSync(rawLiveClip)) fs.unlinkSync(rawLiveClip);
//             if (fs.existsSync(videoName)) fs.unlinkSync(videoName);
//             consecutiveErrors = 0;
//         } else {
//             consecutiveErrors++;
//             if (consecutiveErrors >= 2) {
//                 streamData = await getStreamData();
//                 consecutiveErrors = 0;
//             }
//         }
        
//         // ==========================================
//         // ⏳ SMART WAIT TIME + FACEBOOK MONITOR
//         // ==========================================
//         console.log(`\n[⏳] 3 Minute ka wait shuru... Is dauran Facebook Worker apna kaam karega!`);
//         const waitStartTime = Date.now();

//         if (ACTIVE_TOKEN) {
//             // Is Function ko Live Frame de rahe hain taake wo thumbnail ban sake
//             await fbCheckAndComment(ACTIVE_TOKEN, liveFramePath);
//         } else {
//             console.log(`  [⚠️] Facebook Token missing, skipping FB Monitor.`);
//         }

//         // Frame ka kaam khatam, isay delete kar dein
//         if (fs.existsSync(liveFramePath)) fs.unlinkSync(liveFramePath);

//         const timeSpentInFB = Date.now() - waitStartTime;
//         // Total Wait: 180,000 ms (3 Minutes). Usme se FB ka time nikal diya.
//         let remainingWait = 180000 - timeSpentInFB;
        
//         // 10 Second safe margin jesa aapne manga tha
//         if (remainingWait < 10000) remainingWait = 10000; 

//         console.log(`[💤] FB Scan Done. Aglay clip ke liye ${Math.round(remainingWait/1000)} seconds rest kar raha hoon...`);
//         await new Promise(r => setTimeout(r, remainingWait)); 
//         clipCounter++;
//     }
// }

// main();






























// ============= yeh code teek hai, aab hum ishe eek or code ko add karty hai taakey woo faceboook mei comment and thumbnail add akry =============================


// const puppeteer = require('puppeteer');
// const { spawnSync, execSync } = require('child_process');
// const fs = require('fs');
// // YAHAN AXIOS ADD KIYA GAYA HAI (API UPLOAD KE LIYE)
// const axios = require('axios'); 

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (GITHUB API UPLOAD EDITION)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000; 

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// const VIDEO_TITLE = (process.env.VIDEO_TITLE || "Live_Match")
//     .replace(/[^\w\s-]/g, '') 
//     .trim()
//     .replace(/\s+/g, '_');

// const PROXY_IP = process.env.PROXY_IP || '';
// const PROXY_PORT = process.env.PROXY_PORT || '';
// const PROXY_USER = process.env.PROXY_USER || '';
// const PROXY_PASS = process.env.PROXY_PASS || '';

// // GitHub API Token
// const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_PAT; 
// const REPO_NAME = process.env.GITHUB_REPOSITORY;

// let consecutiveErrors = 0;

// // ⏱️ TIME FORMATTER
// function formatPKT() {
//     const now = new Date();
//     const displayTime = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
//     const parts = new Intl.DateTimeFormat('en-US', {
//         timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit'
//     }).formatToParts(now);
    
//     let h = parts.find(p => p.type === 'hour').value;
//     let m = parts.find(p => p.type === 'minute').value;
//     let ampm = parts.find(p => p.type === 'dayPeriod').value.toUpperCase();
    
//     const fileNameTime = `${h}_${m}_${ampm}`; 
//     return { displayTime, fileNameTime };
// }

// // ==========================================
// // 🧹 PREPARE GITHUB RELEASES (USING API)
// // ==========================================
// async function setupGitHubReleaseAPI() {
//     console.log(`\n[⚙️] GitHub Releases ki safai aur setup kar raha hoon...`);
    
//     // API Setup: Release dhoondo aur create karo
//     try {
//         const checkRes = await axios.get(`https://api.github.com/repos/${REPO_NAME}/releases/tags/Live-Clips`, {
//             headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
//         });
        
//         // Agar pehle se hai toh usay delete kardo
//         if (checkRes.data && checkRes.data.id) {
//             await axios.delete(`https://api.github.com/repos/${REPO_NAME}/releases/${checkRes.data.id}`, {
//                 headers: { 'Authorization': `token ${GH_TOKEN}` }
//             });
//             console.log(`  [🧹] Purani release delete ho gayi.`);
//         }
//     } catch (e) {
//         // Ignored, pehle se release nahi hogi
//     }

//     try {
//         await axios.post(`https://api.github.com/repos/${REPO_NAME}/releases`, {
//             tag_name: "Live-Clips",
//             name: "🔴 Live Cricket Clips",
//             body: "Yahan aapki current match ki videos aayengi."
//         }, { headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
//         console.log(`  [✅] Naya Release Box tayyar hai!`);
//     } catch (e) {
//         console.log(`  [❌] Release Box setup error: ${e.response ? e.response.statusText : e.message}`);
//     }
// }

// // ==========================================
// // 📤 UPLOAD TO GITHUB RELEASE (USING API)
// // ==========================================
// async function uploadToReleaseAPI(filePath, fileName) {
//     try {
//         // Step 1: Release ID hasil karo
//         const relRes = await axios.get(`https://api.github.com/repos/${REPO_NAME}/releases/tags/Live-Clips`, {
//             headers: { 'Authorization': `token ${GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
//         });
//         const releaseId = relRes.data.id;
//         const uploadUrlBase = relRes.data.upload_url.split('{')[0]; // URL saaf karna

//         // Step 2: File read karke Upload karo
//         const fileData = fs.readFileSync(filePath);
//         const finalUploadUrl = `${uploadUrlBase}?name=${fileName}`;
        
//         const uploadRes = await axios.post(finalUploadUrl, fileData, {
//             headers: {
//                 'Authorization': `token ${GH_TOKEN}`,
//                 'Content-Type': 'video/mp4',
//                 'Content-Length': fileData.length,
//                 'Accept': 'application/vnd.github.v3+json'
//             },
//             maxBodyLength: Infinity,
//             maxContentLength: Infinity
//         });

//         if (uploadRes.status === 201) return true;
//         return false;
//     } catch (e) {
//         console.log(`[❌] Upload Failed Details:`, e.response ? e.response.data : e.message);
//         return false;
//     }
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon...`);
//     let browserArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'];

//     if (PROXY_IP && PROXY_PORT) browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);

//     const browser = await puppeteer.launch({ headless: true, args: browserArgs });
//     const page = await browser.newPage();

//     if (PROXY_USER && PROXY_PASS) await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = { url: url, ua: request.headers()['user-agent'] || '', cookie: request.headers()['cookie'] || '', referer: REFERER };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon (Proxy on)...`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) break;
//         }
//     } catch (e) { console.log(`[❌ ERROR] Page load nahi ho saka.`); }
    
//     await browser.close();
    
//     if (streamData) {
//         console.log(`[✅ BINGO] M3U8 Link mil gaya! Ab Proxy band, aur yahi link use hoga.`);
//         return streamData;
//     } else {
//         process.exit(1); 
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE (1920x1080 Magic)
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second MUTE Live Clip...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     let filterComplex1 = `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_drawn]; [v_drawn]scale=1920:1080,setsar=1,fps=30[v_out]`;

//     let args1 = [
//         "-y", "-thread_queue_size", "1024", "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-filter_complex", filterComplex1,
//         "-map", "[v_out]", "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30", "-an", rawLiveClip
//     ];

//     try {
//         spawnSync('ffmpeg', args1, { stdio: 'inherit' });
//         if (fs.existsSync(rawLiveClip)) {
//             console.log(`\n[🎬 Step 2] Merging Videos (1920x1080) & Adding Global Audio...`);
            
//             let filterComplex2 = `[0:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[v1]; [v0][v1]concat=n=2:v=1:a=0[v_out]`;

//             let args2 = [
//                 "-y", 
//                 "-i", rawLiveClip,             
//                 "-i", "main_video.mp4",        
//                 "-stream_loop", "-1", "-i", "marya_live.mp3", 
//                 "-filter_complex", filterComplex2,
//                 "-map", "[v_out]",             
//                 "-map", "2:a",                 
//                 "-shortest",                   
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", 
//                 "-c:a", "aac", "-b:a", "128k", 
//                 finalMergedVideo
//             ];
//             spawnSync('ffmpeg', args2, { stdio: 'inherit' });
//             return fs.existsSync(finalMergedVideo);
//         }
//     } catch (e) { console.log(`[❌] Error: ${e.message}`); }
//     return false;
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     await setupGitHubReleaseAPI(); 

//     let streamData = await getStreamData();
//     let clipCounter = 1;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) break;

//         const timeInfo = formatPKT();

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//         console.log(`${"-".repeat(50)}`);

//         const rawLiveClip = `raw_live.mp4`;
//         const videoName = `${VIDEO_TITLE}_Clip_${clipCounter}_${timeInfo.fileNameTime}_PKT.mp4`; 

//         const success = processVideo(streamData, rawLiveClip, videoName);

//         if (success) {
//             console.log(`\n[🚀 Upload] Video ko GitHub API ke zariye Releases mein daal raha hoon...`);
            
//             // Yahan hum API function call kar rahe hain
//             const isUploaded = await uploadToReleaseAPI(videoName, videoName);
            
//             if (isUploaded) {
//                 const downloadLink = `https://github.com/${REPO_NAME}/releases/download/Live-Clips/${videoName}`;
                
//                 console.log(`\n=========================================================`);
//                 console.log(`🎉 VIDEO IS LIVE ON GITHUB RELEASES! (YouTube 1920x1080)`);
//                 console.log(`⏰ Time: ${timeInfo.displayTime} PKT`);
//                 console.log(`👉 Direct Download Link:`);
//                 console.log(`${downloadLink}`);
//                 console.log(`(Aap apne Mobile se repository ke 'Releases' tab mein ja kar bhi download kar sakte hain!)`);
//                 console.log(`=========================================================\n`);
//             } else {
//                 console.log(`[❌] Upload Failed via API.`);
//             }

//             if (fs.existsSync(rawLiveClip)) fs.unlinkSync(rawLiveClip);
//             if (fs.existsSync(videoName)) fs.unlinkSync(videoName);
//             consecutiveErrors = 0;
//         } else {
//             console.log(`  [❌] Pipeline failed.`);
//             consecutiveErrors++;
            
//             if (consecutiveErrors >= 2) {
//                 console.log(`[⚠️] Lagta hai M3U8 link expire ho gaya hai. Dobara fetch kar raha hoon...`);
//                 streamData = await getStreamData();
//                 consecutiveErrors = 0;
//             }
//         }
        
//         console.log(`[⏳] 3 Minute ka wait kar raha hoon aglay clip ke liye...`);
//         await new Promise(r => setTimeout(r, 180000)); 
//         clipCounter++;
//     }
// }

// main();














// const puppeteer = require('puppeteer');
// const { spawnSync, execSync } = require('child_process');
// const fs = require('fs');

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (GITHUB RELEASES EDITION)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000; // 5 hours 50 mins limit

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// const VIDEO_TITLE = (process.env.VIDEO_TITLE || "Live_Match")
//     .replace(/[^\w\s-]/g, '') 
//     .trim()
//     .replace(/\s+/g, '_');

// // 🛡️ PROXY SETTINGS
// const PROXY_IP = process.env.PROXY_IP || '';
// const PROXY_PORT = process.env.PROXY_PORT || '';
// const PROXY_USER = process.env.PROXY_USER || '';
// const PROXY_PASS = process.env.PROXY_PASS || '';

// // GitHub CLI ke liye Auto-Token setup
// process.env.GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_PAT; 
// const REPO_NAME = process.env.GITHUB_REPOSITORY;

// let consecutiveErrors = 0;

// // ⏱️ TIME FORMATTER
// function formatPKT() {
//     const now = new Date();
//     const displayTime = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
//     const parts = new Intl.DateTimeFormat('en-US', {
//         timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit'
//     }).formatToParts(now);
    
//     let h = parts.find(p => p.type === 'hour').value;
//     let m = parts.find(p => p.type === 'minute').value;
//     let ampm = parts.find(p => p.type === 'dayPeriod').value.toUpperCase();
    
//     const fileNameTime = `${h}_${m}_${ampm}`; 
//     return { displayTime, fileNameTime };
// }

// // ==========================================
// // 🧹 PREPARE GITHUB RELEASES
// // ==========================================
// function setupGitHubRelease() {
//     console.log(`\n[⚙️] GitHub Releases ki safai aur setup kar raha hoon...`);
//     try {
//         execSync(`gh release delete Live-Clips --cleanup-tag -y`, { stdio: 'pipe' });
//         console.log(`  [🧹] Purani release delete ho gayi.`);
//     } catch (e) {} 

//     try {
//         execSync(`gh release create Live-Clips --title "🔴 Live Cricket Clips" --notes "Yahan aapki current match ki videos aayengi."`, { stdio: 'pipe' });
//         console.log(`  [✅] Naya Release Box tayyar hai!`);
//     } catch (e) {
//         console.log(`  [⚠️] Release Box pehle se mojood hai.`);
//     }
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon...`);
//     let browserArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'];

//     if (PROXY_IP && PROXY_PORT) browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);

//     const browser = await puppeteer.launch({ headless: true, args: browserArgs });
//     const page = await browser.newPage();

//     if (PROXY_USER && PROXY_PASS) await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = { url: url, ua: request.headers()['user-agent'] || '', cookie: request.headers()['cookie'] || '', referer: REFERER };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon (Proxy on)...`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) break;
//         }
//     } catch (e) { console.log(`[❌ ERROR] Page load nahi ho saka.`); }
    
//     await browser.close();
    
//     if (streamData) {
//         console.log(`[✅ BINGO] M3U8 Link mil gaya! Ab Proxy band, aur yahi link use hoga.`);
//         return streamData;
//     } else {
//         process.exit(1); 
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE (YouTube Ratio Added)
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second MUTE Live Clip...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     // Aapka apna original frame code
//     let args1 = [
//         "-y", "-thread_queue_size", "1024", "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-filter_complex", `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`,
//         "-map", "[v_out]", "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30", "-an", rawLiveClip
//     ];

//     try {
//         spawnSync('ffmpeg', args1, { stdio: 'inherit' });
//         if (fs.existsSync(rawLiveClip)) {
//             console.log(`\n[🎬 Step 2] Merging Videos & Converting to 1920x1080 (YouTube Size)...`);
            
//             // 🛠️ YAHAN UPDATE HUA HAI: YouTube 16:9 Ratio logic add kar di gayi hai jo video ko center mein fit karke baqi hissa black kar degi
//             let args2 = [
//                 "-y", 
//                 "-i", rawLiveClip,             
//                 "-i", "main_video.mp4",        
//                 "-stream_loop", "-1", "-i", "marya_live.mp3", 
                
//                 "-filter_complex", 
//                 "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v1]; [v0][v1]concat=n=2:v=1:a=0[v_out]",
                
//                 "-map", "[v_out]",             
//                 "-map", "2:a",                 
//                 "-shortest",                   
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", 
//                 "-c:a", "aac", "-b:a", "128k", 
//                 finalMergedVideo
//             ];
//             spawnSync('ffmpeg', args2, { stdio: 'inherit' });
//             return fs.existsSync(finalMergedVideo);
//         }
//     } catch (e) { console.log(`[❌] Error: ${e.message}`); }
//     return false;
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     setupGitHubRelease(); 

//     let streamData = await getStreamData();
//     let clipCounter = 1;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) break;

//         const timeInfo = formatPKT();

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//         console.log(`${"-".repeat(50)}`);

//         const rawLiveClip = `raw_live.mp4`;
//         const videoName = `${VIDEO_TITLE}_Clip_${clipCounter}_${timeInfo.fileNameTime}_PKT.mp4`; 

//         const success = processVideo(streamData, rawLiveClip, videoName);

//         if (success) {
//             console.log(`\n[🚀 Upload] Video ko GitHub Releases mein daal raha hoon...`);
//             try {
//                 // Stdout proper check hoga taake koi bhi error ho toh console par print ho
//                 const uploadRes = execSync(`gh release upload Live-Clips "${videoName}" --clobber`, { encoding: 'utf8' });
//                 if(uploadRes) console.log(`  [>] ${uploadRes.trim()}`);
                
//                 const downloadLink = `https://github.com/${REPO_NAME}/releases/download/Live-Clips/${videoName}`;
                
//                 console.log(`\n=========================================================`);
//                 console.log(`🎉 VIDEO IS LIVE ON GITHUB RELEASES!`);
//                 console.log(`⏰ Time: ${timeInfo.displayTime} PKT`);
//                 console.log(`👉 Direct Download Link:`);
//                 console.log(`${downloadLink}`);
//                 console.log(`(Aap apne Mobile se repository ke 'Releases' tab mein ja kar bhi download kar sakte hain!)`);
//                 console.log(`=========================================================\n`);
                
//             } catch (e) {
//                 console.log(`[❌] Upload Failed: YML file mein permissions missing hain.`);
//                 console.log(`[🔍] Details:`, e.stderr || e.message);
//             }

//             if (fs.existsSync(rawLiveClip)) fs.unlinkSync(rawLiveClip);
//             if (fs.existsSync(videoName)) fs.unlinkSync(videoName);
//             consecutiveErrors = 0;
//         } else {
//             console.log(`  [❌] Pipeline failed.`);
//             consecutiveErrors++;
            
//             if (consecutiveErrors >= 2) {
//                 console.log(`[⚠️] Lagta hai M3U8 link expire ho gaya hai. Dobara fetch kar raha hoon...`);
//                 streamData = await getStreamData();
//                 consecutiveErrors = 0;
//             }
//         }
        
//         console.log(`[⏳] 3 Minute ka wait kar raha hoon aglay clip ke liye...`);
//         await new Promise(r => setTimeout(r, 180000)); 
//         clipCounter++;
//     }
// }

// main();





















// ===================== this code 100% good, bas yeh final video ko ratio correct nahey hai, ooper youtube k ratio add karty hai =======================


// const puppeteer = require('puppeteer');
// const { spawnSync, execSync } = require('child_process');
// const fs = require('fs');

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (GITHUB RELEASES EDITION)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000; // 5 hours 50 mins limit

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// // Title Input Read kar raha hai aur special characters ko delete karke spaces ko '_' mein badal raha hai
// const VIDEO_TITLE = (process.env.VIDEO_TITLE || "Live_Match")
//     .replace(/[^\w\s-]/g, '') // A-Z, 0-9, spaces aur hyphens ke ilawa sab delete
//     .trim()
//     .replace(/\s+/g, '_');

// // 🛡️ PROXY SETTINGS
// const PROXY_IP = process.env.PROXY_IP || '';
// const PROXY_PORT = process.env.PROXY_PORT || '';
// const PROXY_USER = process.env.PROXY_USER || '';
// const PROXY_PASS = process.env.PROXY_PASS || '';

// // GitHub CLI ko aapka Token chahiye
// process.env.GH_TOKEN = process.env.GH_PAT; 
// const REPO_NAME = process.env.GITHUB_REPOSITORY; // e.g., "ibrahim/cric-bot"

// let consecutiveErrors = 0;

// // ⏱️ TIME FORMATTER
// function formatPKT() {
//     const now = new Date();
//     const displayTime = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
//     const parts = new Intl.DateTimeFormat('en-US', {
//         timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit'
//     }).formatToParts(now);
    
//     let h = parts.find(p => p.type === 'hour').value;
//     let m = parts.find(p => p.type === 'minute').value;
//     let ampm = parts.find(p => p.type === 'dayPeriod').value.toUpperCase();
    
//     const fileNameTime = `${h}_${m}_${ampm}`; // e.g., 06_45_PM
//     return { displayTime, fileNameTime };
// }

// // ==========================================
// // 🧹 PREPARE GITHUB RELEASES (AUTO-CLEANUP)
// // ==========================================
// function setupGitHubRelease() {
//     console.log(`\n[⚙️] GitHub Releases ki safai aur setup kar raha hoon...`);
//     try {
//         execSync(`gh release delete Live-Clips --cleanup-tag -y`, { stdio: 'ignore' });
//         console.log(`  [🧹] Purani release delete ho gayi.`);
//     } catch (e) {} 

//     try {
//         execSync(`gh release create Live-Clips --title "🔴 Live Cricket Clips" --notes "Yahan aapki current match ki videos aayengi."`, { stdio: 'ignore' });
//         console.log(`  [✅] Naya Release Box tayyar hai!`);
//     } catch (e) {
//         console.log(`  [⚠️] Release Box pehle se mojood hai.`);
//     }
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK (ONLY ONCE)
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon...`);
//     let browserArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'];

//     if (PROXY_IP && PROXY_PORT) browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);

//     const browser = await puppeteer.launch({ headless: true, args: browserArgs });
//     const page = await browser.newPage();

//     if (PROXY_USER && PROXY_PASS) await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = { url: url, ua: request.headers()['user-agent'] || '', cookie: request.headers()['cookie'] || '', referer: REFERER };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon (Proxy on)...`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) break;
//         }
//     } catch (e) { console.log(`[❌ ERROR] Page load nahi ho saka.`); }
    
//     await browser.close();
    
//     if (streamData) {
//         console.log(`[✅ BINGO] M3U8 Link mil gaya! Ab Proxy band, aur yahi link use hoga.`);
//         return streamData;
//     } else {
//         process.exit(1); 
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE (Updated for Audio)
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second MUTE Live Clip...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     let args1 = [
//         "-y", "-thread_queue_size", "1024", "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-filter_complex", `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`,
//         "-map", "[v_out]", "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30", "-an", rawLiveClip
//     ];

//     try {
//         spawnSync('ffmpeg', args1, { stdio: 'inherit' });
//         if (fs.existsSync(rawLiveClip)) {
//             console.log(`\n[🎬 Step 2] Merging Videos & Adding Global Audio...`);
            
//             let args2 = [
//                 "-y", 
//                 "-i", rawLiveClip,             
//                 "-i", "main_video.mp4",        
//                 "-stream_loop", "-1", "-i", "marya_live.mp3", 
                
//                 "-filter_complex", 
//                 "[0:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v1]; [v0][v1]concat=n=2:v=1:a=0[v_out]",
                
//                 "-map", "[v_out]",             
//                 "-map", "2:a",                 
//                 "-shortest",                   
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", 
//                 "-c:a", "aac", "-b:a", "128k", 
//                 finalMergedVideo
//             ];
//             spawnSync('ffmpeg', args2, { stdio: 'inherit' });
//             return fs.existsSync(finalMergedVideo);
//         }
//     } catch (e) { console.log(`[❌] Error: ${e.message}`); }
//     return false;
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     setupGitHubRelease(); 

//     let streamData = await getStreamData();
//     let clipCounter = 1;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) break;

//         const timeInfo = formatPKT();

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//         console.log(`${"-".repeat(50)}`);

//         const rawLiveClip = `raw_live.mp4`;
//         const videoName = `${VIDEO_TITLE}_Clip_${clipCounter}_${timeInfo.fileNameTime}_PKT.mp4`; 

//         const success = processVideo(streamData, rawLiveClip, videoName);

//         if (success) {
//             console.log(`\n[🚀 Upload] Video ko GitHub Releases mein daal raha hoon...`);
//             try {
//                 // Quotes shamil kar diye gaye hain taake special characters error na karein
//                 execSync(`gh release upload Live-Clips "${videoName}" --clobber`, { stdio: 'inherit' });
                
//                 const downloadLink = `https://github.com/${REPO_NAME}/releases/download/Live-Clips/${videoName}`;
                
//                 console.log(`\n=========================================================`);
//                 console.log(`🎉 VIDEO IS LIVE ON GITHUB RELEASES!`);
//                 console.log(`⏰ Time: ${timeInfo.displayTime} PKT`);
//                 console.log(`👉 Direct Download Link:`);
//                 console.log(`${downloadLink}`);
//                 console.log(`(Aap apne Mobile se repository ke 'Releases' tab mein ja kar bhi download kar sakte hain!)`);
//                 console.log(`=========================================================\n`);
                
//             } catch (e) {
//                 console.log(`[❌] Upload Failed: GitHub CLI Error.`);
//             }

//             // Cleanup Local Files
//             if (fs.existsSync(rawLiveClip)) fs.unlinkSync(rawLiveClip);
//             if (fs.existsSync(videoName)) fs.unlinkSync(videoName);
//             consecutiveErrors = 0;
//         } else {
//             console.log(`  [❌] Pipeline failed.`);
//             consecutiveErrors++;
            
//             if (consecutiveErrors >= 2) {
//                 console.log(`[⚠️] Lagta hai M3U8 link expire ho gaya hai. Dobara fetch kar raha hoon...`);
//                 streamData = await getStreamData();
//                 consecutiveErrors = 0;
//             }
//         }
        
//         console.log(`[⏳] 3 Minute ka wait kar raha hoon aglay clip ke liye...`);
//         await new Promise(r => setTimeout(r, 180000)); // 3 Minutes wait
//         clipCounter++;
//     }
// }

// main();





























// const puppeteer = require('puppeteer');
// const { spawnSync, execSync } = require('child_process');
// const fs = require('fs');

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (GITHUB RELEASES EDITION)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000; // 5 hours 50 mins limit

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// // 🛡️ PROXY SETTINGS
// const PROXY_IP = process.env.PROXY_IP || '';
// const PROXY_PORT = process.env.PROXY_PORT || '';
// const PROXY_USER = process.env.PROXY_USER || '';
// const PROXY_PASS = process.env.PROXY_PASS || '';

// // GitHub CLI ko aapka Token chahiye
// process.env.GH_TOKEN = process.env.GH_PAT; 
// const REPO_NAME = process.env.GITHUB_REPOSITORY; // e.g., "ibrahim/cric-bot"

// let consecutiveErrors = 0;

// // ⏱️ TIME FORMATTER (Updated for clear AM/PM)
// function formatPKT() {
//     const now = new Date();
//     // For console display
//     const displayTime = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
//     // For file name
//     const parts = new Intl.DateTimeFormat('en-US', {
//         timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit'
//     }).formatToParts(now);
    
//     let h = parts.find(p => p.type === 'hour').value;
//     let m = parts.find(p => p.type === 'minute').value;
//     let ampm = parts.find(p => p.type === 'dayPeriod').value.toUpperCase();
    
//     const fileNameTime = `${h}_${m}_${ampm}`; // e.g., 06_45_PM
//     return { displayTime, fileNameTime };
// }

// // ==========================================
// // 🧹 PREPARE GITHUB RELEASES (AUTO-CLEANUP)
// // ==========================================
// function setupGitHubRelease() {
//     console.log(`\n[⚙️] GitHub Releases ki safai aur setup kar raha hoon...`);
//     try {
//         execSync(`gh release delete Live-Clips --cleanup-tag -y`, { stdio: 'ignore' });
//         console.log(`  [🧹] Purani release delete ho gayi.`);
//     } catch (e) {} 

//     try {
//         execSync(`gh release create Live-Clips --title "🔴 Live Cricket Clips" --notes "Yahan aapki current match ki videos aayengi."`, { stdio: 'ignore' });
//         console.log(`  [✅] Naya Release Box tayyar hai!`);
//     } catch (e) {
//         console.log(`  [⚠️] Release Box pehle se mojood hai.`);
//     }
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK (ONLY ONCE)
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon...`);
//     let browserArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'];

//     if (PROXY_IP && PROXY_PORT) browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);

//     const browser = await puppeteer.launch({ headless: true, args: browserArgs });
//     const page = await browser.newPage();

//     if (PROXY_USER && PROXY_PASS) await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = { url: url, ua: request.headers()['user-agent'] || '', cookie: request.headers()['cookie'] || '', referer: REFERER };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon (Proxy on)...`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) break;
//         }
//     } catch (e) { console.log(`[❌ ERROR] Page load nahi ho saka.`); }
    
//     await browser.close();
    
//     if (streamData) {
//         console.log(`[✅ BINGO] M3U8 Link mil gaya! Ab Proxy band, aur yahi link use hoga.`);
//         return streamData;
//     } else {
//         process.exit(1); 
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE (Updated for Audio)
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second MUTE Live Clip...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     // Yahan humne audio (-i marya_live.mp3) nikal diya hai taake yeh clip completely MUTE ho
//     let args1 = [
//         "-y", "-thread_queue_size", "1024", "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-filter_complex", `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`,
//         "-map", "[v_out]", "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30", "-an", rawLiveClip
//     ];

//     try {
//         spawnSync('ffmpeg', args1, { stdio: 'inherit' });
//         if (fs.existsSync(rawLiveClip)) {
//             console.log(`\n[🎬 Step 2] Merging Videos & Adding Global Audio...`);
            
//             // Ab hum raw_live aur main_video ko mix kar rahe hain. 
//             // main_video ko humne explicitly mute kiya hai (uska audio input stream select nahi hoga)
//             // aur marya_live.mp3 ko as an audio loop laga diya hai puri output file par.
//             let args2 = [
//                 "-y", 
//                 "-i", rawLiveClip,             // Input 0 (Live clip mute)
//                 "-i", "main_video.mp4",        // Input 1 (Main video jiska audio humey ignore karna hai)
//                 "-stream_loop", "-1", "-i", "marya_live.mp3", // Input 2 (Yeh audio loop hoti rahegi)
                
//                 "-filter_complex", 
//                 "[0:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v1]; [v0][v1]concat=n=2:v=1:a=0[v_out]",
                
//                 "-map", "[v_out]",             // Merged video stream
//                 "-map", "2:a",                 // Input 2 wala marya audio
//                 "-shortest",                   // Audio utni der chalegi jitni der video hai
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", 
//                 "-c:a", "aac", "-b:a", "128k", 
//                 finalMergedVideo
//             ];
//             spawnSync('ffmpeg', args2, { stdio: 'inherit' });
//             return fs.existsSync(finalMergedVideo);
//         }
//     } catch (e) { console.log(`[❌] Error: ${e.message}`); }
//     return false;
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     setupGitHubRelease(); 

//     let streamData = await getStreamData();
//     let clipCounter = 1;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) break;

//         const timeInfo = formatPKT();

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//         console.log(`${"-".repeat(50)}`);

//         const rawLiveClip = `raw_live.mp4`;
//         const videoName = `Clip_${clipCounter}_${timeInfo.fileNameTime}_PKT.mp4`; 

//         const success = processVideo(streamData, rawLiveClip, videoName);

//         if (success) {
//             console.log(`\n[🚀 Upload] Video ko GitHub Releases mein daal raha hoon...`);
//             try {
//                 execSync(`gh release upload Live-Clips ${videoName} --clobber`, { stdio: 'inherit' });
                
//                 const downloadLink = `https://github.com/${REPO_NAME}/releases/download/Live-Clips/${videoName}`;
                
//                 console.log(`\n=========================================================`);
//                 console.log(`🎉 VIDEO IS LIVE ON GITHUB RELEASES!`);
//                 console.log(`⏰ Time: ${timeInfo.displayTime} PKT`);
//                 console.log(`👉 Direct Download Link:`);
//                 console.log(`${downloadLink}`);
//                 console.log(`(Aap apne Mobile se repository ke 'Releases' tab mein ja kar bhi download kar sakte hain!)`);
//                 console.log(`=========================================================\n`);
                
//             } catch (e) {
//                 console.log(`[❌] Upload Failed: GitHub CLI Error.`);
//             }

//             // Cleanup Local Files
//             if (fs.existsSync(rawLiveClip)) fs.unlinkSync(rawLiveClip);
//             if (fs.existsSync(videoName)) fs.unlinkSync(videoName);
//             consecutiveErrors = 0;
//         } else {
//             console.log(`  [❌] Pipeline failed.`);
//             consecutiveErrors++;
            
//             if (consecutiveErrors >= 2) {
//                 console.log(`[⚠️] Lagta hai M3U8 link expire ho gaya hai. Dobara fetch kar raha hoon...`);
//                 streamData = await getStreamData();
//                 consecutiveErrors = 0;
//             }
//         }
        
//         console.log(`[⏳] 3 Minute ka wait kar raha hoon aglay clip ke liye...`);
//         await new Promise(r => setTimeout(r, 180000)); // 3 Minutes wait
//         clipCounter++;
//     }
// }

// main();

















// const puppeteer = require('puppeteer');
// const { spawnSync, execSync } = require('child_process');
// const fs = require('fs');

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (GITHUB RELEASES EDITION)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000; // 5 hours 50 mins limit

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// // 🛡️ PROXY SETTINGS
// const PROXY_IP = process.env.PROXY_IP || '';
// const PROXY_PORT = process.env.PROXY_PORT || '';
// const PROXY_USER = process.env.PROXY_USER || '';
// const PROXY_PASS = process.env.PROXY_PASS || '';

// // GitHub CLI ko aapka Token chahiye
// process.env.GH_TOKEN = process.env.GH_PAT; 
// const REPO_NAME = process.env.GITHUB_REPOSITORY; // e.g., "ibrahim/cric-bot"

// let consecutiveLinkFails = 0;
// let consecutiveErrors = 0;

// // ⏱️ TIME FORMATTER
// function formatPKT() {
//     const now = new Date();
//     const displayTime = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
//     const fileNameTime = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit' }).replace(/:/g, '_').replace(/ /g, '_');
//     return { displayTime, fileNameTime };
// }

// // ==========================================
// // 🧹 PREPARE GITHUB RELEASES (AUTO-CLEANUP)
// // ==========================================
// function setupGitHubRelease() {
//     console.log(`\n[⚙️] GitHub Releases ki safai aur setup kar raha hoon...`);
//     try {
//         // Purani videos (kal ki) delete kar raha hai
//         execSync(`gh release delete Live-Clips --cleanup-tag -y`, { stdio: 'ignore' });
//         console.log(`  [🧹] Purani release delete ho gayi.`);
//     } catch (e) {} 

//     try {
//         // Nayi Release (Folder) bana raha hai
//         execSync(`gh release create Live-Clips --title "🔴 Live Cricket Clips" --notes "Yahan aapki current match ki videos aayengi."`, { stdio: 'ignore' });
//         console.log(`  [✅] Naya Release Box tayyar hai!`);
//     } catch (e) {
//         console.log(`  [⚠️] Release Box pehle se mojood hai.`);
//     }
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK (ONLY ONCE)
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon...`);
//     let browserArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'];

//     if (PROXY_IP && PROXY_PORT) browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);

//     const browser = await puppeteer.launch({ headless: true, args: browserArgs });
//     const page = await browser.newPage();

//     if (PROXY_USER && PROXY_PASS) await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = { url: url, ua: request.headers()['user-agent'] || '', cookie: request.headers()['cookie'] || '', referer: REFERER };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon (Proxy on)...`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) break;
//         }
//     } catch (e) { console.log(`[❌ ERROR] Page load nahi ho saka.`); }
    
//     await browser.close();
    
//     if (streamData) {
//         console.log(`[✅ BINGO] M3U8 Link mil gaya! Ab Proxy band, aur yahi link use hoga.`);
//         return streamData;
//     } else {
//         process.exit(1); 
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second Live Clip...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     let args1 = [
//         "-y", "-thread_queue_size", "1024", "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-thread_queue_size", "1024", "-stream_loop", "-1", "-i", "marya_live.mp3",
//         "-filter_complex", `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`,
//         "-map", "[v_out]", "-map", "2:a", "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30", "-c:a", "aac", "-b:a", "128k", rawLiveClip
//     ];

//     try {
//         spawnSync('ffmpeg', args1, { stdio: 'inherit' });
//         if (fs.existsSync(rawLiveClip)) {
//             console.log(`\n[🎬 Step 2] Merging Video...`);
//             let args2 = [
//                 "-y", "-i", rawLiveClip, "-i", "main_video.mp4",
//                 "-filter_complex", "[0:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v1]; [0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0]; [1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1]; [v0][a0][v1][a1]concat=n=2:v=1:a=1[v_out][a_out]",
//                 "-map", "[v_out]", "-map", "[a_out]",
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-c:a", "aac", "-b:a", "128k", finalMergedVideo
//             ];
//             spawnSync('ffmpeg', args2, { stdio: 'inherit' });
//             return fs.existsSync(finalMergedVideo);
//         }
//     } catch (e) { console.log(`[❌] Error: ${e.message}`); }
//     return false;
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     setupGitHubRelease(); // Shuru mein Release box tayyar karo

//     // M3U8 link sirf ek dafa nikale ga (Proxy bachat!)
//     let streamData = await getStreamData();
//     let clipCounter = 1;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) break;

//         const timeInfo = formatPKT();

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//         console.log(`${"-".repeat(50)}`);

//         const rawLiveClip = `raw_live.mp4`;
//         const videoName = `Clip_${clipCounter}_${timeInfo.fileNameTime}_PKT.mp4`; 

//         const success = processVideo(streamData, rawLiveClip, videoName);

//         if (success) {
//             console.log(`\n[🚀 Upload] Video ko GitHub Releases mein daal raha hoon...`);
//             try {
//                 // Video ko live GitHub Release mein upload kar raha hai
//                 execSync(`gh release upload Live-Clips ${videoName} --clobber`, { stdio: 'inherit' });
                
//                 const downloadLink = `https://github.com/${REPO_NAME}/releases/download/Live-Clips/${videoName}`;
                
//                 console.log(`\n=========================================================`);
//                 console.log(`🎉 VIDEO IS LIVE ON GITHUB RELEASES!`);
//                 console.log(`⏰ Time: ${timeInfo.displayTime} PKT`);
//                 console.log(`👉 Direct Download Link:`);
//                 console.log(`${downloadLink}`);
//                 console.log(`(Aap apne Mobile se repository ke 'Releases' tab mein ja kar bhi download kar sakte hain!)`);
//                 console.log(`=========================================================\n`);
                
//             } catch (e) {
//                 console.log(`[❌] Upload Failed: GitHub CLI Error.`);
//             }

//             // Cleanup Local Files
//             if (fs.existsSync(rawLiveClip)) fs.unlinkSync(rawLiveClip);
//             if (fs.existsSync(videoName)) fs.unlinkSync(videoName);
//             consecutiveErrors = 0;
//         } else {
//             console.log(`  [❌] Pipeline failed.`);
//             consecutiveErrors++;
            
//             // Agar M3U8 link expire ho gaya hai, toh naya link nikalay ga
//             if (consecutiveErrors >= 2) {
//                 console.log(`[⚠️] Lagta hai M3U8 link expire ho gaya hai. Dobara fetch kar raha hoon...`);
//                 streamData = await getStreamData();
//                 consecutiveErrors = 0;
//             }
//         }
        
//         console.log(`[⏳] 3 Minute ka wait kar raha hoon aglay clip ke liye...`);
//         await new Promise(r => setTimeout(r, 180000)); // 3 Minutes wait
//         clipCounter++;
//     }
// }

// main();































// const puppeteer = require('puppeteer');
// const { spawnSync } = require('child_process');
// const fs = require('fs');

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (GITHUB ARTIFACT EDITION)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const RESTART_TRIGGER_MS = (5 * 60 * 60 + 30 * 60) * 1000; // 5.5 Hours
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000;

// const TITLES_INPUT = process.env.TITLES_LIST || 'Live Match Today';
// const DESCS_INPUT = process.env.DESCS_LIST || 'Watch the live action here';
// const HASHTAGS = process.env.HASHTAGS || '#CricketLive #MatchToday';

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// // 🛡️ PROXY SETTINGS
// const PROXY_IP = process.env.PROXY_IP || '';
// const PROXY_PORT = process.env.PROXY_PORT || '';
// const PROXY_USER = process.env.PROXY_USER || '';
// const PROXY_PASS = process.env.PROXY_PASS || '';

// let consecutiveLinkFails = 0;
// let consecutiveErrors = 0;

// function formatPKT(timestampMs = Date.now()) {
//     return new Date(timestampMs).toLocaleString('en-US', {
//         timeZone: 'Asia/Karachi', hour12: true, year: 'numeric', month: 'short',
//         day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
//     }) + " PKT";
// }

// // Artifacts Folder Banana
// const artifactDir = './artifacts';
// if (!fs.existsSync(artifactDir)){
//     fs.mkdirSync(artifactDir);
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK (SMART CHECK + PROXY)
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon... (Strike: ${consecutiveLinkFails}/3)`);
    
//     let browserArgs = [
//         '--no-sandbox', 
//         '--disable-setuid-sandbox', 
//         '--disable-blink-features=AutomationControlled', 
//         '--mute-audio', 
//         '--disable-dev-shm-usage'
//     ];

//     if (PROXY_IP && PROXY_PORT) {
//         console.log(`[🛡️ Proxy] Using Proxy: ${PROXY_IP}:${PROXY_PORT}`);
//         browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);
//     } else {
//         console.log(`[⚠️ Proxy] No Proxy settings found. Running on direct IP.`);
//     }

//     const browser = await puppeteer.launch({ headless: true, args: browserArgs });
//     const page = await browser.newPage();

//     if (PROXY_USER && PROXY_PASS) {
//         await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
//     }

//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = {
//                 url: url,
//                 ua: request.headers()['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
//                 cookie: request.headers()['cookie'] || '',
//                 referer: REFERER
//             };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon: ${TARGET_WEBSITE}`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
        
//         console.log(`[⏳] M3U8 Link ka intezar hai... (5 Second ke 3 Rounds)`);
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) {
//                 console.log(`[✅] Round ${i} mein link mil gaya! Aage barh raha hoon...`);
//                 break;
//             } else {
//                 console.log(`[⚠️] Round ${i}/3: Abhi tak link nahi mila...`);
//             }
//         }
//     } catch (e) { 
//         console.log(`[❌ ERROR] Page load nahi ho saka.`); 
//     }
    
//     await browser.close();

//     if (streamData) {
//         consecutiveLinkFails = 0; 
//         console.log(`[✅ BINGO] M3U8 Link pakar liya gaya!`);
//         return streamData;
//     } else {
//         consecutiveLinkFails++;
//         console.log(`[🚨 WARNING] Link nahi mila. Strike: ${consecutiveLinkFails}/3`);
//         if (consecutiveLinkFails >= 3) {
//             console.log(`[🛑 FATAL] 3 baar consecutive link fail! Bot band kar raha hoon.`);
//             process.exit(1); 
//         }
//         return null;
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE (TEXT + BLUR + MERGE)
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second Live Clip with FULL Blur and Text...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     let args1 = [
//         "-y", "-thread_queue_size", "1024",
//         "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-thread_queue_size", "1024", "-stream_loop", "-1", "-i", "marya_live.mp3"
//     ];

//     let filterComplex1 = `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`;

//     args1.push(
//         "-filter_complex", filterComplex1,
//         "-map", "[v_out]", "-map", "2:a",
//         "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30",
//         "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
//         rawLiveClip
//     );

//     try {
//         console.log(`[>] Running FFmpeg Phase A (Capture & Edit)...`);
//         spawnSync('ffmpeg', args1, { stdio: 'inherit' });

//         if (fs.existsSync(rawLiveClip) && fs.statSync(rawLiveClip).size > 1000) {
//             console.log(`[✅] Live clip successfully created.`);
            
//             console.log(`\n[🎬 Step 2] Merging Live Clip with 'main_video.mp4' (Syncing Resolution & FPS)...`);
            
//             let args2 = [
//                 "-y",
//                 "-i", rawLiveClip,
//                 "-i", "main_video.mp4",
//                 "-filter_complex",
//                 "[0:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v1]; [0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0]; [1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1]; [v0][a0][v1][a1]concat=n=2:v=1:a=1[v_out][a_out]",
//                 "-map", "[v_out]", "-map", "[a_out]",
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k",
//                 "-c:a", "aac", "-b:a", "128k",
//                 finalMergedVideo
//             ];

//             console.log(`[>] Running FFmpeg Phase B (Merging)...`);
//             spawnSync('ffmpeg', args2, { stdio: 'inherit' });

//             if (fs.existsSync(finalMergedVideo) && fs.statSync(finalMergedVideo).size > 1000) {
//                 console.log(`[✅] Merge Successful! Final Video is ready.`);
//                 return true;
//             }
//         }
//     } catch (e) {
//         console.log(`[❌] FFmpeg Engine crashed: ${e.message}`);
//     }
//     return false;
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     const requiredFiles = ["website_frame.png", "marya_live.mp3", "main_video.mp4"];
//     for (let f of requiredFiles) {
//         if (!fs.existsSync(f)) {
//             console.log(`[🛑 Error] '${f}' file missing! Pehle isay upload karein.`);
//             return;
//         }
//     }

//     let clipCounter = 1;

//     // Is loop ko hum filhal 1 cycle ke liye chalayenge (kyunke agar yeh lambi chali toh GitHub action end hone ka wait karna parega video lene ke liye)
//     // Aap isay baad mein change kar sakte hain.
//     const elapsedTimeMs = Date.now() - START_TIME;

//     console.log(`\n${"-".repeat(50)}`);
//     console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//     console.log(`${"-".repeat(50)}`);

//     let data = await getStreamData();
//     if (!data) {
//         console.log(`[❌] Data nahi mila. Exit.`);
//         process.exit(1);
//     }
    
//     const rawLiveClip = `raw_live_${clipCounter}.mp4`;
//     // Final video ko seedha Artifacts folder mein save karenge
//     const finalMergedVideo = `${artifactDir}/ready_clip_${clipCounter}.mp4`; 

//     const success = processVideo(data, rawLiveClip, finalMergedVideo);

//     if (success) {
//         console.log(`\n=========================================================`);
//         console.log(`🎉 VIDEO #${clipCounter} IS SUCCESSFULLY SAVED TO GITHUB ARTIFACTS!`);
//         console.log(`👉 Is console (log) ke bilkul neechay (Summary tab mein) "rendered-cricket-clips" par click karke download karein.`);
//         console.log(`(⚠️ Yeh video 1 din baad automatically delete ho jayegi)`);
//         console.log(`=========================================================\n`);
        
//         // Cleanup Temporary File
//         if (fs.existsSync(rawLiveClip)) { fs.unlinkSync(rawLiveClip); }
//     } else {
//         console.log(`  [❌] Pipeline failed.`);
//     }
    
//     console.log(`[✅] Action Mukammal. Ab aap video download kar sakte hain!`);
//     process.exit(0); // Foran band karo taake artifact available ho jaye
// }

// // Start Factory
// main();































// const puppeteer = require('puppeteer');
// const { spawnSync } = require('child_process');
// const fs = require('fs');
// const FormData = require('form-data');
// const axios = require('axios');

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (FILE.IO + PROXY)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const RESTART_TRIGGER_MS = (5 * 60 * 60 + 30 * 60) * 1000; // 5.5 Hours
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000;

// const BRIDGE_ID = "criclive_ibrahim_bridge_786";

// const TITLES_INPUT = process.env.TITLES_LIST || 'Live Match Today';
// const DESCS_INPUT = process.env.DESCS_LIST || 'Watch the live action here';
// const HASHTAGS = process.env.HASHTAGS || '#CricketLive #MatchToday';

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// // 🛡️ PROXY SETTINGS
// const PROXY_IP = process.env.PROXY_IP || '';
// const PROXY_PORT = process.env.PROXY_PORT || '';
// const PROXY_USER = process.env.PROXY_USER || '';
// const PROXY_PASS = process.env.PROXY_PASS || '';

// let consecutiveLinkFails = 0;
// let consecutiveErrors = 0;

// function formatPKT(timestampMs = Date.now()) {
//     return new Date(timestampMs).toLocaleString('en-US', {
//         timeZone: 'Asia/Karachi', hour12: true, year: 'numeric', month: 'short',
//         day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
//     }) + " PKT";
// }

// // ==========================================
// // 🧠 ANTI-SPAM METADATA
// // ==========================================
// function generateUniqueMetadata(clipNum) {
//     const titles = TITLES_INPUT.split(',,').map(t => t.trim()).filter(t => t);
//     const descs = DESCS_INPUT.split(',,').map(d => d.trim()).filter(d => d);
    
//     const title = titles.length ? titles[Math.floor(Math.random() * titles.length)] : "Live Match Today";
//     const descBody = descs.length ? descs[Math.floor(Math.random() * descs.length)] : "Watch the live action here!";
    
//     const emojis = ["🔥", "🏏", "⚡", "🏆", "💥", "📺"].sort(() => 0.5 - Math.random()).slice(0, 3);
//     const tags = HASHTAGS.split(' ').sort(() => 0.5 - Math.random()).slice(0, 4).join(' ');
    
//     const caption = `${title} ${emojis.join(' ')}\n\n${descBody}\n\nClip #${clipNum}\n\n${tags}`;
//     return caption;
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK (SMART CHECK + PROXY)
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon... (Strike: ${consecutiveLinkFails}/3)`);
    
//     let browserArgs = [
//         '--no-sandbox', 
//         '--disable-setuid-sandbox', 
//         '--disable-blink-features=AutomationControlled', 
//         '--mute-audio', 
//         '--disable-dev-shm-usage'
//     ];

//     if (PROXY_IP && PROXY_PORT) {
//         console.log(`[🛡️ Proxy] Using Proxy: ${PROXY_IP}:${PROXY_PORT}`);
//         browserArgs.push(`--proxy-server=http://${PROXY_IP}:${PROXY_PORT}`);
//     } else {
//         console.log(`[⚠️ Proxy] No Proxy settings found. Running on direct IP.`);
//     }

//     const browser = await puppeteer.launch({ headless: true, args: browserArgs });
//     const page = await browser.newPage();

//     if (PROXY_USER && PROXY_PASS) {
//         await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
//     }

//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = {
//                 url: url,
//                 ua: request.headers()['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
//                 cookie: request.headers()['cookie'] || '',
//                 referer: REFERER
//             };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon: ${TARGET_WEBSITE}`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
        
//         console.log(`[⏳] M3U8 Link ka intezar hai... (5 Second ke 3 Rounds)`);
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) {
//                 console.log(`[✅] Round ${i} mein link mil gaya! Aage barh raha hoon...`);
//                 break;
//             } else {
//                 console.log(`[⚠️] Round ${i}/3: Abhi tak link nahi mila...`);
//             }
//         }
//     } catch (e) { 
//         console.log(`[❌ ERROR] Page load nahi ho saka.`); 
//     }
    
//     await browser.close();

//     if (streamData) {
//         consecutiveLinkFails = 0; 
//         console.log(`[✅ BINGO] M3U8 Link pakar liya gaya!`);
//         return streamData;
//     } else {
//         consecutiveLinkFails++;
//         console.log(`[🚨 WARNING] Link nahi mila. Strike: ${consecutiveLinkFails}/3`);
//         if (consecutiveLinkFails >= 3) {
//             console.log(`[🛑 FATAL] 3 baar consecutive link fail! Bot band kar raha hoon.`);
//             process.exit(1); 
//         }
//         return null;
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE (TEXT + BLUR + MERGE)
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second Live Clip with FULL Blur and Text...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     let args1 = [
//         "-y", "-thread_queue_size", "1024",
//         "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-thread_queue_size", "1024", "-stream_loop", "-1", "-i", "marya_live.mp3"
//     ];

//     let filterComplex1 = `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`;

//     args1.push(
//         "-filter_complex", filterComplex1,
//         "-map", "[v_out]", "-map", "2:a",
//         "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30",
//         "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
//         rawLiveClip
//     );

//     try {
//         console.log(`[>] Running FFmpeg Phase A (Capture & Edit)...`);
//         const resA = spawnSync('ffmpeg', args1, { stdio: 'pipe' });
//         if (resA.status !== 0) console.log(`[❌] Phase A Error:\n${resA.stderr.toString()}`);

//         if (fs.existsSync(rawLiveClip) && fs.statSync(rawLiveClip).size > 1000) {
//             console.log(`[✅] Live clip successfully created.`);
            
//             console.log(`\n[🎬 Step 2] Merging Live Clip with 'main_video.mp4' (Syncing Resolution & FPS)...`);
            
//             let args2 = [
//                 "-y",
//                 "-i", rawLiveClip,
//                 "-i", "main_video.mp4",
//                 "-filter_complex",
//                 "[0:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v1]; [0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0]; [1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1]; [v0][a0][v1][a1]concat=n=2:v=1:a=1[v_out][a_out]",
//                 "-map", "[v_out]", "-map", "[a_out]",
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k",
//                 "-c:a", "aac", "-b:a", "128k",
//                 finalMergedVideo
//             ];

//             console.log(`[>] Running FFmpeg Phase B (Merging)...`);
//             const resB = spawnSync('ffmpeg', args2, { stdio: 'pipe' });
//             if (resB.status !== 0) console.log(`[❌] Phase B Error:\n${resB.stderr.toString()}`);

//             if (fs.existsSync(finalMergedVideo) && fs.statSync(finalMergedVideo).size > 1000) {
//                 console.log(`[✅] Merge Successful! Final Video is ready.`);
//                 return true;
//             }
//         }
//     } catch (e) {
//         console.log(`[❌] FFmpeg Engine crashed: ${e.message}`);
//     }
//     return false;
// }

// // ==========================================
// // 📤 FILE.IO (DIRECT LINK & AUTO-DELETE SYSTEM)
// // ==========================================
// // ==========================================
// // 📤 FILE.IO (ULTIMATE CURL UPLOADER - 100% FIX)
// // ==========================================
// async function uploadAndPrintLink(videoPath, caption, clipCounter) {
//     console.log(`\n[🚀 Upload] Video ko File.io (Auto-Delete Server) par bhej raha hoon...`);
//     try {
//         console.log(`  [>] Uploading via CURL Bypass... (Please wait)`);
        
//         // 🛠️ FIX: Axios ko hata kar CURL use kar rahe hain taake HTML error na aaye
//         const curlCmd = `curl -s -F "file=@${videoPath}" https://file.io`;
//         const responseText = execSync(curlCmd, { encoding: 'utf8' }).trim();
        
//         // Response ko JSON mein convert karna
//         let resData;
//         try {
//             resData = JSON.parse(responseText);
//         } catch (err) {
//             console.log(`  [❌] File.io ne JSON ke bajaye kuch aur bhej diya:`, responseText.substring(0, 200));
//             return false;
//         }

//         if (resData && resData.success) {
//             const downloadLink = resData.link;

//             console.log(`\n=========================================================`);
//             console.log(`🎉 VIDEO #${clipCounter} IS READY!`);
//             console.log(`📥 Mobile me Download karne ke liye is link par click karein:`);
//             console.log(`👉  ${downloadLink}  👈`);
//             console.log(`(⚠️ NOTE: Yeh link sirf 1 dafa chalega. Download hote hi video server se delete ho jayegi!)`);
//             console.log(`=========================================================\n`);

//             console.log(`  [>] Mobile par Ntfy notification bhej raha hoon...`);
//             const message = `🎬 Clip #${clipCounter} Ready!\n\n${caption}\n\n📥 Download Link (Click to save):\n${downloadLink}`;
            
//             await axios.post(`https://ntfy.sh/${BRIDGE_ID}`, message, {
//                 headers: { 'Content-Type': 'text/plain' }
//             });
//             console.log(`  [✅] Notification Bhej Diya Gaya!`);

//             return true;
//         } else {
//             console.log(`  [❌] File.io Upload Failed. JSON Response:`, resData);
//             return false;
//         }
//     } catch (e) {
//         console.log(`  [❌] File.io Error: ${e.message}`);
//         return false;
//     }
// }

// // ==========================================
// // 🔄 GITHUB AUTO-RESTART
// // ==========================================
// async function triggerNextRun() {
//     console.log(`\n[🔄 AUTO-RESTART] Relay Race: Naya GitHub Action trigger kar raha hoon...`);
//     const token = process.env.GH_PAT;
//     const repo = process.env.GITHUB_REPOSITORY;
//     const branch = process.env.GITHUB_REF_NAME || 'main';
//     if (!token || !repo) return;
//     try {
//         await axios.post(`https://api.github.com/repos/${repo}/actions/workflows/ghost_loop.yml/dispatches`, {
//             ref: branch, inputs: { target_url: TARGET_WEBSITE, titles_list: TITLES_INPUT, descs_list: DESCS_INPUT, hashtags: HASHTAGS }
//         }, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } });
//         console.log(`[✅] Naya Bot background mein start ho gaya!`);
//     } catch (e) { console.log(`[❌] Relay Race Trigger failed!`); }
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     const requiredFiles = ["website_frame.png", "marya_live.mp3", "main_video.mp4"];
//     for (let f of requiredFiles) {
//         if (!fs.existsSync(f)) {
//             console.log(`[🛑 Error] '${f}' file missing! Pehle isay upload karein.`);
//             return;
//         }
//     }

//     let clipCounter = 1;
//     let nextRunTriggered = false;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) {
//             console.log(`\n[🛑 System] Max Lifetime Reached (6 Hours). Graceful exit.`);
//             break;
//         }

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//         console.log(`  [-] Bot Uptime: ${Math.floor(elapsedTimeMs / 60000)} minutes`);
//         console.log(`${"-".repeat(50)}`);

//         if (elapsedTimeMs > RESTART_TRIGGER_MS && !nextRunTriggered) { 
//             await triggerNextRun(); 
//             nextRunTriggered = true; 
//         }

//         let data = await getStreamData();
//         if (!data) {
//             consecutiveErrors++;
//             if (consecutiveErrors >= 3) break;
//             await new Promise(r => setTimeout(r, 30000));
//             continue;
//         }
        
//         consecutiveErrors = 0;
//         const rawLiveClip = `raw_live_${clipCounter}.mp4`;
//         const finalMergedVideo = `ready_clip_${clipCounter}.mp4`;
//         const caption = generateUniqueMetadata(clipCounter);

//         const success = processVideo(data, rawLiveClip, finalMergedVideo);

//         if (success) {
//             await uploadAndPrintLink(finalMergedVideo, caption, clipCounter);
            
//             // Cleanup Temporary Files
//             [rawLiveClip, finalMergedVideo].forEach(f => {
//                 if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`  [🧹] Deleted: ${f}`); }
//             });
//         } else {
//             console.log(`  [❌] Pipeline failed for Cycle #${clipCounter}.`);
//         }

//         const waitSeconds = Math.floor(Math.random() * (700 - 500 + 1)) + 500;
//         console.log(`\n[⏳ Cycle End] Waiting ${Math.floor(waitSeconds/60)} minutes before next round...`);
//         await new Promise(r => setTimeout(r, waitSeconds * 1000));
//         clipCounter++;
//     }
// }

// // Start Factory
// main();
































// const puppeteer = require('puppeteer');
// const { spawnSync } = require('child_process');
// const fs = require('fs');
// const FormData = require('form-data');
// const axios = require('axios');

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (FILE.IO EDITION)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const START_TIME = Date.now();
// const RESTART_TRIGGER_MS = (5 * 60 * 60 + 30 * 60) * 1000; // 5.5 Hours
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000;

// const BRIDGE_ID = "criclive_ibrahim_bridge_786";

// const TITLES_INPUT = process.env.TITLES_LIST || 'Live Match Today';
// const DESCS_INPUT = process.env.DESCS_LIST || 'Watch the live action here';
// const HASHTAGS = process.env.HASHTAGS || '#CricketLive #MatchToday';

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// let consecutiveLinkFails = 0;
// let consecutiveErrors = 0;

// function formatPKT(timestampMs = Date.now()) {
//     return new Date(timestampMs).toLocaleString('en-US', {
//         timeZone: 'Asia/Karachi', hour12: true, year: 'numeric', month: 'short',
//         day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
//     }) + " PKT";
// }

// // ==========================================
// // 🧠 ANTI-SPAM METADATA
// // ==========================================
// function generateUniqueMetadata(clipNum) {
//     const titles = TITLES_INPUT.split(',,').map(t => t.trim()).filter(t => t);
//     const descs = DESCS_INPUT.split(',,').map(d => d.trim()).filter(d => d);
    
//     const title = titles.length ? titles[Math.floor(Math.random() * titles.length)] : "Live Match Today";
//     const descBody = descs.length ? descs[Math.floor(Math.random() * descs.length)] : "Watch the live action here!";
    
//     const emojis = ["🔥", "🏏", "⚡", "🏆", "💥", "📺"].sort(() => 0.5 - Math.random()).slice(0, 3);
//     const tags = HASHTAGS.split(' ').sort(() => 0.5 - Math.random()).slice(0, 4).join(' ');
    
//     const caption = `${title} ${emojis.join(' ')}\n\n${descBody}\n\nClip #${clipNum}\n\n${tags}`;
//     return caption;
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK (SMART CHECK)
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon... (Strike: ${consecutiveLinkFails}/3)`);
//     const browser = await puppeteer.launch({ 
//         headless: true, 
//         args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'] 
//     });
//     const page = await browser.newPage();
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = {
//                 url: url,
//                 ua: request.headers()['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
//                 cookie: request.headers()['cookie'] || '',
//                 referer: REFERER
//             };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon: ${TARGET_WEBSITE}`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
        
//         console.log(`[⏳] M3U8 Link ka intezar hai... (5 Second ke 3 Rounds)`);
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) {
//                 console.log(`[✅] Round ${i} mein link mil gaya! Aage barh raha hoon...`);
//                 break;
//             } else {
//                 console.log(`[⚠️] Round ${i}/3: Abhi tak link nahi mila...`);
//             }
//         }
//     } catch (e) { 
//         console.log(`[❌ ERROR] Page load nahi ho saka.`); 
//     }
    
//     await browser.close();

//     if (streamData) {
//         consecutiveLinkFails = 0; 
//         console.log(`[✅ BINGO] M3U8 Link pakar liya gaya!`);
//         return streamData;
//     } else {
//         consecutiveLinkFails++;
//         console.log(`[🚨 WARNING] Link nahi mila. Strike: ${consecutiveLinkFails}/3`);
//         if (consecutiveLinkFails >= 3) {
//             console.log(`[🛑 FATAL] 3 baar consecutive link fail! Bot band kar raha hoon.`);
//             process.exit(1); 
//         }
//         return null;
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE (TEXT + BLUR + MERGE)
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second Live Clip with FULL Blur and Text...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
    
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     let args1 = [
//         "-y", "-thread_queue_size", "1024",
//         "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-thread_queue_size", "1024", "-stream_loop", "-1", "-i", "marya_live.mp3"
//     ];

//     let filterComplex1 = `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`;

//     args1.push(
//         "-filter_complex", filterComplex1,
//         "-map", "[v_out]", "-map", "2:a",
//         "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30",
//         "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
//         rawLiveClip
//     );

//     try {
//         console.log(`[>] Running FFmpeg Phase A (Capture & Edit)...`);
//         const resA = spawnSync('ffmpeg', args1, { stdio: 'pipe' });
//         if (resA.status !== 0) console.log(`[❌] Phase A Error:\n${resA.stderr.toString()}`);

//         if (fs.existsSync(rawLiveClip) && fs.statSync(rawLiveClip).size > 1000) {
//             console.log(`[✅] Live clip successfully created.`);
            
//             console.log(`\n[🎬 Step 2] Merging Live Clip with 'main_video.mp4' (Syncing Resolution & FPS)...`);
            
//             let args2 = [
//                 "-y",
//                 "-i", rawLiveClip,
//                 "-i", "main_video.mp4",
//                 "-filter_complex",
//                 "[0:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v1]; [0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0]; [1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1]; [v0][a0][v1][a1]concat=n=2:v=1:a=1[v_out][a_out]",
//                 "-map", "[v_out]", "-map", "[a_out]",
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k",
//                 "-c:a", "aac", "-b:a", "128k",
//                 finalMergedVideo
//             ];

//             console.log(`[>] Running FFmpeg Phase B (Merging)...`);
//             const resB = spawnSync('ffmpeg', args2, { stdio: 'pipe' });
//             if (resB.status !== 0) console.log(`[❌] Phase B Error:\n${resB.stderr.toString()}`);

//             if (fs.existsSync(finalMergedVideo) && fs.statSync(finalMergedVideo).size > 1000) {
//                 console.log(`[✅] Merge Successful! Final Video is ready.`);
//                 return true;
//             }
//         }
//     } catch (e) {
//         console.log(`[❌] FFmpeg Engine crashed: ${e.message}`);
//     }
//     return false;
// }

// // ==========================================
// // 📤 FILE.IO (DIRECT LINK & AUTO-DELETE SYSTEM)
// // ==========================================
// async function uploadAndPrintLink(videoPath, caption, clipCounter) {
//     console.log(`\n[🚀 Upload] Video ko File.io (Auto-Delete Server) par bhej raha hoon...`);
//     try {
//         const form = new FormData();
//         form.append('file', fs.createReadStream(videoPath));

//         console.log(`  [>] Uploading... (Please wait)`);
//         const res = await axios.post("https://file.io", form, {
//             headers: form.getHeaders(),
//             maxBodyLength: Infinity,
//             maxContentLength: Infinity
//         });

//         if (res.data && res.data.success) {
//             const downloadLink = res.data.link;

//             // 🎯 GITHUB CONSOLE MEIN BARA BARA PRINT KARNA
//             console.log(`\n=========================================================`);
//             console.log(`🎉 VIDEO #${clipCounter} IS READY!`);
//             console.log(`📥 Mobile me Download karne ke liye is link par click karein:`);
//             console.log(`👉  ${downloadLink}  👈`);
//             console.log(`(⚠️ NOTE: Yeh link sirf 1 dafa chalega. Download hote hi video server se delete ho jayegi!)`);
//             console.log(`=========================================================\n`);

//             // 📱 SATH HI SATH NTFY PAR BHI BHEJ DEIN
//             console.log(`  [>] Mobile par Ntfy notification bhej raha hoon...`);
//             const message = `🎬 Clip #${clipCounter} Ready!\n\n${caption}\n\n📥 Download Link (Click to save):\n${downloadLink}`;
            
//             await axios.post(`https://ntfy.sh/${BRIDGE_ID}`, message, {
//                 headers: { 'Content-Type': 'text/plain' }
//             });
//             console.log(`  [✅] Notification Bhej Diya Gaya!`);

//             return true;
//         } else {
//             console.log(`  [❌] File.io Upload Failed. Response:`, res.data);
//             return false;
//         }
//     } catch (e) {
//         console.log(`  [❌] File.io Error: ${e.message}`);
//         return false;
//     }
// }

// // ==========================================
// // 🔄 GITHUB AUTO-RESTART
// // ==========================================
// async function triggerNextRun() {
//     console.log(`\n[🔄 AUTO-RESTART] Relay Race: Naya GitHub Action trigger kar raha hoon...`);
//     const token = process.env.GH_PAT;
//     const repo = process.env.GITHUB_REPOSITORY;
//     const branch = process.env.GITHUB_REF_NAME || 'main';
//     if (!token || !repo) return;
//     try {
//         await axios.post(`https://api.github.com/repos/${repo}/actions/workflows/ghost_loop.yml/dispatches`, {
//             ref: branch, inputs: { target_url: TARGET_WEBSITE, titles_list: TITLES_INPUT, descs_list: DESCS_INPUT, hashtags: HASHTAGS }
//         }, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } });
//         console.log(`[✅] Naya Bot background mein start ho gaya!`);
//     } catch (e) { console.log(`[❌] Relay Race Trigger failed!`); }
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     const requiredFiles = ["website_frame.png", "marya_live.mp3", "main_video.mp4"];
//     for (let f of requiredFiles) {
//         if (!fs.existsSync(f)) {
//             console.log(`[🛑 Error] '${f}' file missing! Pehle isay upload karein.`);
//             return;
//         }
//     }

//     let clipCounter = 1;
//     let nextRunTriggered = false;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) {
//             console.log(`\n[🛑 System] Max Lifetime Reached (6 Hours). Graceful exit.`);
//             break;
//         }

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//         console.log(`  [-] Bot Uptime: ${Math.floor(elapsedTimeMs / 60000)} minutes`);
//         console.log(`${"-".repeat(50)}`);

//         if (elapsedTimeMs > RESTART_TRIGGER_MS && !nextRunTriggered) { 
//             await triggerNextRun(); 
//             nextRunTriggered = true; 
//         }

//         let data = await getStreamData();
//         if (!data) {
//             consecutiveErrors++;
//             if (consecutiveErrors >= 3) break;
//             await new Promise(r => setTimeout(r, 30000));
//             continue;
//         }
        
//         consecutiveErrors = 0;
//         const rawLiveClip = `raw_live_${clipCounter}.mp4`;
//         const finalMergedVideo = `ready_clip_${clipCounter}.mp4`;
//         const caption = generateUniqueMetadata(clipCounter);

//         const success = processVideo(data, rawLiveClip, finalMergedVideo);

//         if (success) {
//             // 🚀 YAHAN DIRECT LINK GENERATOR CALL HO RAHA HAI
//             await uploadAndPrintLink(finalMergedVideo, caption, clipCounter);
            
//             // Cleanup Temporary Files
//             [rawLiveClip, finalMergedVideo].forEach(f => {
//                 if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`  [🧹] Deleted: ${f}`); }
//             });
//         } else {
//             console.log(`  [❌] Pipeline failed for Cycle #${clipCounter}.`);
//         }

//         // Wait 8 to 11 minutes (500-700 seconds) before next clip
//         const waitSeconds = Math.floor(Math.random() * (700 - 500 + 1)) + 500;
//         console.log(`\n[⏳ Cycle End] Waiting ${Math.floor(waitSeconds/60)} minutes before next round...`);
//         await new Promise(r => setTimeout(r, waitSeconds * 1000));
//         clipCounter++;
//     }
// }

// // Start Factory
// main();










// ======================= all done , bas video uplaod give me error ===================


// const puppeteer = require('puppeteer');
// const { spawnSync } = require('child_process');
// const fs = require('fs');
// const FormData = require('form-data');
// const axios = require('axios');

// console.log("\n" + "=".repeat(50));
// console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (GHOST BRIDGE)");
// console.log("=".repeat(50));

// // ==========================================
// // ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// // ==========================================
// const PKT_OFFSET = 5 * 60 * 60 * 1000;
// const START_TIME = Date.now();
// const RESTART_TRIGGER_MS = (5 * 60 * 60 + 30 * 60) * 1000; // 5.5 Hours
// const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000;

// const BRIDGE_ID = "criclive_ibrahim_bridge_786";

// const TITLES_INPUT = process.env.TITLES_LIST || 'Live Match Today';
// const DESCS_INPUT = process.env.DESCS_LIST || 'Watch the live action here';
// const HASHTAGS = process.env.HASHTAGS || '#CricketLive #MatchToday';

// const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
// const REFERER = "https://bhalocast.com/";

// let consecutiveLinkFails = 0;
// let consecutiveErrors = 0;

// function formatPKT(timestampMs = Date.now()) {
//     return new Date(timestampMs).toLocaleString('en-US', {
//         timeZone: 'Asia/Karachi', hour12: true, year: 'numeric', month: 'short',
//         day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
//     }) + " PKT";
// }

// // ==========================================
// // 🧠 ANTI-SPAM METADATA
// // ==========================================
// function generateUniqueMetadata(clipNum) {
//     const titles = TITLES_INPUT.split(',,').map(t => t.trim()).filter(t => t);
//     const descs = DESCS_INPUT.split(',,').map(d => d.trim()).filter(d => d);
    
//     const title = titles.length ? titles[Math.floor(Math.random() * titles.length)] : "Live Match Today";
//     const descBody = descs.length ? descs[Math.floor(Math.random() * descs.length)] : "Watch the live action here!";
    
//     const emojis = ["🔥", "🏏", "⚡", "🏆", "💥", "📺"].sort(() => 0.5 - Math.random()).slice(0, 3);
//     const tags = HASHTAGS.split(' ').sort(() => 0.5 - Math.random()).slice(0, 4).join(' ');
    
//     const caption = `${title} ${emojis.join(' ')}\n\n${descBody}\n\nClip #${clipNum}\n\n${tags}`;
//     return caption;
// }

// // ==========================================
// // 🔍 WORKER 0: GET M3U8 LINK (SMART CHECK)
// // ==========================================
// async function getStreamData() {
//     console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon... (Strike: ${consecutiveLinkFails}/3)`);
//     const browser = await puppeteer.launch({ 
//         headless: true, 
//         args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'] 
//     });
//     const page = await browser.newPage();
//     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

//     let streamData = null;
//     page.on('request', (request) => {
//         const url = request.url();
//         if (url.includes('.m3u8')) {
//             streamData = {
//                 url: url,
//                 ua: request.headers()['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
//                 cookie: request.headers()['cookie'] || '',
//                 referer: REFERER
//             };
//         }
//     });

//     try {
//         console.log(`[🌐] Target URL par ja raha hoon: ${TARGET_WEBSITE}`);
//         await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
//         await page.click('body').catch(() => {});
        
//         console.log(`[⏳] M3U8 Link ka intezar hai... (5 Second ke 3 Rounds)`);
//         for (let i = 1; i <= 3; i++) {
//             await new Promise(r => setTimeout(r, 5000));
//             if (streamData) {
//                 console.log(`[✅] Round ${i} mein link mil gaya! Aage barh raha hoon...`);
//                 break;
//             } else {
//                 console.log(`[⚠️] Round ${i}/3: Abhi tak link nahi mila...`);
//             }
//         }
//     } catch (e) { 
//         console.log(`[❌ ERROR] Page load nahi ho saka.`); 
//     }
    
//     await browser.close();

//     if (streamData) {
//         consecutiveLinkFails = 0; 
//         console.log(`[✅ BINGO] M3U8 Link pakar liya gaya!`);
//         return streamData;
//     } else {
//         consecutiveLinkFails++;
//         console.log(`[🚨 WARNING] Link nahi mila. Strike: ${consecutiveLinkFails}/3`);
//         if (consecutiveLinkFails >= 3) {
//             console.log(`[🛑 FATAL] 3 baar consecutive link fail! Bot band kar raha hoon.`);
//             process.exit(1); 
//         }
//         return null;
//     }
// }

// // ==========================================
// // 🎥 WORKER 1 & 2: FFMPEG ENGINE (TEXT + BLUR + MERGE)
// // ==========================================
// function processVideo(data, rawLiveClip, finalMergedVideo) {
//     console.log(`\n[🎬 Step 1] Capturing 15-second Live Clip with FULL Blur and Text...`);
//     const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
    
//     // --- STEP A: LIVE CLIP GENERATION ---
//     const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
//     let args1 = [
//         "-y", "-thread_queue_size", "1024",
//         "-headers", headersCmd, "-i", data.url,
//         "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
//         "-thread_queue_size", "1024", "-stream_loop", "-1", "-i", "marya_live.mp3"
//     ];

//     // Filter Complex formatted for Node.js Array
//     let filterComplex1 = `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`;

//     args1.push(
//         "-filter_complex", filterComplex1,
//         "-map", "[v_out]", "-map", "2:a",
//         "-t", "15",
//         "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30",
//         "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
//         rawLiveClip
//     );

//     try {
//         console.log(`[>] Running FFmpeg Phase A (Capture & Edit)...`);
//         const resA = spawnSync('ffmpeg', args1, { stdio: 'pipe' });
//         if (resA.status !== 0) console.log(`[❌] Phase A Error:\n${resA.stderr.toString()}`);

//         if (fs.existsSync(rawLiveClip) && fs.statSync(rawLiveClip).size > 1000) {
//             console.log(`[✅] Live clip successfully created.`);
            
//             // --- STEP B: MERGING WITH MAIN VIDEO ---
//             console.log(`\n[🎬 Step 2] Merging Live Clip with 'main_video.mp4' (Syncing Resolution & FPS)...`);
            
//             let args2 = [
//                 "-y",
//                 "-i", rawLiveClip,
//                 "-i", "main_video.mp4",
//                 "-filter_complex",
//                 "[0:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v1]; [0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0]; [1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1]; [v0][a0][v1][a1]concat=n=2:v=1:a=1[v_out][a_out]",
//                 "-map", "[v_out]", "-map", "[a_out]",
//                 "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k",
//                 "-c:a", "aac", "-b:a", "128k",
//                 finalMergedVideo
//             ];

//             console.log(`[>] Running FFmpeg Phase B (Merging)...`);
//             const resB = spawnSync('ffmpeg', args2, { stdio: 'pipe' });
//             if (resB.status !== 0) console.log(`[❌] Phase B Error:\n${resB.stderr.toString()}`);

//             if (fs.existsSync(finalMergedVideo) && fs.statSync(finalMergedVideo).size > 1000) {
//                 console.log(`[✅] Merge Successful! Final Video is ready.`);
//                 return true;
//             }
//         }
//     } catch (e) {
//         console.log(`[❌] FFmpeg Engine crashed: ${e.message}`);
//     }
//     return false;
// }

// // ==========================================
// // 📤 GHOST BRIDGE (FAST CLOUD UPLOADER)
// // ==========================================

// // ==========================================
// // 📤 GHOST BRIDGE (ULTIMATE CURL BYPASS - 100% WORKING)
// // ==========================================
// async function sendViaGhostBridge(videoPath, caption) {
//     console.log(`\n[✈️ Ghost Bridge] Video ko secure cloud (Catbox) par bhej rahe hain...`);
//     try {
//         console.log(`  [>] Uploading to Catbox.moe via CURL Bypass... (Please wait)`);
        
//         // 🛠️ FINAL FIX: Axios ko hata kar direct Linux ka CURL use kar rahe hain
//         // CURL file boundaries aur sizes ko natively handle karta hai, jise Cloudflare block nahi karta!
//         const curlCmd = `curl -s -F "reqtype=fileupload" -F "fileToUpload=@${videoPath}" https://catbox.moe/user/api.php`;
        
//         // Command run karo aur result text mein save karo
//         const catboxResponse = execSync(curlCmd, { encoding: 'utf8' }).trim();

//         if (catboxResponse.includes("catbox.moe")) {
//             console.log(`  [✅] Cloud Link Ready: ${catboxResponse}`);

//             console.log(`  [>] Local PC ko signal bhej rahe hain (Ntfy.sh)...`);
//             const message = `${catboxResponse}|--|${caption}`;
            
//             // Ntfy.sh simple text API hai, isko Axios se bhejna safe hai
//             await axios.post(`https://ntfy.sh/${BRIDGE_ID}`, message, {
//                 headers: { 'Content-Type': 'text/plain' }
//             });
//             console.log(`  [✅] Signal Successfully Bhej Diya Gaya!`);
//             return true;
//         } else {
//             console.log(`  [❌] Cloud Upload Failed. Response: ${catboxResponse}`);
//             return false;
//         }
//     } catch (e) {
//         console.log(`  [❌] Ghost Bridge Error: ${e.message}`);
//         if (e.stdout) console.log(`  [🔍] CURL Output: ${e.stdout.toString()}`);
//         if (e.stderr) console.log(`  [🔍] CURL Error: ${e.stderr.toString()}`);
//         return false;
//     }
// }






// // async function sendViaGhostBridge(videoPath, caption) {
// //     console.log(`\n[✈️ Ghost Bridge] Video ko secure cloud (Catbox) par bhej rahe hain...`);
// //     try {
// //         const form = new FormData();
// //         form.append('reqtype', 'fileupload');
// //         form.append('fileToUpload', fs.createReadStream(videoPath));

// //         console.log(`  [>] Uploading to Catbox.moe... (Please wait)`);
// //         const res = await axios.post("https://catbox.moe/user/api.php", form, { 
// //             headers: form.getHeaders(),
// //             maxBodyLength: Infinity,
// //             maxContentLength: Infinity
// //         });

// //         if (res.status === 200 && res.data.includes("catbox.moe")) {
// //             const videoUrl = res.data.trim();
// //             console.log(`  [✅] Cloud Link Ready: ${videoUrl}`);

// //             console.log(`  [>] Local PC ko signal bhej rahe hain (Ntfy.sh)...`);
// //             const message = `${videoUrl}|--|${caption}`;
            
// //             await axios.post(`https://ntfy.sh/${BRIDGE_ID}`, message, {
// //                 headers: { 'Content-Type': 'text/plain' }
// //             });
// //             console.log(`  [✅] Signal Successfully Bhej Diya Gaya!`);
// //             return true;
// //         } else {
// //             console.log(`  [❌] Cloud Upload Failed. Response: ${res.data}`);
// //             return false;
// //         }
// //     } catch (e) {
// //         console.log(`  [❌] Ghost Bridge Error: ${e.message}`);
// //         return false;
// //     }
// // }

// // ==========================================
// // 🔄 GITHUB AUTO-RESTART
// // ==========================================
// async function triggerNextRun() {
//     console.log(`\n[🔄 AUTO-RESTART] Relay Race: Naya GitHub Action trigger kar raha hoon...`);
//     const token = process.env.GH_PAT;
//     const repo = process.env.GITHUB_REPOSITORY;
//     const branch = process.env.GITHUB_REF_NAME || 'main';
//     if (!token || !repo) return;
//     try {
//         await axios.post(`https://api.github.com/repos/${repo}/actions/workflows/ghost_loop.yml/dispatches`, {
//             ref: branch, inputs: { target_url: TARGET_WEBSITE, titles_list: TITLES_INPUT, descs_list: DESCS_INPUT, hashtags: HASHTAGS }
//         }, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } });
//         console.log(`[✅] Naya Bot background mein start ho gaya!`);
//     } catch (e) { console.log(`[❌] Relay Race Trigger failed!`); }
// }

// // ==========================================
// // 🚀 MAIN LOOP (THE BRAIN)
// // ==========================================
// async function main() {
//     const requiredFiles = ["website_frame.png", "marya_live.mp3", "main_video.mp4"];
//     for (let f of requiredFiles) {
//         if (!fs.existsSync(f)) {
//             console.log(`[🛑 Error] '${f}' file missing! Pehle isay upload karein.`);
//             return;
//         }
//     }

//     let clipCounter = 1;
//     let nextRunTriggered = false;

//     while (true) {
//         const elapsedTimeMs = Date.now() - START_TIME;
//         if (elapsedTimeMs > END_TIME_LIMIT_MS) {
//             console.log(`\n[🛑 System] Max Lifetime Reached (6 Hours). Graceful exit.`);
//             break;
//         }

//         console.log(`\n${"-".repeat(50)}`);
//         console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
//         console.log(`  [-] Bot Uptime: ${Math.floor(elapsedTimeMs / 60000)} minutes`);
//         console.log(`${"-".repeat(50)}`);

//         if (elapsedTimeMs > RESTART_TRIGGER_MS && !nextRunTriggered) { 
//             await triggerNextRun(); 
//             nextRunTriggered = true; 
//         }

//         let data = await getStreamData();
//         if (!data) {
//             consecutiveErrors++;
//             if (consecutiveErrors >= 3) break;
//             await new Promise(r => setTimeout(r, 30000));
//             continue;
//         }
        
//         consecutiveErrors = 0;
//         const rawLiveClip = `raw_live_${clipCounter}.mp4`;
//         const finalMergedVideo = `ready_clip_${clipCounter}.mp4`;
//         const caption = generateUniqueMetadata(clipCounter);

//         const success = processVideo(data, rawLiveClip, finalMergedVideo);

//         if (success) {
//             // 🚀 YAHAN GHOST BRIDGE CALL HO RAHA HAI
//             await sendViaGhostBridge(finalMergedVideo, caption);
            
//             // Cleanup Temporary Files
//             [rawLiveClip, finalMergedVideo].forEach(f => {
//                 if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`  [🧹] Deleted: ${f}`); }
//             });
//         } else {
//             console.log(`  [❌] Pipeline failed for Cycle #${clipCounter}.`);
//         }

//         // Wait 8 to 11 minutes (500-700 seconds) before next clip
//         const waitSeconds = Math.floor(Math.random() * (700 - 500 + 1)) + 500;
//         console.log(`\n[⏳ Cycle End] Waiting ${Math.floor(waitSeconds/60)} minutes before next round...`);
//         await new Promise(r => setTimeout(r, waitSeconds * 1000));
//         clipCounter++;
//     }
// }

// // Start Factory
// main();
