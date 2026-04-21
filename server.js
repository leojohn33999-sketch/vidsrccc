import express, { json } from "express";
import cors from "cors";
import { chromium } from "playwright";
import pLimit from "p-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
// Render uses 10000, local uses 4000
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(json());

const PROVIDERS = [
  "https://vidsrc.xyz",
  "https://vidsrc.in",
  "https://vidsrc.pm",
  "https://vidsrc.net",
];

const limit = pLimit(1);

async function scrapeProvider(browser, domain, url) {
  console.log(`[${domain}] Scraping...`);
  const context = await browser.newContext();
  const page = await context.newPage();

  // Block heavy assets to save RAM
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'stylesheet', 'media'].includes(type)) {
      return route.abort();
    }
    route.continue();
  });

  let hlsUrl = null;
  try {
    page.on("request", (req) => {
      if (req.url().includes(".m3u8")) hlsUrl = req.url();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    
    const frame = await page.waitForSelector("#the_frame", { timeout: 5000 }).catch(() => null);
    if (frame) await frame.click({ force: true });

    await page.waitForTimeout(5000);
    return { hls_url: hlsUrl };
  } catch (error) {
    return { error: error.message };
  } finally {
    await page.close();
    await context.close();
  }
}

app.get("/extract", async (req, res) => {
  const { tmdb_id, type = "movie", season, episode } = req.query;
  if (!tmdb_id) return res.status(400).json({ error: "tmdb_id required" });

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ]
  });

  try {
    const results = {};
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
    await browser.close();
  }
});

app.get("/", (req, res) => res.send("Scraper Online"));

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
