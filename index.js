const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');

// MongoDB veri modeli
const businessSchema = new mongoose.Schema({
  businessName: String,
  phone: String,
  address: String,
});

const Business = mongoose.model('Business', businessSchema);

// Express uygulamasını başlat
const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB bağlantısı
mongoose.connect('mongodb://localhost:27017/scraperDB')
  .then(() => {
    console.log('MongoDB bağlantısı başarılı');
  })
  .catch((err) => {
    console.error('MongoDB bağlantı hatası:', err);
  });

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
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    console.log(`URL'ye gidiliyor: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log('Veriler DOM\'dan çekiliyor...');
    const data = await page.evaluate(() => {
      const businessName = document.querySelector('.rgnuSb.tZPcob')?.textContent || 'Ad bulunamadı';
      const phone = document.querySelector('.eigqqc')?.textContent || 'Telefon bulunamadı';
      const address = Array.from(document.querySelectorAll('span'))
        .find(span => span.textContent.includes('Cd.') || span.textContent.includes('Bandırma'))?.textContent || 'Adres bulunamadı';

      return { businessName, phone, address };
    });

    console.log('Çekilen veriler:', data);

    // Veriyi MongoDB'ye kaydet
    const newBusiness = new Business({
      businessName: data.businessName,
      phone: data.phone,
      address: data.address,
    });

    await newBusiness.save();
    console.log('Veriler MongoDB’ye kaydedildi');
    res.json({ message: 'Veriler çekildi ve MongoDB’ye kaydedildi.', scrapedData: data });
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
