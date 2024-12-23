const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Excel dosyasının yolu
const filePath = path.join(__dirname, 'output.xlsx');

// Google işletme bilgilerini çekmek için endpoint
app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  let browser;

  console.log(`Gelen URL: ${url}`);
  if (!url) {
    console.log('HATA: URL eksik');
    return res.status(400).json({ message: 'URL eksik' });
  }

  try {
    console.log('Tarayıcı başlatılıyor...');
    browser = await puppeteer.launch({
      headless: true, // Tarayıcıyı görünmez çalıştırır
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    console.log(`URL'ye gidiliyor: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log('Veriler DOM\'dan çekiliyor...');
    const data = await page.evaluate(() => {
      // İşletme adı
      const businessName = document.querySelector('.rgnuSb.tZPcob')?.textContent || 'Ad bulunamadı';
      // Telefon numarası
      const phone = document.querySelector('.eigqqc')?.textContent || 'Telefon bulunamadı';
      // Adres bilgisi
      const address = Array.from(document.querySelectorAll('span'))
        .find(span => span.textContent.includes('Cd.') || span.textContent.includes('Bandırma'))?.textContent || 'Adres bulunamadı';

      return { businessName, phone, address };
    });

    console.log('Çekilen veriler:', data);

    // Excel dosyasını kontrol et ve güncelle
    let workbook;
    let worksheet;
    let existingData = [];

    if (fs.existsSync(filePath)) {
      console.log('Mevcut Excel dosyası okunuyor...');
      workbook = XLSX.readFile(filePath);
      worksheet = workbook.Sheets['Sayfa1'];
      existingData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      console.log('Mevcut veriler:', existingData);
    } else {
      console.log('Yeni Excel dosyası oluşturuluyor...');
      workbook = XLSX.utils.book_new();
      existingData.push(['İşletme Adı', 'Telefon', 'Adres']); // Başlıklar
    }

    // Yeni veriyi ekle
    existingData.push([data.businessName, data.phone, data.address]);
    worksheet = XLSX.utils.aoa_to_sheet(existingData);

    // Mevcut sayfayı güncelle
    workbook.Sheets['Sayfa1'] = worksheet;

    XLSX.writeFile(workbook, filePath);
    console.log(`Excel dosyası güncellendi: ${filePath}`);

    res.json({ message: 'Veriler çekildi ve Excel’e kaydedildi.', scrapedData: data });
  } catch (err) {
    console.error('HATA:', err);
    res.status(500).json({ message: 'Bir hata oluştu', error: err.toString() });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Sunucuyu başlat
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend sunucu çalışıyor: http://localhost:${PORT}`);
});
