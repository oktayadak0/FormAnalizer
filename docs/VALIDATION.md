# Test kapsamı

## Otomatik kontroller

- **Vitest:** kontrol listesi ilerlemesi, Unicode karakter sayımı, demo sonuçları, profil bilgilerinin taslaklara aktarılması ve takip cevaplarının korunması.
- **pytest:** TXT/PDF/DOCX ayrıştırma, dosya sınırları, API doğrulaması, kaynak alıntıları, tarih ve karakter sınırları, profil çıkarımı, model hataları ve tanı kayıtlarında kişisel içeriğin tutulmaması.
- **Playwright:** masaüstü ve mobil başvuru akışları, örnek başvurular, bağımsız yanıt alanları, takip soruları, profil yükleme ve otomatik erişilebilirlik kontrolleri.
- **Üretim derlemesi:** TypeScript denetimi ve Vite derlemesi.

## Çalıştırma

```bash
npm test
npm run build
python -m pytest
npm run test:e2e
```

Python komutu, backend bağımlılıklarının kurulu olduğu ortamda çalıştırılmalıdır. Playwright ayarları yerel Google Chrome kullanır.

Model servislerine yönelik otomatik testlerde taklit yanıtlar kullanılır. Bu testlerin geçmesi, gerçek bir modelin analiz doğruluğunu veya performansını ölçmez. Canlı kullanım ayrıca kurulu Ollama modeliyle kontrol edilmelidir.

## Windows betikleri

```bat
installer.bat -CheckOnly
run.bat -SmokeTest -NoBrowser
```

İlk komut kurulum durumunu kontrol eder. İkinci komut geçici portlarda servislerin HTTP yanıtını kontrol edip kendi başlattığı servisleri kapatır; model çıkarımını sınamaz.

## Bilinen sınırlar

OCR, kalıcı başvuru kaydı, otomatik başvuru gönderimi ve resmî uygunluk onayı yoktur. Kaynak alıntısı kontrolü anlamsal doğruluk garantisi sağlamaz. PDF okuma sırası ve karmaşık DOCX öğeleri ayrıca kontrol edilmelidir.
