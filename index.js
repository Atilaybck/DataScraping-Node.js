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
  isContacted: { type: Boolean, default: false },

  // Yeni eklenen alanlar: isNewUser, replied, priority, note
  isNewUser: { type: Boolean, default: false },
  replied: { type: Boolean, default: false },
  priority: { type: Boolean, default: false },
  note: { type: String, default: '' },
});

const Business = mongoose.model('Business', businessSchema);

// Express uygulaması
const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB bağlantısı
mongoose
  .connect('mongodb://localhost:27017/scraperDB')
  .then(() => {
    console.log('MongoDB bağlantısı başarılı');
  })
  .catch((err) => {
    console.error('MongoDB bağlantı hatası:', err);
  });

// Google Maps scraping endpoint
app.post('/scrape', async (req, res) => {
  const { url, city } = req.body;
  let browser;

  if (!url) {
    return res.status(400).json({ message: 'URL eksik' });
  }

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Sayfadaki iş yeri adı ve telefon bilgisi
    const data = await page.evaluate(() => {
      const businessName =
        document.querySelector('.rgnuSb.tZPcob')?.textContent || 'Ad bulunamadı';
      const phone =
        document.querySelector('.eigqqc')?.textContent || 'Telefon bulunamadı';

      let scrapedAddress = 'Adres bulunamadı';
      const allSpans = Array.from(document.querySelectorAll('span'));
      const addressSpan = allSpans.find((span) =>
        /Cd\.|Sk\.|No:|Kocasinan|Kayseri|Bandırma|Balıkesir|Mah\.|Mh\.|Sok\.|\d{5}/i.test(
          span.textContent
        )
      );
      if (addressSpan) {
        scrapedAddress = addressSpan.textContent.trim();
      }

      return { businessName, phone, address: scrapedAddress };
    });

    // city varsa adresi override et
    if (city) {
      data.address = city;
    }

    // Veritabanında aynı kayıttan var mı?
    const existingRecord = await Business.findOne({
      businessName: data.businessName,
      phone: data.phone,
      address: data.address,
    });
    const phoneMatch = await Business.findOne({ phone: data.phone });

    if (existingRecord) {
      return res.status(200).json({
        message: 'Bu veri zaten kaydedilmiş.',
        scrapedData: data,
      });
    }
    if (phoneMatch) {
      return res.status(200).json({
        message: 'Bu numara zaten kayıtlı.',
        scrapedData: data,
      });
    }

    // Yeni kayıt oluştur
    const newBusiness = new Business({
      businessName: data.businessName,
      phone: data.phone,
      address: data.address,
      isContacted: false,
      // isNewUser, replied, priority, note --> Varsayılan olarak şemada false / ''
    });
    await newBusiness.save();

    res.json({
      message: 'Veriler çekildi ve MongoDB’ye kaydedildi.',
      scrapedData: data,
    });
  } catch (err) {
    console.error('HATA:', err);
    res.status(500).json({ message: 'Bir hata oluştu', error: err.toString() });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Tüm müşterileri getirme
app.get('/businesses', async (req, res) => {
  try {
    const businesses = await Business.find();
    res.json(businesses);
  } catch (err) {
    console.error('Veriler alınamadı:', err);
    res.status(500).json({ message: 'Veriler alınırken bir hata oluştu' });
  }
});

// Müşteri iletişim durumunu (ve diğer alanları) güncelleme
app.patch('/businesses/:id', async (req, res) => {
  const { id } = req.params;
  const {
    businessName,
    phone,
    address,
    isContacted,

    // Yeni eklenen alanlar
    isNewUser,
    replied,
    priority,
    note,
  } = req.body;

  try {
    const updatedBusiness = await Business.findByIdAndUpdate(
      id,
      {
        businessName,
        phone,
        address,
        isContacted,

        // Yeni alanların güncellenmesi
        isNewUser,
        replied,
        priority,
        note,
      },
      { new: true }
    );
    if (!updatedBusiness) {
      return res.status(404).json({ message: 'Müşteri bulunamadı.' });
    }
    res.json(updatedBusiness);
  } catch (err) {
    console.error('Müşteri durumu güncellenemedi:', err);
    res.status(500).json({ message: 'Bir hata oluştu.' });
  }
});

// Sunucuyu başlat
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend sunucu çalışıyor: http://localhost:${PORT}`);
});
