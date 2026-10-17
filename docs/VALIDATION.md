# Doğrulama kaydı

17 Ekim 2026 tarihinde Windows ortamında çalıştırıldı. Yerel geliştirme araçları: Node.js 22.20.0, npm 10.9.3, Python 3.12.10, kurulu Google Chrome. Projeye özel taşınabilir araçlar `.tools/` içindedir ve kaynak dağıtımının parçası değildir.

| Kontrol | Sonuç |
| --- | --- |
| `npm ci` | Kilit dosyasından temiz kurulum başarılı |
| `npm run build` | TypeScript kontrolü ve Vite üretim derlemesi başarılı |
| `npm test` | 6 test geçti |
| `python -m pytest` | 39 test geçti |
| `npm run test:e2e` | 6 senaryo geçti: masaüstü ve mobil Chrome |
| Axe otomatik kontrolleri | Açılış ve dört analiz sekmesinde WCAG 2 A/AA ve 2.1 AA etiketli kurallar için ihlal bulunmadı |
| `npm audit --audit-level=moderate` | 0 açık bildirildi |
| Gerçek yerel HTTP isteği | FastAPI `/api/status` → `unavailable`; `/api/analyze` açık demo isteği → 9 gereklilik |
| Windows başlatıcı | PowerShell sözdizimi geçerli; `scripts/start.ps1 -Demo` yerel Vite sunucusunu başlattı; HTTP 200 alındı |

Tarayıcı senaryoları: örnek yönergeyi açma, açık demo etiketi, birebir kaynak alıntısı, kontrol listesi yüzdesi, kişisel beyan, takip soruları, yalnızca verilen satırlardan taslak, 500 karakter sınırı uyarısı, veri temizleme, oturum ayrımı, özel belgenin demo sonuçlarıyla ikame edilmemesi, yatay taşma ve yakalanmamış JavaScript hatası kontrolü. Ek erişilebilirlik senaryosu metin kontrastını ve otomatik WCAG kurallarını denetler. Bu denetim, tüm engelli kullanıcı deneyimleri için sertifika veya tam manuel erişilebilirlik denetimi değildir.

Backend testleri gerçek TXT/PDF/DOCX ayrıştırıcılarını çalıştırır. Canlı AI servis testlerinde model yanıtı taklit edilir; Gemma 4 çıktısının kalite veya hız ölçümü değildir.

Pytest sonucunda bir **başarısızlığa neden olmayan Starlette TestClient/httpx kullanımdan kaldırma uyarısı** alındı. Model gerektiren canlı analiz, eksik bilgi ve taslak akışının gerçek Ollama çıkarımı bu makinede doğrulanmadı: Ollama kurulu değildi. Uygulama bu durumda modelin bağlı olduğunu iddia etmez.

`gemma4:e4b` desteği resmî Ollama kataloğunda doğrulanmıştır; kurulum ve gerçek yanıt doğrulaması için README adımlarını uygulayın. Kesin bir minimum Ollama sürümü tahmin edilmemiştir. Güncel kararlı sürümle model indirilemiyorsa demo kullanılabilir; başka modele otomatik geçilmez.

Kalan ürün sınırları: yalnızca oturum belleğinde başvuru saklama, OCR bulunmaması, DOCX üstbilgi/dipnot/metin kutularının kapsam dışında olması, alıntı doğrulamasının anlamsal doğruluğu garanti etmemesi ve yanıtların güvenilirlik amacıyla kullanıcı ifadelerinden seçilip sıralanması. Başvuru gönderimi, belge doğrulaması ve otomatik uygunluk onayı yoktur. Ayrıntılar README'dedir.

![FormDedektifi çalışma alanı](preview.png)

## BAT kurucu ve başlatıcı kontrolleri

`installer.bat` ve `run.bat`, 17 Ekim 2026 tarihinde ayrıca doğrulandı:

- Türkçe ve boşluk içeren ayrı klasörde Node.js 22 LTS otomatik indirildi, SHA256 kontrolü geçti ve bağımlılıklar kuruldu.
- Mevcut sistem Python'u için sanal ortam kurulumu ve sistem Python'u PATH'ten kaldırıldığında Python 3.13.16 embeddable indirmesi/pip kurulumu ayrı ayrı başarıyla çalıştı.
- Her iki kurulumda üretim derlemesi geçti. Tekrarlanan kurulum, özelleştirilmiş `.env` dosyasının SHA256 değerini değiştirmedi.
- Yeni indirilen Node.js 22.23.3 ve Python 3.13.16 ile `run.bat -NoBrowser -SmokeTest`, backend ve frontend HTTP yanıtlarını alıp kendi servislerini kapattı.
- Ana klasörde ve `FormAnalizer` Git kopyasında bağımlılık kontrolü ve başlatma kontrolü geçti. Zaten çalışan arayüz kullanıldı; eksik backend başlatıldı. İkinci başlatıcı ek servis açmadı.
- Bu testlerde `-Demo` kullanılarak büyük Ollama/Gemma 4 indirmesi atlandı. Tam AI indirme ve gerçek çıkarım yolu bu doğrulama kapsamına dahil değildir.
