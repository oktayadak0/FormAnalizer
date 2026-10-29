# FormDedektifi

Başvuru yönergelerinden gerekli belgeleri, uygunluk koşullarını, form sorularını ve son tarihleri çıkaran yerel başvuru asistanı. Özgeçmiş ve profil belgelerindeki bilgileri kullanarak form sorularına düzenlenebilir yanıt taslakları hazırlar.

## Özellikler

- Metin yapıştırma veya TXT, PDF ve DOCX yükleme.
- Gereklilikleri kaynak metindeki alıntılarıyla birlikte gösterme.
- Belge ve görevler için kontrol listesi ve ilerleme takibi.
- Kullanıcı beyanlarını başvuru koşullarıyla karşılaştırma.
- Profil belgelerinden eğitim, deneyim, proje, beceri ve hedef bilgileri çıkarma.
- Her form sorusu için ayrı yanıt taslağı, karakter sayacı ve kopyalama.
- Takip sorularına verilen cevaplarla taslağı güncelleme.
- Model kurulumu gerektirmeyen 13 kurgusal başvuru örneği.

![FormDedektifi arayüzü](docs/preview.png)

## Nasıl çalışır?

Arayüz React, TypeScript, Vite ve Tailwind CSS ile hazırlanmıştır. FastAPI belgeleri yerel olarak ayrıştırır; analiz ve yanıt üretimi için Ollama üzerinden Gemma 4 kullanır. Model çıktıları Pydantic şemalarıyla kontrol edilir. Kaynak alıntılarının belgede bulunduğu ve yanıtların karakter sınırına uyduğu ayrıca doğrulanır.

Başvurular ve profil bilgileri sekme belleğinde tutulur. Veritabanı, hesap sistemi ve izleme servisi bulunmaz. Sayfa yenilendiğinde oturum verileri silinir. Belgeler uygulama tarafından diske kaydedilmez veya harici bir yapay zekâ servisine gönderilmez. Yerel Ollama bağlantısı için API anahtarı gerekmez.

## Kurulum

### Windows

1. `installer.bat` dosyasını çalıştırın. Gerekli araçları ve bağımlılıkları kurar; seçili Ollama modelini indirip kontrol eder.
2. Kurulum tamamlanınca `run.bat` dosyasını çalıştırın. Uygulama tarayıcıda açılır.

Model indirmeden denemek için:

```bat
installer.bat -Demo
run.bat -Demo
```

Ayrıntılar: [Windows kurulum rehberi](docs/WINDOWS.md).

### Elle kurulum

Node.js 22.12 veya üzeri, npm ve Python 3.12 veya üzeri gerekir. Komutları proje kökünde çalıştırın.

```bash
npm ci
python -m venv .venv
```

Windows:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

macOS / Linux:

```bash
.venv/bin/python -m pip install -r backend/requirements.lock.txt
cp .env.example .env
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Ayrı bir terminalde arayüzü başlatın:

```bash
npm run dev
```

Uygulama: <http://127.0.0.1:5173> · API belgeleri: <http://127.0.0.1:8000/docs>

### Yerel model

[Ollama](https://ollama.com/download) kurulu ve çalışır durumda olmalıdır. `.env.example` içindeki varsayılan modeli indirin:

```bash
ollama pull gemma4:e4b
```

Farklı bir desteklenen yerel etiket kullanacaksanız `.env` içindeki `OLLAMA_MODEL` değerini değiştirin. Bağlantı durumunu uygulamadaki **Model ve bağlantı** ekranından kontrol edebilirsiniz. Model hataları arayüzde gösterilir; canlı sonuç yerine otomatik olarak demo sonucu sunulmaz.

### Yalnızca demo

Backend veya model kurmadan arayüzü deneyebilirsiniz:

```bash
npm ci
npm run dev
```

**Örnek ekle** ile bir başvuru açın ve **Önceden hazırlanmış demo sonuçlarını kullan** seçeneğini işaretleyin. Demo yanıtlarını görmek için yanıt asistanındaki gerçek model seçeneğini de kapatın. Hazır sonuçlar yalnızca uygulamadaki değiştirilmemiş örneklere uygulanır.

## Sınırlar

Dosya başına üst sınır 5 MB, başvuru metni sınırı 40.000 karakterdir. Profil için en fazla 10 dosya ve toplam 40.000 karakter kabul edilir. OCR bulunmaz; taranmış PDF'ler metin içermiyorsa okunamaz. Karmaşık PDF düzenleri ve DOCX üstbilgi, dipnot veya metin kutuları eksik ayrıştırılabilir.

Kaynak alıntılarının doğrulanması, model yorumunun veya üretilen yanıtın bütünüyle doğru olduğunu garanti etmez. Taslaklar gönderilmeden önce kontrol edilmelidir. Uygulama başvuru göndermez ve resmî uygunluk kararı vermez. Servisler yerel kullanım için tasarlanmıştır.

## Geliştirme

```bash
npm test
npm run build
python -m pytest
npm run test:e2e
```

Python testlerini bağımlılıkların kurulu olduğu ortamda çalıştırın. Tarayıcı testleri yerel Google Chrome kullanır. Test kapsamı: [doğrulama notları](docs/VALIDATION.md).

- `src/`: arayüz, API istemcisi ve frontend testleri.
- `backend/`: API, belge ayrıştırma, model bağlantısı ve Python testleri.
- `shared/`: frontend ve backend'in ortak kullandığı kurgusal örnekler.
- `e2e/`: Playwright senaryoları.
- `scripts/`: Windows kurulum ve başlatma betikleri.

## Lisans

[MIT](LICENSE)
