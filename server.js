import express, { json } from "express";
import cors from "cors";
import { chromium } from "playwright";
import pLimit from "p-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
[span_1](start_span)// Use 10000 for Render, fallback to 4000 for local[span_1](end_span)
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(json());

const PROVIDERS = [
  "https://vidsrc.xyz",
  "https://vidsrc.in",
  "https://vidsrc.pm",
  "https://vidsrc.net",
];

[span_2](start_span)// RAM SAVER: Only 1 provider at a time to stay under 512MB[span_2](end_span)
const limit = pLimit(1);

async function scrapeProvider(browser, domain, url) {
  console.log(`\n[${domain}] Scraping: ${url}`);
  
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  });
  const page = await context.newPage();

  [span_3](start_span)// RAM SAVER: Block images and CSS to reduce memory usage by ~60%[span_3](end_span)
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'stylesheet', 'media'].includes(type)) {
      return route.abort(); 
    }
    route.continue();
  });

  let hlsUrl = null;
  const subtitles = [];

  try {
    page.on("request", (request) => {
      const reqUrl = request.url();
      if (reqUrl.includes(".m3u8")) hlsUrl = reqUrl;
      if (reqUrl.includes(".vtt") || reqUrl.includes(".srt")) {
        if (!subtitles.includes(reqUrl)) subtitles.push(reqUrl);
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    
    [span_4](start_span)// Simulate a click on the player frame[span_4](end_span)
    const frame = await page.waitForSelector("#the_frame", { timeout: 5000 }).catch(() => null);
    if (frame) {
        await frame.click({ force: true });
    }

    // Wait for network activity to settle
    await page.waitForTimeout(5000);

    return { hls_url: hlsUrl, subtitles, error: hlsUrl ? null : "Link not found" };
  } catch (error) {
    return { hls_url: null, subtitles: [], error: error.message };
  } finally {
    [span_5](start_span)// CRITICAL: Clean up tab immediately[span_5](end_span)
    await page.close();
    await context.close();
  }
}

app.get("/extract", async (req, res) => {
  const { tmdb_id, type = "movie", season, episode } = req.query;

  if (!tmdb_id) return res.status(400).json({ error: "tmdb_id required" });

  [span_6](start_span)// 1. Launch a FRESH browser just for this request to avoid memory leaks[span_6](end_span)
    const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process', 
      '--no-zygote'
    ]
  });


  try {
    const results = {};
    
    [span_8](start_span)// 2. Process providers one-by-one to keep RAM flat[span_8](end_span)
    for (const domain of PROVIDERS) {
      const url = type === "tv" 
        ? `${domain}/embed/tv?tmdb=${tmdb_id}&season=${season}&episode=${episode}`
        : `${domain}/embed/movie/${tmdb_id}`;
      
      results[domain] = await limit(() => scrapeProvider(browser, domain, url));
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    [span_9](start_span)// 3. KILL the browser entirely after the response[span_9](end_span)
    await browser.close();
  }
});

app.get("/", (req, res) => res.send("VidSrc Scraper is Online"));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
