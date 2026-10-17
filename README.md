# FormDedektifi

**Başvurunu anlamak kolay. Eksiklerini görmek daha kolay.**

Hacktoberfest Elazığ 2026 için hazırlanmış, Türkçe arayüzlü ve MIT lisanslı yerel başvuru asistanı. React + Vite + TypeScript + Tailwind CSS arayüzü; FastAPI + Pydantic backend'i; Ollama üzerinde **Gemma 4** kullanır. Örnek burs akışı, model veya backend kurulmadan da çalışır.

## Windows'ta çift tıklayarak kurulum

1. **`installer.bat`** dosyasına çift tıklayın. Eksik Node.js/npm ve Python araçlarını proje içine kurar; uygulama bağımlılıklarını yükler, `.env` yoksa oluşturur, arayüzü derler. Ardından Ollama ve `.env` içinde seçilen yerel Gemma 4 modelini indirip gerçek model yanıtını kontrol eder. Mevcut `.env` üzerine yazılmaz. İlk kurulum internet ve model için birkaç GB boş alan gerektirir.
2. Kurulumdan sonra **`run.bat`** dosyasına çift tıklayın. Backend, arayüz ve gerekiyorsa yerel Ollama başlatılır; servisler hazır olunca tarayıcı otomatik açılır. Pencere açık kalsın; **Ctrl+C** uygulamanın başlattığı servisleri durdurur. Zaten çalışan harici Ollama servisi kapatılmaz.

Model indirmeden yalnızca uygulamayı kurmak için terminalde `installer.bat -Demo` kullanın. Sonrasında `run.bat` ile örnek bursu demo seçeneğiyle açabilirsiniz. `run.bat -Demo` yalnızca arayüzü başlatır. `run.bat`, eksik uygulama bağımlılıklarını otomatik tamamlar; eksik AI modelini sessizce indirmez.

Yeni araçlar ve kurucunun başlattığı Ollama'nın model dosyaları `.tools/` altında tutulur; sistemin kalıcı PATH ayarı değiştirilmez. Zaten çalışan Ollama kullanılıyorsa indirme o servisin model klasörüne yapılır. Windows x64 desteklenir. Ayrıntılar ve tanılama seçenekleri: [Windows kurulum rehberi](docs/WINDOWS.md).

## Hızlı başlangıç

Node.js 22.12+ (güncel 22 LTS önerilir), npm ve Python 3.12+ kurulu olmalı. Komutları proje kökünde çalıştırın.

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
Copy-Item .env.example .env
```

İlk terminalde backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

İkinci terminalde arayüz:

```powershell
npm run dev
```

Tarayıcıda **http://127.0.0.1:5173** açın. Vite, `/api` isteklerini yalnızca yerel FastAPI'ye yönlendirir. API belgeleri: http://127.0.0.1:8000/docs.

macOS/Linux için Python komutları:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock.txt
cp .env.example .env
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
# Ayrı terminal:
npm run dev
```

Windows'ta `scripts/start.ps1`, kurulu bağımlılıklarla iki servisi birlikte başlatır. Bu çalışma ortamı için proje içine indirilen `.tools` araçlarını da bulur; global kurulum değiştirmez. `Ctrl+C` ile başlattığı servisleri durdurur.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

## Model olmadan demo

Yalnızca frontend yeterli:

```powershell
npm ci
npm run dev
```

1. **Örnek ekle** düğmesine basın. Burs, staj, hackathon, gönüllülük, girişimcilik, araştırma, sürdürülebilirlik, tasarım, açık kaynak, değişim, mentorluk, sosyal proje ve yaratıcı yazarlık için 13 örnek vardır. Her örnekte üç form sorusu, belge şartları, karakter sınırları ve son tarih bulunur. Düğme her basışta mevcut örnekten farklı bir örneği rastgele getirir; analiz sonrasında da kullanılabilir.
2. **Önceden hazırlanmış demo sonuçlarını kullan** seçeneği açık kalsın.
3. **Başvurumu Analiz Et** düğmesine basın.
4. Kaynak cümlelerini açın, kontrol listesindeki durumları değiştirin.
5. **Eksik bilgiler** sekmesinde beyan yazıp **Karşılaştır** düğmesine basın.
6. **Yanıt asistanı** sekmesinde önce boş bilgiyle deneyin; takip soruları görünür.
7. Yanıt asistanında tüm form soruları alt alta görünür. Her sorunun kendi bilgi alanı, **Gemma 4 ile taslak oluştur** düğmesi, düzenlenebilir yanıtı, karakter sayacı ve kopyalama düğmesi vardır. Öneri soruları ilgili yanıtın altında kalır. Bir sorunun yanıtını oluşturmak diğer soruların metinlerini silmez. Bilgi alanı isteğe bağlıdır: boşken genel bir öneri, doldurulduğunda bu bilgilere göre bir yanıt hazırlanır. Örnek analizi kullanırken de taslak için varsayılan olarak gerçek model çağrılır. Gerçek modeli kapatırsanız demo, hazır örnek yanıtı veya kendi metninizi gösterir; AI üretimi değildir.
8. Taslağın altındaki öneri sorularını doğrudan kendi cevap alanlarında yanıtlayın. **Yanıtlarımla taslağı güncelle** düğmesi önceki kişisel bilgileri ve ek cevapları birlikte modele gönderir. Cevaplar o form sorusuna bağlı kalır; güncellemeden sonra da düzenlenebilir. Boş bırakılan sorular gönderilmez. Ek cevaplar soru başına en fazla 1.500, ilk bilgilerle toplam en fazla 6.000 karakter olabilir. Model hatasında mevcut taslak ve yazdığınız cevaplar korunur.
8. Yanıtı düzenleyin, karakter sayacını ve kopyalama düğmesini kullanın.

Demo tüm ekranda etiketlenir. Sadece `shared/demo.json` içindeki **değiştirilmemiş** kaynak için önceden hazırlanmış analiz gösterilir. Kullanıcının kendi belgesine demo sonuçları uygulanmaz. Backend demosu için `.env` içinde `DEMO_MODE=true` kullanabilirsiniz; istemcinin yine açıkça `demo:true` göndermesi gerekir. Bu ayar gerçek analiz isteklerini örneğe dönüştürmez.

Windows'ta yalnızca demoyu başlatmak için:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start.ps1 -Demo
```

## Gemma 4 / Ollama kurulumu

**Yerel Ollama için API key gerekmez.** Bu cihazda bulunan model `gemma4:e2b` olduğu için yerel `.env` seçimi buna ayarlanmıştır. Modelin adı `.env` içinde yazıyor diye kurulu sayılmaz; uygulama servis erişimini, model listesini ve gerçek yanıtı ayrı ayrı kontrol eder. `Model ve bağlantı` ekranı bu durumları gösterir. `run.bat` varsayılan olarak canlı debug kayıtlarını CMD'ye ve `.tools/logs/run.log` dosyasına yazar.

17 Ekim 2026 tarihinde resmî [Ollama model kataloğunda](https://ollama.com/library/gemma4) ve [gemma4:e4b model sayfasında](https://ollama.com/library/gemma4:e4b) yerel etiket doğrulandı. [Ollama yapılandırılmış çıktı belgeleri](https://docs.ollama.com/capabilities/structured-outputs), `/api/chat` isteğinde JSON şeması kullanımını belgeliyor. Son tanı çalışmasında Ollama 0.40.5 üzerinde kurulu `gemma4:e2b` ile gerçek JSON sağlık yanıtı ve 297 karakterlik canlı taslak doğrulandı. Yeni kurulum örneği aşağıda E4B'yi kullanır; zaten kurulu E2B için `.env` dosyasında `OLLAMA_MODEL=gemma4:e2b` seçilmelidir. Güncel kararlı Ollama sürümü önerilir.

1. Güncel [Ollama](https://ollama.com/download) kurun ve çalıştırın. Masaüstü uygulaması servisi zaten açıyorsa ayrıca `ollama serve` başlatmayın.
2. Yerel modeli indirin ve deneyin:

```powershell
ollama --version
ollama pull gemma4:e4b
ollama run gemma4:e4b
```

3. Proje kökündeki `.env`:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e4b
OLLAMA_TIMEOUT=120
DEMO_MODE=false
```

4. Backend'i yeniden başlatın. Arayüzde **Model ve bağlantı → Bağlantıyı yeniden kontrol et** seçin. Backend `/api/show` ile yerel Gemma 4 mimarisini kontrol eder ve `/api/chat` üzerinden şemaya uygun gerçek bir yanıt alırsa **Gemma 4 Bağlı** gösterir.

Doğrudan kontrol:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/status
```

Örnek burs metni açıldığında bağlantı varsa varsayılan canlı analizdir. Demo kutusu kapalıyken **Başvurumu Analiz Et** gerçek Gemma 4 analizi yapar. Başarısızlıkta hata gösterilir; otomatik model değişimi veya örnek sonuç ikamesi yapılmaz.

E4B indirmesi ve çalışma belleği birkaç GB gerektirir; kesin ihtiyaç cihaz ve kuantizasyona bağlıdır. Katalogda doğrulanan daha küçük `gemma4:e2b` etiketi de `.env` ile **açıkça** seçilebilir. İzin verilen diğer yerel etiketler `gemma4:12b`, `gemma4:26b`, `gemma4:31b`'dir. Bulut etiketleri ve farklı model aileleri engellenir. İndirme/çalıştırma desteklenmiyorsa Ollama'yı güncelleyin; hâlâ çalışmıyorsa demoyu kullanın. Alternatif bir runtime adaptörü projede uygulanmış değildir; model etiketini sessizce başka aileye çevirmeyin.

## Özellikler ve veri akışı

- TXT, PDF ve DOCX yükleme; metin yapıştırma; 5 MB dosya ve 40.000 Unicode karakter sınırı. PDF/DOCX ayrıştırma yereldir. Şifreli, bozuk, çok büyük, sıkıştırılmış içeriği aşırı veya metinsiz belgeler anlaşılır hatayla reddedilir.
- Başlık, amaç, uygunluk koşulları, belgeler, sorular, alanlar, tarihler, gönderim ve biçim kuralları; her biri kaynak alıntısıyla gösterilir.
- Durumu değiştirilebilen kontrol listesi ve anında ilerleme yüzdesi. Bu ilerleme kişisel işaretlemedir; resmî eksiksizlik veya uygunluk kararı değildir.
- Eksik / sağlanan / doğrulanması gereken / uygulanmıyor beyanları. Kişisel bilgiler yalnızca kullanıcı yazarsa modele verilir.
- Karakter sınırına bağlı yanıt asistanı; eksik bilgi soruları; düzenleme, sayaç ve kopyalama.
- Son tarih, zorunlu belge, soru ve uygunluk uyarıları; belirsiz veya çelişen kaynak ifadeleri.
- Oturum içinde en fazla 10 ayrı başvuru; yeni başvuru, geçiş ve temizleme.
- Türkçe, responsive arayüz; klavye odak stilleri, etiketli kontroller, hareket azaltma tercihi ve ekran okuyucu bildirimleri.

Tüm canlı AI istekleri **FastAPI → yerel Ollama → Gemma 4** yolundan gider. `ai.py` Pydantic JSON şemasını Ollama `format` alanına koyar. Analiz, eksik bilgi ve taslak için ayrı sistem istemleri kullanılır. Çıktı önce Pydantic ile, sonra `grounding.py` ile doğrulanır:

1. Analizde model numaralı kaynak bölümlerini seçer. Sunucu alıntıyı doğrudan o bölümden alır; PDF satır sonları ve farklı boşluk karakterleri korunur. Kaynakta bulunmayan bölüm kimlikleri reddedilir. Tüm kaynak alıntıları özgün metinde kesintisiz ve birebir bulunmalıdır.
2. Karakter sınırı kaynakta aynı sayı ve `karakter` sözcüğüyle bulunmalıdır.
3. Kesin tarihler gün, ay, yıl, saat ve Türkiye/UTC+3 saat dilimiyle desteklenmelidir. Belirsiz tarih metin olarak gösterilir; yapay bir kesin tarih üretilmez.
4. Eksik bilgi sonucu tüm gereklilikleri birer kez kapsamalıdır; sağlandı durumu ilgili kullanıcı beyanından alıntı gerektirir. Uygulanmıyor durumu kullanıcının açık seçimi ve açıklaması olmadan kabul edilmez.
5. **Yanıt üretimi:** Gemma 4 doğrudan yeni bir paragraf yazar; yalnızca alıntıları birleştirmez. Kullanılan kişisel bilgi dayanaklarının kullanıcı metninde birebir bulunduğu, yanıtın boş/yer tutuculu olmadığı ve karakter sınırına uyduğu denetlenir. Bilgi alanı boşken genel bir öneri oluşturulur ve arayüzde açıkça belirtilir. Model istemi verilmemiş okul, gelir, başarı veya deneyim uydurmayı yasaklar. Alıntı kontrolü, üretilen paragraftaki tüm kişisel ifadelerin anlamsal doğruluğunu kanıtlamaz; kullanıcı göndermeden önce kontrol etmelidir. Ek sorular yanıt alanının altında isteğe bağlı önerilerdir.

Şema veya alıntı doğrulaması başarısızsa modelden bir kez düzeltme istenir. İkinci başarısızlıkta çıktı gösterilmez. Her model çağrısının zaman aşımı, sınırlı çıktı uzunluğu ve en fazla iki eşzamanlı işlem sınırı vardır. Yeniden deneme toplam süreyi iki katına çıkarabilir. Harici adres, ortam proxy'si, HTTP yönlendirmesi ve Ollama bulut modeli kullanımı kapalıdır.

## Gizlilik

Başvurular, beyanlar ve yanıtlar **yalnızca sekme belleğindedir**. localStorage, veritabanı, hesap veya izleme servisi yoktur. Yenileme/kapatma verileri kaybettirir; **verileri temizle** mevcut başvuruyu siler. Kendi çalışmalarınızı ayrıca kopyalayın. Oturum başvuruları kalıcı kayıt değildir.

Yüklemeler yerel backend'de bellekte ayrıştırılır ve uygulama tarafından diske yazılmaz. Belgeler üçüncü tarafa gönderilmez. Ollama kendi model ağırlıklarını diskte tutar; işletim sistemi swap/crash dump davranışı bu uygulamanın kontrolünde değildir. API erişim kayıtları yol/durum içerebilir; uygulama belge veya kişisel bilgi içeriği loglamaz. İnternete/LAN'a yayınlamak için hazırlanmış çok kullanıcılı bir servis değildir; servisleri `127.0.0.1` üzerinde tutun.

## Testler ve derleme

```powershell
npm test
npm run build
.\.venv\Scripts\python.exe -m pytest
# Yerel Chrome kuruluysa (tarayıcı indirme gerekmez):
npm run test:e2e
```

`npm run preview` yalnızca üretim arayüzünü sunar. Canlı API için Vite geliştirme sunucusunu kullanın veya `/api` için kendi yerel reverse proxy'nizi yapılandırın.

Frontend testleri kaynak kanıtı, kontrol listesi yüzdesi, Unicode karakter sayısı, taslak sınırları ve tarih durumlarını doğrular. Backend testleri gerçek ayrıştırıcılarla TXT/PDF/DOCX, şema/kanıt denetimleri, eksik bilgi, uydurulmuş kişisel iddia, boyut sınırları ve hata kurtarmayı kapsar. Model servis testleri taklit yanıt kullanır; gerçek Gemma 4 başarımı ölçülmüş değildir. Playwright senaryoları model kapalıyken masaüstü/mobil burs akışını ve özel belgenin demoyla ikame edilmediğini kontrol eder.

Çalıştırılmış sonuçlar ve kalan sınırlamalar: [docs/VALIDATION.md](docs/VALIDATION.md). Jüri sunumu: [docs/DEMO.md](docs/DEMO.md).

## Dizin yapısı

```text
FormAnaliz/
├── src/                   # React çalışma alanı, API istemcisi, Vitest testleri
├── public/                # Yerel SVG favicon
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI rotaları ve yerel erişim sınırları
│   │   ├── ai.py          # Gemma 4 / Ollama servisi
│   │   ├── prompts.py     # Üç ayrı görev istemi
│   │   ├── schemas.py     # Pydantic sözleşmeleri
│   │   ├── grounding.py   # Kaynak, tarih, beyan ve taslak doğrulaması
│   │   ├── documents.py   # TXT, PDF, DOCX ayrıştırma
│   │   ├── demo.py        # Açıkça talep edilen sabit demo
│   │   └── config.py      # Yerel model yapılandırması
│   ├── tests/
│   ├── requirements.txt
│   └── requirements.lock.txt
├── shared/demo.json       # İlk örnek burs, analiz ve soruya özel demo yanıtları
├── shared/examples.json   # Diğer 12 başvuru, analizleri ve soruya özel demo yanıtları
├── samples/umut-bursu-2026.txt
├── e2e/                   # Masaüstü/mobil Playwright testleri
├── scripts/start.ps1      # Windows yerel başlatıcı
├── docs/                  # Demo ve doğrulama notları
├── .env.example
├── package.json
├── package-lock.json
└── LICENSE
```

## Bilinen sınırlar

Alıntının belgede bulunması, model yorumunun anlamsal olarak doğru veya tüm gerekliliklerin eksiksiz çıkarılmış olduğunu kanıtlamaz. Kaynağı karşılaştırın. Otomatik uygunluk onayı verilmez. Başvurular kurum sistemine gönderilmez, gerekli belgelerin kendisi doğrulanmaz.

Taslaklar modelin yazdığı önerilerdir; kişisel bilgi yoksa genel amaç ifadeleri içerebilir. Model kişisel gerçekler uydurmaması için yönlendirilir, ancak bu bir doğruluk garantisi değildir. Kullanıcı tüm kişisel ifadeleri kontrol edip düzenlemelidir. Demo hazır örnek yanıtı veya kullanıcının satırlarını gösterir ve beyanların anlamını yorumlamaz. Model erişilemiyorsa canlı üretim yapılmış gibi gösterilmez.

OCR yoktur. DOCX ana gövde paragrafları ve tabloları okunur; üstbilgi, dipnot, metin kutuları ve karmaşık düzenler eksik kalabilir. PDF metin okuma sırası görsel sıradan farklı olabilir. Kesin tarih ayrıştırması Türkçe veya sayısal tarihleri ve açık Türkiye saatini kapsar; diğer tarih/saat dilimleri alıntı olarak görünür ve teyit gerektirir. Kuralları belirten metin ile başvuranın kişisel bilgisi ayrı tutulur.
