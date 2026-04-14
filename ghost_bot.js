const puppeteer = require('puppeteer');
const { spawnSync } = require('child_process');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

console.log("\n" + "=".repeat(50));
console.log("   🚀 NODE.JS HYBRID CLOUD FACTORY (GHOST BRIDGE)");
console.log("=".repeat(50));

// ==========================================
// ⚙️ SETTINGS & ENVIRONMENT VARIABLES
// ==========================================
const PKT_OFFSET = 5 * 60 * 60 * 1000;
const START_TIME = Date.now();
const RESTART_TRIGGER_MS = (5 * 60 * 60 + 30 * 60) * 1000; // 5.5 Hours
const END_TIME_LIMIT_MS = (5 * 60 * 60 + 50 * 60) * 1000;

const BRIDGE_ID = "criclive_ibrahim_bridge_786";

const TITLES_INPUT = process.env.TITLES_LIST || 'Live Match Today';
const DESCS_INPUT = process.env.DESCS_LIST || 'Watch the live action here';
const HASHTAGS = process.env.HASHTAGS || '#CricketLive #MatchToday';

const TARGET_WEBSITE = process.env.TARGET_URL || "https://bhalocast.com/atoplay.php?v=wextres&hello=m1lko&expires=123456";
const REFERER = "https://bhalocast.com/";

let consecutiveLinkFails = 0;
let consecutiveErrors = 0;

function formatPKT(timestampMs = Date.now()) {
    return new Date(timestampMs).toLocaleString('en-US', {
        timeZone: 'Asia/Karachi', hour12: true, year: 'numeric', month: 'short',
        day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) + " PKT";
}

// ==========================================
// 🧠 ANTI-SPAM METADATA
// ==========================================
function generateUniqueMetadata(clipNum) {
    const titles = TITLES_INPUT.split(',,').map(t => t.trim()).filter(t => t);
    const descs = DESCS_INPUT.split(',,').map(d => d.trim()).filter(d => d);
    
    const title = titles.length ? titles[Math.floor(Math.random() * titles.length)] : "Live Match Today";
    const descBody = descs.length ? descs[Math.floor(Math.random() * descs.length)] : "Watch the live action here!";
    
    const emojis = ["🔥", "🏏", "⚡", "🏆", "💥", "📺"].sort(() => 0.5 - Math.random()).slice(0, 3);
    const tags = HASHTAGS.split(' ').sort(() => 0.5 - Math.random()).slice(0, 4).join(' ');
    
    const caption = `${title} ${emojis.join(' ')}\n\n${descBody}\n\nClip #${clipNum}\n\n${tags}`;
    return caption;
}

// ==========================================
// 🔍 WORKER 0: GET M3U8 LINK (SMART CHECK)
// ==========================================
async function getStreamData() {
    console.log(`\n[🔍 STEP 1] Puppeteer Chrome Start kar raha hoon... (Strike: ${consecutiveLinkFails}/3)`);
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--mute-audio', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

    let streamData = null;
    page.on('request', (request) => {
        const url = request.url();
        if (url.includes('.m3u8')) {
            streamData = {
                url: url,
                ua: request.headers()['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                cookie: request.headers()['cookie'] || '',
                referer: REFERER
            };
        }
    });

    try {
        console.log(`[🌐] Target URL par ja raha hoon: ${TARGET_WEBSITE}`);
        await page.goto(TARGET_WEBSITE, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.click('body').catch(() => {});
        
        console.log(`[⏳] M3U8 Link ka intezar hai... (5 Second ke 3 Rounds)`);
        for (let i = 1; i <= 3; i++) {
            await new Promise(r => setTimeout(r, 5000));
            if (streamData) {
                console.log(`[✅] Round ${i} mein link mil gaya! Aage barh raha hoon...`);
                break;
            } else {
                console.log(`[⚠️] Round ${i}/3: Abhi tak link nahi mila...`);
            }
        }
    } catch (e) { 
        console.log(`[❌ ERROR] Page load nahi ho saka.`); 
    }
    
    await browser.close();

    if (streamData) {
        consecutiveLinkFails = 0; 
        console.log(`[✅ BINGO] M3U8 Link pakar liya gaya!`);
        return streamData;
    } else {
        consecutiveLinkFails++;
        console.log(`[🚨 WARNING] Link nahi mila. Strike: ${consecutiveLinkFails}/3`);
        if (consecutiveLinkFails >= 3) {
            console.log(`[🛑 FATAL] 3 baar consecutive link fail! Bot band kar raha hoon.`);
            process.exit(1); 
        }
        return null;
    }
}

// ==========================================
// 🎥 WORKER 1 & 2: FFMPEG ENGINE (TEXT + BLUR + MERGE)
// ==========================================
function processVideo(data, rawLiveClip, finalMergedVideo) {
    console.log(`\n[🎬 Step 1] Capturing 15-second Live Clip with FULL Blur and Text...`);
    const headersCmd = `User-Agent: ${data.ua}\r\nReferer: ${data.referer}\r\nCookie: ${data.cookie}\r\n`;
    
    // --- STEP A: LIVE CLIP GENERATION ---
    const topText = "Enter this on Google\\: bulbul4u-live.xyz";
    
    let args1 = [
        "-y", "-thread_queue_size", "1024",
        "-headers", headersCmd, "-i", data.url,
        "-thread_queue_size", "1024", "-loop", "1", "-framerate", "30", "-i", "website_frame.png",
        "-thread_queue_size", "1024", "-stream_loop", "-1", "-i", "marya_live.mp3"
    ];

    // Filter Complex formatted for Node.js Array
    let filterComplex1 = `[0:v]scale=1064:565[pip]; [1:v]scale=1080:924[bg_fixed]; [bg_fixed][pip]overlay=0:250[bg_pip]; [bg_pip]boxblur=15:5[blurred_bg]; [blurred_bg]drawtext=text='${topText}':x=(w-text_w)/2:y=h-110:fontsize=50:fontcolor=white:box=1:boxcolor=red@0.8:borderw=2:bordercolor=black[v_out]`;

    args1.push(
        "-filter_complex", filterComplex1,
        "-map", "[v_out]", "-map", "2:a",
        "-t", "15",
        "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k", "-r", "30",
        "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
        rawLiveClip
    );

    try {
        console.log(`[>] Running FFmpeg Phase A (Capture & Edit)...`);
        const resA = spawnSync('ffmpeg', args1, { stdio: 'pipe' });
        if (resA.status !== 0) console.log(`[❌] Phase A Error:\n${resA.stderr.toString()}`);

        if (fs.existsSync(rawLiveClip) && fs.statSync(rawLiveClip).size > 1000) {
            console.log(`[✅] Live clip successfully created.`);
            
            // --- STEP B: MERGING WITH MAIN VIDEO ---
            console.log(`\n[🎬 Step 2] Merging Live Clip with 'main_video.mp4' (Syncing Resolution & FPS)...`);
            
            let args2 = [
                "-y",
                "-i", rawLiveClip,
                "-i", "main_video.mp4",
                "-filter_complex",
                "[0:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v0]; [1:v]scale=1080:924,setsar=1,fps=30,format=yuv420p[v1]; [0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0]; [1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1]; [v0][a0][v1][a1]concat=n=2:v=1:a=1[v_out][a_out]",
                "-map", "[v_out]", "-map", "[a_out]",
                "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "1500k",
                "-c:a", "aac", "-b:a", "128k",
                finalMergedVideo
            ];

            console.log(`[>] Running FFmpeg Phase B (Merging)...`);
            const resB = spawnSync('ffmpeg', args2, { stdio: 'pipe' });
            if (resB.status !== 0) console.log(`[❌] Phase B Error:\n${resB.stderr.toString()}`);

            if (fs.existsSync(finalMergedVideo) && fs.statSync(finalMergedVideo).size > 1000) {
                console.log(`[✅] Merge Successful! Final Video is ready.`);
                return true;
            }
        }
    } catch (e) {
        console.log(`[❌] FFmpeg Engine crashed: ${e.message}`);
    }
    return false;
}

// ==========================================
// 📤 GHOST BRIDGE (FAST CLOUD UPLOADER)
// ==========================================

// ==========================================
// 📤 GHOST BRIDGE (FAST CLOUD UPLOADER - FINAL 412 FIX)
// ==========================================
async function sendViaGhostBridge(videoPath, caption) {
    console.log(`\n[✈️ Ghost Bridge] Video ko secure cloud (Catbox) par bhej rahe hain...`);
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        
        // File ko Buffer mein read karein
        const fileBuffer = fs.readFileSync(videoPath);
        form.append('fileToUpload', fileBuffer, {
            filename: 'ready_clip.mp4',
            contentType: 'video/mp4'
        });

        console.log(`  [>] Uploading to Catbox.moe... (Please wait)`);
        
        const headers = form.getHeaders();
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // 🛠️ YEH HAI MASTER FIX: 
        // Axios ko file ka mukammal size batana zaroori hai, warna wo "chunked" upload karta hai jo Catbox block kar deta hai.
        headers['Content-Length'] = form.getLengthSync();

        const res = await axios.post("https://catbox.moe/user/api.php", form, { 
            headers: headers,
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        if (res.status === 200 && res.data.includes("catbox.moe")) {
            const videoUrl = res.data.trim();
            console.log(`  [✅] Cloud Link Ready: ${videoUrl}`);

            console.log(`  [>] Local PC ko signal bhej rahe hain (Ntfy.sh)...`);
            const message = `${videoUrl}|--|${caption}`;
            
            await axios.post(`https://ntfy.sh/${BRIDGE_ID}`, message, {
                headers: { 'Content-Type': 'text/plain' }
            });
            console.log(`  [✅] Signal Successfully Bhej Diya Gaya!`);
            return true;
        } else {
            console.log(`  [❌] Cloud Upload Failed. Response: ${res.data}`);
            return false;
        }
    } catch (e) {
        console.log(`  [❌] Ghost Bridge Error: ${e.message}`);
        if (e.response) {
            console.log(`  [🔍] API Error Details: ${e.response.status} - ${e.response.statusText}`);
        }
        return false;
    }
}






// async function sendViaGhostBridge(videoPath, caption) {
//     console.log(`\n[✈️ Ghost Bridge] Video ko secure cloud (Catbox) par bhej rahe hain...`);
//     try {
//         const form = new FormData();
//         form.append('reqtype', 'fileupload');
//         form.append('fileToUpload', fs.createReadStream(videoPath));

//         console.log(`  [>] Uploading to Catbox.moe... (Please wait)`);
//         const res = await axios.post("https://catbox.moe/user/api.php", form, { 
//             headers: form.getHeaders(),
//             maxBodyLength: Infinity,
//             maxContentLength: Infinity
//         });

//         if (res.status === 200 && res.data.includes("catbox.moe")) {
//             const videoUrl = res.data.trim();
//             console.log(`  [✅] Cloud Link Ready: ${videoUrl}`);

//             console.log(`  [>] Local PC ko signal bhej rahe hain (Ntfy.sh)...`);
//             const message = `${videoUrl}|--|${caption}`;
            
//             await axios.post(`https://ntfy.sh/${BRIDGE_ID}`, message, {
//                 headers: { 'Content-Type': 'text/plain' }
//             });
//             console.log(`  [✅] Signal Successfully Bhej Diya Gaya!`);
//             return true;
//         } else {
//             console.log(`  [❌] Cloud Upload Failed. Response: ${res.data}`);
//             return false;
//         }
//     } catch (e) {
//         console.log(`  [❌] Ghost Bridge Error: ${e.message}`);
//         return false;
//     }
// }

// ==========================================
// 🔄 GITHUB AUTO-RESTART
// ==========================================
async function triggerNextRun() {
    console.log(`\n[🔄 AUTO-RESTART] Relay Race: Naya GitHub Action trigger kar raha hoon...`);
    const token = process.env.GH_PAT;
    const repo = process.env.GITHUB_REPOSITORY;
    const branch = process.env.GITHUB_REF_NAME || 'main';
    if (!token || !repo) return;
    try {
        await axios.post(`https://api.github.com/repos/${repo}/actions/workflows/ghost_loop.yml/dispatches`, {
            ref: branch, inputs: { target_url: TARGET_WEBSITE, titles_list: TITLES_INPUT, descs_list: DESCS_INPUT, hashtags: HASHTAGS }
        }, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } });
        console.log(`[✅] Naya Bot background mein start ho gaya!`);
    } catch (e) { console.log(`[❌] Relay Race Trigger failed!`); }
}

// ==========================================
// 🚀 MAIN LOOP (THE BRAIN)
// ==========================================
async function main() {
    const requiredFiles = ["website_frame.png", "marya_live.mp3", "main_video.mp4"];
    for (let f of requiredFiles) {
        if (!fs.existsSync(f)) {
            console.log(`[🛑 Error] '${f}' file missing! Pehle isay upload karein.`);
            return;
        }
    }

    let clipCounter = 1;
    let nextRunTriggered = false;

    while (true) {
        const elapsedTimeMs = Date.now() - START_TIME;
        if (elapsedTimeMs > END_TIME_LIMIT_MS) {
            console.log(`\n[🛑 System] Max Lifetime Reached (6 Hours). Graceful exit.`);
            break;
        }

        console.log(`\n${"-".repeat(50)}`);
        console.log(`--- 🔄 STARTING VIDEO CYCLE #${clipCounter} ---`);
        console.log(`  [-] Bot Uptime: ${Math.floor(elapsedTimeMs / 60000)} minutes`);
        console.log(`${"-".repeat(50)}`);

        if (elapsedTimeMs > RESTART_TRIGGER_MS && !nextRunTriggered) { 
            await triggerNextRun(); 
            nextRunTriggered = true; 
        }

        let data = await getStreamData();
        if (!data) {
            consecutiveErrors++;
            if (consecutiveErrors >= 3) break;
            await new Promise(r => setTimeout(r, 30000));
            continue;
        }
        
        consecutiveErrors = 0;
        const rawLiveClip = `raw_live_${clipCounter}.mp4`;
        const finalMergedVideo = `ready_clip_${clipCounter}.mp4`;
        const caption = generateUniqueMetadata(clipCounter);

        const success = processVideo(data, rawLiveClip, finalMergedVideo);

        if (success) {
            // 🚀 YAHAN GHOST BRIDGE CALL HO RAHA HAI
            await sendViaGhostBridge(finalMergedVideo, caption);
            
            // Cleanup Temporary Files
            [rawLiveClip, finalMergedVideo].forEach(f => {
                if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`  [🧹] Deleted: ${f}`); }
            });
        } else {
            console.log(`  [❌] Pipeline failed for Cycle #${clipCounter}.`);
        }

        // Wait 8 to 11 minutes (500-700 seconds) before next clip
        const waitSeconds = Math.floor(Math.random() * (700 - 500 + 1)) + 500;
        console.log(`\n[⏳ Cycle End] Waiting ${Math.floor(waitSeconds/60)} minutes before next round...`);
        await new Promise(r => setTimeout(r, waitSeconds * 1000));
        clipCounter++;
    }
}

// Start Factory
main();
