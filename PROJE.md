# Milestone Taşı — Proje Özeti

Masaüstünün kenarında duran, projenin aktif milestone'unu gösteren küçük bir taş. Amaç, milestone'larla ilerlemeyi hem hatırlatıcı hem de eğlenceli hale getirmek. Her milestone tamamlandığında kısa bir geriye bakış yapılır, ardından taş mühürlenir.

İlk kullanım alanı: Türkiye Halüsinasyon Haritası projesinin M0–M7 milestone'ları. Uzun vadede başka kullanıcıların da kurabileceği bir "skill + widget" paketi olması hedefleniyor.

## Mimari

- **`milestones.json`**: tek doğruluk kaynağı. Konumu `%USERPROFILE%\.milestone-stone\milestones.json`. GitHub modunda doğruluk kaynağı depodaki dosya, yereldeki önbellek.
- **Widget (Electron)**: dosyayı okur, taşı çizer, + / − ve mühürleme işlemlerini dosyaya yazar. Dosya dışarıdan değişirse kendini yeniler.
  - `main.js`: şeffaf, çerçevesiz pencere; varsayılan yeri sağ alt köşe, sürüklenince yeri köşeye göre saklanır. Taşın dışında kalan alanda tıklamalar masaüstüne geçer.
  - `preload.js`: arayüz ile dosya sistemi arasındaki köprü.
  - `store.js`: dosyayı güvenle okuyup atomik yazan katman (bozuk JSON'da çökmez, yedek tutar). `npm test` ile denenir.
  - `remote.js`: isteğe bağlı GitHub modu. `config.json` varsa dosyayı depodan çekip yerel dosyanın üstüne yazar; yerel dosya önbellek olarak kalır.
  - `index.html`: taş tasarımı (SVG), büyüme ve dönme animasyonu, mantık.
  - `prefs.js`: bu bilgisayara özel pencere ayarları (`prefs.json`: boyut, konum, üstte tutma, bildirim, ses). `milestones.json`'dan ayrı, çünkü GitHub modunda o dosya depodan gelir.
  - `notify.js`: dışarıdan tamamlanan milestone'u bulur ve motive edici bildirim metnini seçer.
  - `stats.js`: seri (üst üste ilerleme günleri, `activity.json`), tamamlanan iş ve mühür sayısı.
  - `assets/`: uygulama simgesi (`icon.svg` kaynak; `icon.ico` tepsi ve ileride .exe için, `icon.png` bildirim için).
- **Şema**: `SCHEMA.md` ve `milestones.schema.json` (sürüm 1).
- **Skill v0** (`skills/milestone-stone`): Claude ile konuşurken aynı JSON dosyasını okuyup yazar. "M0 bitti" denince retroyu yürütür ve taşı mühürler; PROJE.md'den ya da konuşmadan plan çıkarabilir. `scripts/stone.js` dosyayı doğrulayıp atomik yazar.

## Tasarım kararları

- Taş özgün bir tasarım: ortası oyulmuş yuvarlak, üzerinde kırmızı kuşak ve düğüm, yuvarlağın içinde milestone numarası. Herhangi bir oyundaki taşın kopyası değil, ve öyle kalmalı.
- Tarih yok, milestone var. Hedef, milestone'ların "bitti" tanımlarını tamamlamak.
- Yuvarlağın etrafındaki halka ilerlemeyi gösteriyor. 5 gün ilerleme olmazsa nabız gibi atıyor (`staleDays` ayarı).
- Duraklatma birinci sınıf bir durum: kullanıcı ilerlemeyen bir işi suçluluk duymadan durdurabilmeli.
- Taş varsayılan olarak üstte durmaz; masaüstünde bekler, tepsiden öne çağrılır. Yer işgal etmemeli.
- Uygulama simgesi taşın kendisinin sadeleştirilmiş hali (aynı özgün tasarım), 16 px'te de okunacak şekilde.
- Bildirim yalnızca dışarıdan gelen tamamlanmada gider; kullanıcı taşın üstündeyken zaten görüyor.
- Seri suçluluk üretmemeli: kırılınca uyarı yok, yalnızca sessizce sıfırdan başlar. Bugün boşsa gün bitene kadar seri bozulmuş sayılmaz. Duraklatma ilkesiyle uyumlu.
- Mühürleme sesi dosya değil, Web Audio ile üretilen kısa bir tok ses ve iki çan tonu; özgün ve tepsiden kapatılabilir.
- Taş her açılışta görünür; gizleme yalnızca o oturum için.

## Durum

**v0.1 (2026-11-21):** Widget çalışıyor; headless Chromium'da test edildi. Gerçek Windows'ta henüz denenmedi.

**v0.2 (2026-11-24):** Bozuk/yarım JSON'a dayanıklılık, atomik yazma, içeriğe dayalı dış değişiklik algılama; yazılı şema; Skill v0. Widget ile skill'in birlikte çalışması gerçek Windows'ta henüz denenmedi.

**v0.3 (2026-11-24):** GitHub modu: `config.json` ile widget dosyayı bir GitHub deposundan birkaç dakikada bir çeker (`remote.js`, ETag ile hafif). Skill bulutta dosyayı commit'le günceller. Yerel mod aynen çalışıyor. Gerçek bir depoyla Windows'ta henüz denenmedi.

**v0.4 (2026-11-24):** Tepsi simgesi ve menüsü (göster/gizle, boyut ön ayarları ve Ctrl + tekerlek, her zaman üstte, Windows açılınca başlat, bildirim, kapat), taş simgesi, tamamlanma bildirimi, tek örnek kilidi, özel depo için token adımları. Windows'ta denendi (2026-11-26).

**v0.5 (2026-11-26):** Sürükle-bırak ve konum saklama, açılışta köşeye yeniden yerleşme, taş her açılışta görünür, küçük boyutta plan %100 açılır, seri ve sayaç, güçlü mühürleme anı ve ses. Windows'ta henüz denenmedi.

## Yol haritası (öncelik sırasıyla)

1. ~~**Windows'ta gerçek test**~~ (v0.4 ile yapıldı).
2. ~~**Skill v0**~~ (v0.2) ve ~~**GitHub'dan çekme**~~ (v0.3) yapıldı. İleride belki: taştaki tikleri de depoya yazmak (token'a yazma izni gerekir). Şimdilik taş depoya yazmaz, yerel tikler çekmede korunur.
3. ~~**Taşı sürükleyip konumlandırma**~~ (v0.5).
4. ~~**Windows açılışında otomatik başlatma**~~, tepsi, boyut ve bildirim (v0.4) yapıldı.
5. ~~**Mühürleme anı**~~, seri ve sayaç (v0.5) yapıldı.
6. **Birden fazla proje**: proje başına bir taş ya da yan yana dizilmiş taşlar.
7. **Retro geçmişi**: mühürlenmiş taşların notlarını bir arada görmek.
8. **Paketleme**: electron-builder ile tek bir `.exe` dosyası, böylece başkaları Node kurmadan kullanabilir.

## Claude Projesi için talimat önerisi

> Bu proje Milestone Taşı: Windows için bir Electron masaüstü widget'ı ve ona bağlanacak bir Claude skill'i. Kod ve tasarım kararları PROJE.md dosyasında. Yanıtları Türkçe ver. Değişiklik önerirken çalışan tam dosyayı ver, yama parçaları değil. Taş tasarımı özgün kalmalı, hiçbir oyun ya da filmdeki bir nesneyi kopyalamamalı. Ana projem (Türkiye Halüsinasyon Haritası) öncelikli; bu projede bir oturumu küçük ve bitirilebilir tut.