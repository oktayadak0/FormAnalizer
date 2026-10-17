# Üç dakikalık jüri sunumu

**0:00 — Sorun (20 sn)**

“Bir burs başvurusunda bir belgeyi veya tek bir karakter sınırını kaçırmak kolay. FormDedektifi, uzun yönergeleri kaynakları görünen bir yol haritasına çeviriyor.”

**0:20 — Kaynağı ekle (25 sn)**

Örnek bursu açın. Belgenin gerçek ilan olmadığını gösterin. Model bağlıysa demo kutusunu kapatıp canlı analiz yapın; değilse “Şu anda açıkça etiketlenmiş, önceden hazırlanmış demo sonuçlarını kullanıyorum” deyin.

**0:45 — Gereklilikleri gör (35 sn)**

Aktif lisans öğrenciliği, 2,50 not ortalaması, öğrenci belgesi, transkript, 500 karakterlik motivasyon sorusu ve 30 Kasım 2026 son tarihini gösterin. Bir “Kaynak cümlesini gör” bağlantısını açın. “Her alıntıyı kaynakta birebir arıyoruz; model yorumunu yine kullanıcı kontrol ediyor.”

**1:20 — Eksikleri bul (30 sn)**

Öğrenci belgesini “Devam ediyor”, sonra “Tamamlandı” yapın. Yüzde değişimini gösterin. “Bu, kişisel iş listesi ilerlemesi; kurumun başvuruyu onayladığı anlamına gelmiyor.” Eksik bilgilerde öğrenci beyanı yazıp karşılaştırın. Uygunluğun otomatik onaylanmadığını belirtin.

**1:50 — Yanıt hazırla (45 sn)**

Yanıt asistanında bilgi yazmadan taslak isteyin. Takip sorularını gösterin. Ardından kendi örnek beyanınızı iki satır halinde yazın:

```text
Yazılım mühendisliği alanında eğitimimi geliştirmek istiyorum.
Bu bursu ders kitapları ve eğitim materyalleri için kullanacağım.
```

Taslağı oluşturun. Demo kullanılıyorsa bunun iki satırı birleştiren bir düzenleme olduğunu söyleyin. Canlı modda Gemma 4 yalnızca verilen ifadeleri seçip sıralar; yeni kişisel bilgi ekleyemez. Sayacı, düzenlemeyi ve kopyalamayı gösterin.

**2:35 — Yerel mimari (25 sn)**

“React arayüzü → yerel FastAPI → Ollama / Gemma 4. Ayrı görev istemleri ve Pydantic JSON şemaları var. Kaynak ve kişisel bilgi alıntılarını doğruluyoruz. Model yoksa bağlı demiyoruz. Veriler sekme belleğinde; dış servise belge göndermiyoruz.”

Verileri temizleyerek bitirin. MIT lisansını ve testleri gösterin.
