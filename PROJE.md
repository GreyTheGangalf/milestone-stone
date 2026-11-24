# Milestone Taşı — Proje Özeti

Masaüstünün kenarında duran, projenin aktif milestone'unu gösteren küçük bir taş. Amaç, milestone'larla ilerlemeyi hem hatırlatıcı hem de eğlenceli hale getirmek. Her milestone tamamlandığında kısa bir geriye bakış yapılır, ardından taş mühürlenir.

İlk kullanım alanı: Türkiye Halüsinasyon Haritası projesinin M0–M7 milestone'ları. Uzun vadede başka kullanıcıların da kurabileceği bir "skill + widget" paketi olması hedefleniyor.

## Mimari

- **`milestones.json`**: tek doğruluk kaynağı. Konumu `%USERPROFILE%\.milestone-stone\milestones.json`.
- **Widget (Electron)**: dosyayı okur, taşı çizer, + / − ve mühürleme işlemlerini dosyaya yazar. Dosya dışarıdan değişirse kendini yeniler.
  - `main.js`: şeffaf, çerçevesiz, sağ alt köşede duran pencere; taşın dışında kalan alanda tıklamalar masaüstüne geçer.
  - `preload.js`: arayüz ile dosya sistemi arasındaki köprü.
  - `store.js`: dosyayı güvenle okuyup atomik yazan katman (bozuk JSON'da çökmez, yedek tutar). `npm test` ile denenir.
  - `index.html`: taş tasarımı (SVG), büyüme ve dönme animasyonu, mantık.
- **Şema**: `SCHEMA.md` ve `milestones.schema.json` (sürüm 1).
- **Skill v0** (`skills/milestone-stone`): Claude ile konuşurken aynı JSON dosyasını okuyup yazar. "M0 bitti" denince retroyu yürütür ve taşı mühürler; PROJE.md'den ya da konuşmadan plan çıkarabilir. `scripts/stone.js` dosyayı doğrulayıp atomik yazar.

## Tasarım kararları

- Taş özgün bir tasarım: ortası oyulmuş yuvarlak, üzerinde kırmızı kuşak ve düğüm, yuvarlağın içinde milestone numarası. Herhangi bir oyundaki taşın kopyası değil, ve öyle kalmalı.
- Tarih yok, milestone var. Hedef, milestone'ların "bitti" tanımlarını tamamlamak.
- Yuvarlağın etrafındaki halka ilerlemeyi gösteriyor. 5 gün ilerleme olmazsa nabız gibi atıyor (`staleDays` ayarı).
- Duraklatma birinci sınıf bir durum: kullanıcı ilerlemeyen bir işi suçluluk duymadan durdurabilmeli.

## Durum

**v0.1 (2026-11-21):** Widget çalışıyor; headless Chromium'da test edildi. Gerçek Windows'ta henüz denenmedi.

**v0.2 (2026-11-24):** Bozuk/yarım JSON'a dayanıklılık, atomik yazma, içeriğe dayalı dış değişiklik algılama; yazılı şema; Skill v0. Widget ile skill'in birlikte çalışması gerçek Windows'ta henüz denenmedi.

## Yol haritası (öncelik sırasıyla)

1. **Windows'ta gerçek test**: şeffaflık, tıklama geçişi, alwaysOnTop davranışı.
2. ~~**Skill v0**~~ (v0.2'de yapıldı). Sıradaki: **bulut projeleri için GitHub'dan çekme** — widget dosyayı bir depodan okusun (şema buna hazır, bkz. SCHEMA.md).
3. **Taşı sürükleyip konumlandırma**, konumu ayarlarda saklama.
4. **Windows açılışında otomatik başlatma.**
5. **Mühürleme anı**: daha güçlü bir parlama ve kısa bir ses (isteğe bağlı).
6. **Birden fazla proje**: proje başına bir taş ya da yan yana dizilmiş taşlar.
7. **Retro geçmişi**: mühürlenmiş taşların notlarını bir arada görmek.
8. **Paketleme**: electron-builder ile tek bir `.exe` dosyası, böylece başkaları Node kurmadan kullanabilir.

## Claude Projesi için talimat önerisi

> Bu proje Milestone Taşı: Windows için bir Electron masaüstü widget'ı ve ona bağlanacak bir Claude skill'i. Kod ve tasarım kararları PROJE.md dosyasında. Yanıtları Türkçe ver. Değişiklik önerirken çalışan tam dosyayı ver, yama parçaları değil. Taş tasarımı özgün kalmalı, hiçbir oyun ya da filmdeki bir nesneyi kopyalamamalı. Ana projem (Türkiye Halüsinasyon Haritası) öncelikli; bu projede bir oturumu küçük ve bitirilebilir tut.