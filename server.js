const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// 🔗 ĐƯỜNG DẪN APPS SCRIPT GOOGLE SHEET MỚI CỦA BẠN (DÁN ĐÈ LINK CỦA BẠN VÀO ĐÂY)
// =========================================================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzazENFAuBWA4ud2VaFJdYPIIxFZIGOeNBIJu_Zh1vLg6YqgriAnzjEpYWZ4t03vtsX/exec";

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hàm đọc dữ liệu từ Google Sheet từ xa (Bảo đảm không bao giờ mất data khi sleep/restart)
const readData = async () => {
    try {
        const response = await axios.get(SCRIPT_URL, { timeout: 10000 });
        if (response.data && Array.isArray(response.data)) {
            return response.data;
        }
        return [];
    } catch (error) {
        console.error("⚠️ Không thể kết nối đọc dữ liệu từ Google Sheets:", error.message);
        return [];
    }
};

// Hàm ghi dữ liệu gửi yêu cầu đồng bộ trực tiếp lên Google Sheet 
const writeData = async (actionType, targetData) => {
    try {
        await axios.post(SCRIPT_URL, {
            action: actionType,
            data: targetData
        }, { timeout: 15000 });
    } catch (error) {
        console.error(`⚠️ Lỗi gửi dữ liệu [${actionType}] lên Google Sheets:`, error.message);
    }
};

// =========================================================================
// HÀM LÕI CÀO DỮ LIỆU - GIỮ NGUYÊN 100% TOÀN BỘ LOGIC CŨ VÀ CAMERA CHỤP ẢNH
// =========================================================================
async function scrapePluginData(url) {
    let browser;
    try {
        const puppeteer = require('puppeteer');

        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3500));

        try {
            const publicDir = path.join(__dirname, 'public');
            if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
            await page.screenshot({ path: path.join(publicDir, 'screenshot.png') });
            console.log(`[Bằng chứng ảnh] Đã chụp ảnh màn hình lúc cào link: ${url}`);
        } catch (screenErr) {
            console.error("Không chụp được ảnh màn hình:", screenErr.message);
        }

        const extractedData = await page.evaluate(() => {
            const bodyTxt = document.body?.innerText || "";

            let rating = "N/A";
            let downloads = "N/A";
            let title = "";

            const ratingWords = ["VERY POSITIVE", "POSITIVE", "MIXED", "NEUTRAL", "VERY NEGATIVE", "NEGATIVE"];

            const ratingMatch = bodyTxt.match(/(VERY POSITIVE|POSITIVE|MIXED|NEUTRAL|VERY NEGATIVE|NEGATIVE)/i);
            if (ratingMatch) {
                rating = ratingMatch[0].toUpperCase();
            }

            const downloadMatch = bodyTxt.match(/(\d{1,3}(,\d{3})*)\s*[\.\-\s]*\s*(VERY POSITIVE|POSITIVE|MIXED|NEUTRAL|VERY NEGATIVE|NEGATIVE)/i);
            if (downloadMatch) {
                downloads = downloadMatch[1];
            } else {
                const fallbackMatch = bodyTxt.match(/(\d{1,3}(,\d{3})*)\s+downloads/i);
                if (fallbackMatch) downloads = fallbackMatch[1];
            }

            let ratingEl = null;
            if (rating !== "N/A") {
                const allElements = Array.from(document.querySelectorAll('*'));
                ratingEl = allElements.find(el => el && el.children && el.children.length === 0 && el.innerText && el?.innerText?.toUpperCase().trim() === rating);
            }

            if (ratingEl) {
                let parent = ratingEl.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                    const candidates = parent.querySelectorAll('a, h1, h2, h3, h4');
                    for (let cand of candidates) {
                        const txt = cand?.innerText ? cand.innerText.trim() : "";
                        if (txt && !ratingWords.includes(txt.toUpperCase()) && txt.length > 1 && !txt.toLowerCase().includes('download')) {
                            title = txt;
                            break;
                        }
                    }
                    if (title) break;
                    parent = parent.parentElement;
                }
            }

            if (!title) {
                title = document.title ? document.title.replace(" - TheoTown", "").trim() : "";
            }

            return { title, downloads, rating };
        });

        await browser.close();

        return {
            title: extractedData.title || "Plugin Chưa Đặt Tên",
            downloads: extractedData.downloads,
            rating: extractedData.rating,
            lastUpdated: new Date().toLocaleString('vi-VN'),
            status: "Bình thường"
        };

    } catch (error) {
        if (browser) await browser.close();
        console.error(`[Scraper Error] Sự cố tại ${url}:`, error.message);

        return {
            title: "Lỗi cấu trúc trang",
            downloads: "Thử lại",
            rating: "Thử lại",
            lastUpdated: new Date().toLocaleString('vi-VN'),
            status: `Lỗi hệ thống: ${error.message}`
        };
    }
}

// Lấy danh sách toàn bộ plugin đang theo dõi (Đọc thẳng từ Google Sheet về)
app.get('/api/plugins', async (req, res) => {
    const dataFromSheet = await readData();
    res.json(dataFromSheet);
});

// Thêm một link plugin mới vào danh sách theo dõi
app.post('/api/plugins', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Đường dẫn URL không hợp lệ" });

    const plugins = await readData();
    if (plugins.some(p => p.url === url)) {
        return res.status(400).json({ error: "Plugin này đã có trong danh sách hệ thống" });
    }

    const scrapedInfo = await scrapePluginData(url);
    const newPlugin = {
        id: Date.now().toString(),
        url,
        ...scrapedInfo
    };

    // Đẩy dữ liệu đơn lẻ lên Google Sheets lập tức
    await writeData("ADD_ONE", newPlugin);
    res.json(newPlugin);
});

// Xóa plugin khỏi danh sách quản lý
app.delete('/api/plugins/:id', async (req, res) => {
    const { id } = req.params;
    await writeData("DELETE_ONE", { id: id });
    res.json({ success: true });
});

// Ép buộc hệ thống cập nhật đồng loạt ngay lập tức (Manual Refresh)
app.post('/api/plugins/refresh', async (req, res) => {
    let plugins = await readData();
    for (let i = 0; i < plugins.length; i++) {
        const updatedInfo = await scrapePluginData(plugins[i].url);
        plugins[i] = { ...plugins[i], ...updatedInfo };
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    // Ghi đè toàn bộ mảng đã làm mới lên Sheet
    await writeData("WRITE_ALL", plugins);
    res.json(plugins);
});

// --- TỰ ĐỘNG HÓA NHIỆM VỤ CHẠY NGẦM (CRON JOB) ---
setInterval(async () => {
    console.log(`[${new Date().toLocaleTimeString()}] Bắt đầu chu kỳ quét tự động...`);
    let plugins = await readData();
    if (plugins.length > 0) {
        for (let i = 0; i < plugins.length; i++) {
            const updatedInfo = await scrapePluginData(plugins[i].url);
            plugins[i] = { ...plugins[i], ...updatedInfo };
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        await writeData("WRITE_ALL", plugins);
    }
    console.log("Chu kỳ quét tự động hoàn tất.");
}, 10 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`Ứng dụng đang vận hành ổn định tại cổng mạng: http://localhost:${PORT}`);
});
