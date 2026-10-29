# Windows otomatik kurulum ve başlatma

Normal kullanımda iki dosya yeterlidir:

- `installer.bat`: ilk kurulum veya onarım.
- `run.bat`: uygulamayı başlatma ve tarayıcıyı açma.

Windows 10/11 x64, Windows PowerShell 5.1 ve internet bağlantısı gerekir. Yönetici olarak çalıştırmak gerekmez. BAT dosyaları PowerShell'i yalnızca kendi işlemleri için `-ExecutionPolicy Bypass` ile çağırır; sistemin execution policy veya kalıcı PATH ayarını değiştirmez.

## Kurucu ne yapar?

1. Uygun mevcut yerel/sistem Node.js ve npm kurulumunu kullanır; yoksa resmî Node.js dağıtımından 22 LTS paketini indirir ve SHA256 ile kontrol eder.
2. Projeye ait Python 3.12/3.13 veya uygun sistem Python'unu bulur. Sistem Python'u için proje sanal ortamı oluşturur; Python yoksa resmî Python 3.13.16 x64 embeddable paketini SHA256 kontrolüyle `.tools/python` içine açar ve pip hazırlar.
3. `npm ci` ve `pip install -r backend/requirements.lock.txt` çalıştırır. Paket yöneticisi hatasında durur; başarısız kurulumu tamamlandı diye göstermez.
4. Yalnızca eksikse `.env.example` dosyasından `.env` oluşturur. İçe aktarmaları ve üretim derlemesini doğrular.
5. Varsayılan tam kurulumda mevcut Ollama'yı bulur veya resmî GitHub sürümünün Windows x64 paketini SHA256 kontrolüyle proje içine kurar. Seçili yerel Gemma 4 modelini `ollama pull` ile indirir.
6. Modelden bir JSON deneme yanıtı alırsa canlı model kontrolünün başarılı olduğunu söyler. Yalnızca dosyanın inmesi “AI bağlı” sayılmaz. Kurucunun başlattığı geçici Ollama servisi işlem sonunda kapanır; `run.bat` gerektiğinde yeniden açar.

Node.js dağıtım listesi: https://nodejs.org/dist/index.json

Python sürümü ve paket kaynağı: https://www.python.org/downloads/release/python-31316/

Ollama Windows bağımsız CLI dağıtımı: https://docs.ollama.com/windows

## Modelleri indirmeden dene

```bat
installer.bat -Demo
run.bat
```

Uygulamada örnek bursu açıp demo kutusunu kullanın. Bu seçenek `.env` içindeki model veya demo ayarlarını değiştirmez. Model kurulumu olmadan kendi belgenizin canlı analizi yapılamaz. İstediğiniz zaman `installer.bat` çalıştırarak AI kurulumunu tamamlayabilirsiniz.

Yalnızca frontend gerekiyorsa `run.bat -Demo` kullanın.

## Güncelleme ve hata durumları

- Kurucuyu yeniden çalıştırmak kurulum/onarım yapar; kaynak kodu, `.env` ve kişisel başvuru belgelerini değiştirmez.
- Model kurulumu başarısız olur ama uygulama kurulumu tamamlanırsa bu açıkça yazılır; demo kullanılabilir.
- Yanlış veya harici Ollama adresi ve desteklenmeyen model etiketi reddedilir. Başka modele otomatik geçiş yoktur.
- 5173 veya 8000 portu başka bir uygulama tarafından kullanılıyorsa başlatıcı o işlemi kapatmaz. Diğer sunucu penceresini kapatıp tekrar deneyin.
- Zaten çalışan FormDedektifi arayüzü ve backend'i HTTP yanıtlarından tanınır ve kullanılır. Eksik olan servis başlatılır; önceden açık servisler kapatılmaz. Aynı klasörde zaten çalışan yeni başlatıcı varsa ikinci `run.bat` ek servis açmadan tarayıcıyı açar.
- `.tools/logs/` altında `frontend.log`, `frontend-error.log`, `backend.log`, `backend-error.log` ve gerektiğinde Ollama kayıtları bulunur.
- Ollama'nın bağımsız Windows paketi NVIDIA/CPU içindir; bazı AMD cihazlarda ek GPU paketleri/sürücüleri gerekir. Kurucu GPU sürücüsü yüklemez. Resmî Ollama Windows rehberine bakın.

## Tanılama

`run.bat` artık varsayılan olarak canlı debug konsoludur. Açılışta proje klasörü, runtime sürümleri, seçili Gemma etiketi, Ollama erişimi, modelin kurulu olup olmadığı ve **API key gerekmediği** yazılır. Sonrasında istek yolları, HTTP durumları, süreler ve güvenli hata kodları izlenir. Kaynak belge, kişisel bilgi, modelin yanıtı ve düşünme içeriği loglanmaz.

- Toplu konsol kaydı: `.tools/logs/run.log`
- Yapılandırılmış backend kaydı: `.tools/logs/backend-events.log`
- Arayüz hatasının `[Tanı: ...]` numarası, backend kaydındaki `request=...` ile aynıdır.
- `model_missing`: seçili etiket indirilmemiş; `ollama_unreachable`: yerel servis erişilemiyor; `ollama_timeout`: süre aşıldı; `model_output_invalid`: şema/kaynak doğrulaması geçmedi.

Başlatıcı, `/api/runtime` üzerinden çalışan backend'in gerçek klasörünü öğrenir. Başka bir proje kopyası çalışıyorsa o backend'in logları izlenir. UTF-8 JSON yolları Windows PowerShell 5'te de Türkçe klasör adlarıyla okunur. Başlatıcı eski `ONCEKI` kayıtlarını tekrar basmaz; yalnızca yeni olayları gösterir. Daha önceki testlerden kalan Ollama port hatası yeni bir hata gibi gösterilmez.

Özel PDF analizinde kaynak alıntıları modelin yeniden yazdığı metinden değil, modelin seçtiği özgün belge bölümlerinden alınır. Böylece PDF'deki satır kırılmaları ve bölünmez boşluklar kaynak doğrulamasını bozmaz. Geçersiz bölüm numarası veya kaynakta desteklenmeyen limit/tarih güvenli hata kodlarıyla loglanır. Analiz sürerken bağlantı kontrolü ek bir model çağrısı başlatmaz. Küçük belgeler 8192 bağlamla işlenir; analiz düğmesinde geçen süre görünür. Dosya yükledikten sonra **Başvurumu Analiz Et** düğmesine basın.

Eski bir backend arka planda kalmışsa yalnızca bu projenin Python işlemi doğrulandıktan sonra yeniden başlatılabilir:

```bat
run.bat -RestartBackend
```

Başka bir projeye ait işlem doğrulanmadan kapatılmaz. Önceden açılmış servisler normal çalıştırmada korunur; konsol yeni kayıtları izlemeye devam eder. Kontrol karakterleri temizlenir ve aşırı uzun satırlar kısaltılır.

Gemma 4'ün düşünme modu, kısa JSON sağlık kontrolünün çıktı sınırını tüketebildiği için yapılandırılmış çağrılarda açıkça `think:false` kullanılır. Sağlık ve taslak çağrıları aynı 8192 token bağlamını kullanarak gereksiz model yeniden yüklemesini azaltır. Paralel sağlık kontrolleri tek bir model probunu paylaşır ve kullanıcı taslak slotlarını tüketmez.

Yanıt asistanında örnek analiziyle başlamış olsanız da **Taslağı gerçek Gemma 4 ile oluştur** seçeneği varsayılan olarak açıktır. Düğme canlı modele soruyu iletir ve yeni bir paragraf yazdırır. Bilgi alanını boş bırakabilirsiniz: bu durumda model genel bir öneri üretir ve yanıtın altında kişisel bilgi verilmediği belirtilir. Bilgi eklerseniz yanıt buna göre yazılır. Ek sorular, yanıt alanının altında **Şu soruları da yanıtlarsanız taslağınız güçlenir** başlığıyla isteğe bağlı öneriler olarak görünür. Boş şablon ve köşeli parantezli yer tutucu yanıtlar kabul edilmez; modelden yeniden üretim istenir. Model erişilemiyorsa hata gösterilir, demo sessizce devreye girmez. Gerçek modeli açıkça kapatırsanız demo hazır örnek yanıtı veya kendi metninizi gösterir. Model çalışırken geçen süre gösterilir.

Öneri sorularının altında cevap alanları bulunur. En az bir cevap yazınca **Yanıtlarımla taslağı güncelle** düğmesi kullanılabilir. Bu işlem mevcut bilgileri ve ek cevapları birleştirerek yalnızca ilgili form sorusunun yanıtını yeniden üretir. Cevaplar güncellemeden sonra düzenlenebilir halde kalır; model hatasında önceki taslak silinmez. Cevap metinleri loglanmaz, yalnızca yanıtlanan soru sayısı kaydedilir.

Bağımlılıkların varlığını indirme veya değişiklik yapmadan kontrol edin:

```bat
installer.bat -CheckOnly
```

Servislerin başlatılıp HTTP yanıtı verdiğini tarayıcı açmadan sınayın:

```bat
run.bat -SmokeTest -NoBrowser
```

Bu kontrol geçici portlar kullanır ve bitince kendi servislerini kapatır; model çıkarım testi değildir. Başlatıcının aynı kurulumda sonraki çalıştırmada da açılabildiğini kontrol etmek için tekrar çalıştırılabilir. Otomasyonda BAT dosyalarının duraklamasını atlamak için `FORMDEDEKTIFI_NO_PAUSE=1` ortam değişkeni kullanılabilir.
