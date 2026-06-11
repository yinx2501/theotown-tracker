const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'plugins.json');

// Đảm bảo các thư mục lưu dữ liệu luôn tồn tại cấu trúc chuẩn
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hàm đọc/ghi dữ liệu từ file JSON cơ sở dữ liệu
// THAY THẾ TOÀN BỘ ĐOẠN READDATA VÀ WRITEDATA CŨ BẰNG ĐOẠN NÀY:
const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return [];
        }
        const content = fs.readFileSync(DATA_FILE, 'utf8').trim();
        // Nếu file trống trơn thì trả về mảng rỗng, tránh làm sập server
        return content ? JSON.parse(content) : [];
    } catch (error) {
        console.error("⚠️ Phát hiện lỗi đọc file JSON, tự động khôi phục cấu trúc []:", error.message);
        return [];
    }
};

const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("⚠️ Lỗi ghi dữ liệu vào file JSON:", error.message);
    }
};

// =========================================================================
// HÀM LÕI CÀO DỮ LIỆU (SCRAPER CORE)
// Nếu cấu trúc web TheoTown thay đổi, bạn chỉ cần sửa logic trích xuất ở đây.
// Toàn bộ các API và giao diện quản trị khác bên dưới sẽ được giữ nguyên 100%.
// =========================================================================
// =========================================================================
// HÀM LÕI CÀO DỮ LIỆU ĐÃ ĐƯỢC NÂNG CẤP KHẢ NĂNG CHỐNG CHẶN BOT (ANTI-BOT EVASION)
// Chỉ thay đổi hàm này, 100% các thành phần khác xung quanh được giữ nguyên.
// =========================================================================
// =========================================================================
// HÀM LÕI CÀO DỮ LIỆU BẰNG BROWSER CHẠY NGẦM (BYPASS CLOUDFLARE/JS CHALLENGE)
// Đảm bảo giữ nguyên 100% cấu trúc giao tiếp của các hàm và API xung quanh.
// =========================================================================
// =========================================================================
// HÀM LÕI CÀO DỮ LIỆU (ĐÃ SỬA LỖI ĐỨT NGỮ CẢNH DO NAVIGATION)
// Chỉ chỉnh sửa phần load trang bên dưới, các thành phần khác giữ nguyên 100%
// =========================================================================
// =========================================================================
// HÀM LÕI CÀO DỮ LIỆU ĐÃ SỬA LỖI ĐỌC TRANG DANH SÁCH / TÌM KIẾM THEOTOWN
// Đảm bảo giữ nguyên vẹn 100% các API kết nối và giao diện xung quanh.
// =========================================================================
// =========================================================================
// HÀM LÕI CÀO DỮ LIỆU ĐÃ ĐƯỢC THÊM BỘ ĐỆM ĐỢI ĐIỀU HƯỚNG TRÁNH SẬP CONTEXT
// Chỉ thay đổi phần cấu hình chờ tải trang, 100% logic lọc phía dưới giữ nguyên.
// =========================================================================
async function scrapePluginData(url) {
    let browser;
    try {
        const puppeteer = require('puppeteer');
        
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // [THAY ĐỔI TẠI ĐÂY]: Tải trang và đợi mạng lưới kết nối tạm lắng xuống
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // [THAY ĐỔI TẠI ĐÂY]: Đợi thêm 2.5 giây để phòng trường hợp trang web chuyển hướng ngầm/vượt Cloudflare thách thức
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Thực hiện bóc tách thông minh trực tiếp bên trong DOM của Trình duyệt (Giữ nguyên 100%)
        const extractedData = await page.evaluate(() => {
            const bodyTxt = document.body.innerText || "";
            
            let rating = "N/A";
            let downloads = "N/A";
            let title = "";

            const ratingWords = ["VERY POSITIVE", "POSITIVE", "MIXED", "NEUTRAL", "VERY NEGATIVE", "NEGATIVE"];

            // 1. Trích xuất Đánh giá
            const ratingMatch = bodyTxt.match(/(VERY POSITIVE|POSITIVE|MIXED|NEUTRAL|VERY NEGATIVE|NEGATIVE)/i);
            if (ratingMatch) {
                rating = ratingMatch[0].toUpperCase();
            }

            // 2. Trích xuất Lượt tải
            const downloadMatch = bodyTxt.match(/(\d{1,3}(,\d{3})*)\s*[\.\-\s]*\s*(VERY POSITIVE|POSITIVE|MIXED|NEUTRAL|VERY NEGATIVE|NEGATIVE)/i);
            if (downloadMatch) {
                downloads = downloadMatch[1];
            } else {
                const fallbackMatch = bodyTxt.match(/(\d{1,3}(,\d{3})*)\s+downloads/i);
                if (fallbackMatch) downloads = fallbackMatch[1];
            }

            // 3. Trích xuất Tên Plugin thật (DOM Walker)
            let ratingEl = null;
            if (rating !== "N/A") {
                const allElements = Array.from(document.querySelectorAll('*'));
                ratingEl = allElements.find(el => el.children.length === 0 && el.innerText && el.innerText.toUpperCase().trim() === rating);
            }

            if (ratingEl) {
                let parent = ratingEl.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                    const candidates = parent.querySelectorAll('a, h1, h2, h3, h4');
                    for (let cand of candidates) {
                        const txt = cand.innerText ? cand.innerText.trim() : "";
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
                title = document.title.replace(" - TheoTown", "").trim();
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

// Lấy danh sách toàn bộ plugin đang theo dõi
app.get('/api/plugins', (req, res) => {
    res.json(readData());
});

// Thêm một link plugin mới vào danh sách theo dõi
app.post('/api/plugins', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Đường dẫn URL không hợp lệ" });

    const plugins = readData();
    if (plugins.some(p => p.url === url)) {
        return res.status(400).json({ error: "Plugin này đã có trong danh sách hệ thống" });
    }

    // Cào thử dữ liệu ngay khi vừa thêm vào để cập nhật bảng lập tức
    const scrapedInfo = await scrapePluginData(url);
    const newPlugin = {
        id: Date.now().toString(),
        url,
        ...scrapedInfo
    };

    plugins.push(newPlugin);
    writeData(plugins);
    res.json(newPlugin);
});

// Xóa plugin khỏi danh sách quản lý
app.delete('/api/plugins/:id', (req, res) => {
    const { id } = req.params;
    let plugins = readData();
    plugins = plugins.filter(p => p.id !== id);
    writeData(plugins);
    res.json({ success: true });
});

// Ép buộc hệ thống cập nhật đồng loạt ngay lập tức (Manual Refresh)
app.post('/api/plugins/refresh', async (req, res) => {
    let plugins = readData();
    for (let i = 0; i < plugins.length; i++) {
        const updatedInfo = await scrapePluginData(plugins[i].url);
        plugins[i] = { ...plugins[i], ...updatedInfo };
        // Nghỉ 2 giây giữa mỗi request để chống bị chặn IP (Anti-Bot Rate Limiting)
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    writeData(plugins);
    res.json(plugins);
});

// --- TỰ ĐỘNG HÓA NHIỆM VỤ CHẠY NGẦM (CRON JOB) ---
// Hệ thống sẽ tự động quét lại toàn bộ danh sách mỗi 1 tiếng đồng hồ (3600000ms)
setInterval(async () => {
    console.log(`[${new Date().toLocaleTimeString()}] Bắt đầu chu kỳ quét tự động...`);
    let plugins = readData();
    for (let i = 0; i < plugins.length; i++) {
        const updatedInfo = await scrapePluginData(plugins[i].url);
        plugins[i] = { ...plugins[i], ...updatedInfo };
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    writeData(plugins);
    console.log("Chu kỳ quét tự động hoàn tất.");
}, 10 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`Ứng dụng đang vận hành ổn định tại cổng mạng: http://localhost:${PORT}`);
});