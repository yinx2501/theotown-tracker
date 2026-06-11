const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Ép Puppeteer tải Chrome vào thư mục .cache ngay trong dự án
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
