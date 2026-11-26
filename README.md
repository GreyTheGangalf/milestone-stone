# Milestone Taşı (v0.5)

Masaüstünün sağ alt köşesinde duran küçük bir taş. Ortasındaki yuvarlakta aktif milestone'un numarası yazar.

## Kurulum (Windows)

1. Node.js yüklü değilse https://nodejs.org adresinden LTS sürümünü kur.
2. Bu klasörde bir terminal aç (klasörde boş bir yere Shift + sağ tık, "Terminalde aç"):

```
npm install
npm start
```


## Kullanım

- **Taşa tıkla:** taş büyür, arkası döner ve milestone planı görünür. Plan taş ne kadar küçük olursa olsun en az %100 boyutta açılır, yazılar okunur kalır.
- **Taşı basılı tutup sürükle:** taşı ekranda istediğin yere bırak. Yeri hatırlanır. Tepsi menüsündeki **Köşeye geri al** ile sağ alt köşeye döner. Taş bir kenara çok yakınsa plan açılırken ekrana sığsın diye bir anlığına içeri kayar, kapanınca yerine döner.
- **+ / −:** maddeyi tamamlandı ya da tamamlanmadı olarak işaretler. Yuvarlağın etrafındaki halka ilerledikçe dolar.
- **‹ ›:** diğer taşlara bakmanı sağlar.
- **Duraklat / Devam et:** taşı duraklatır. Duraklatılan taş grileşir.
- Bütün maddeler + olunca **geriye bakış** kutusu ve **Mühürle** düğmesi çıkar. Mühürleme anında taş yere oturur gibi sarsılır, yuvarlak parlar, halkadan ışık dalgaları ve kıvılcımlar çıkar, kısa bir ses çalar. Sonra sıradaki milestone açılır. Skill ya da GitHub taşı mühürlerse de aynısı olur.
- Planın altındaki satır ilerlemeni sayar: kaç gün üst üste ilerlediğin (en az bir maddeyi tamamladığın günler), toplam kaç iş tamamladığın ve kaç taş mühürlediğin. Bugün henüz ilerleme olmaması seriyi bozmaz; gün bitene kadar dünkü seri sayılır.
- Aktif taşta 5 gün boyunca ilerleme olmazsa halka yavaşça nabız gibi atmaya başlar.
- **↺:** taşı geri çevirir. **taşı gizle:** taşı ekrandan kaldırır, uygulama tepside çalışmaya devam eder. Uygulama bir sonraki açılışta taşı yine gösterir.

## Tepsi menüsü

Taş açıkken görev çubuğunda, saatin yanındaki gizli simgeler (^) arasında taş simgesi durur. Simgeye sol tıklayınca taş öne gelir. Sağ tıklayınca menü açılır:

- **Taşı göster / gizle**
- **Boyut:** Küçük (%75), Orta (%100), Büyük (%130). İnce ayar için farenin imleci taşın üstündeyken **Ctrl + fare tekerleği** (%50 ile %200 arası, %5 adımlarla).
- **Köşeye geri al:** sürüklenmiş taşı sağ alt köşeye döndürür.
- **Her zaman üstte tut:** kapalıyken (varsayılan) taş masaüstünde durur ve açtığın pencerelerin arkasında kalır. Görmek istediğinde simgeye tıkla.
- **Windows açılınca başlat**
- **Tamamlanınca bildirim gönder:** taş bir milestone'un bütün maddelerinin tamamlandığını dışarıdan öğrendiğinde (skill, GitHub ya da dosyayı elle düzenleme) motive edici bir Windows bildirimi gönderir. Bildirime tıklayınca taş açılır ve mühürlemeye hazır olur. Taşın üstünde kendin tiklediğinde bildirim gelmez, çünkü Mühürle düğmesi zaten çıkar.
- **Mühürlerken ses çal:** mühürleme sesini açar ya da kapatır.
- **Dene → Bildirim / Mühürleme anı:** ikisini de gerçek bir milestone'u bitirmeden görmek için.
- **GitHub'dan şimdi çek** (yalnızca GitHub modunda)
- **Taşı kapat:** uygulamadan çıkar.

Bu ayarlar ve taşın yeri `%USERPROFILE%\.milestone-stone\prefs.json` dosyasında saklanır. Seri için ilerleme yapılan günler `activity.json` dosyasında tutulur. `milestones.json` içindeki eski `settings.alwaysOnTop` ayarı artık kullanılmıyor.

`npm start` ile çalışırken **Windows açılınca başlat**, bu klasördeki Electron'u başlatır; klasörü taşırsan seçeneği kapatıp yeniden aç.

**Bildirim gelmiyorsa:** Windows ayarlarında bildirimlerin ve "Rahatsız etmeyin" modunun durumuna bak. `npm start` ile çalışırken bildirim yine de gelmezse `node_modules\electron\dist\electron.exe` dosyasına sağ tıklayıp "Başlat'a sabitle" de; Windows bazı sürümlerde bildirim için Başlat menüsünde bir kayıt istiyor.

## Veri

Durum şu dosyada tutulur: `%USERPROFILE%\.milestone-stone\milestones.json`

İlk açılışta bu klasördeki `milestones.json` dosyası oraya kopyalanır. Dosyayı elle düzenleyebilirsin; taş değişikliği birkaç saniye içinde görür. Dosyanın biçimi [SCHEMA.md](SCHEMA.md) dosyasında.

Dosya bozulursa ya da yarım kaydedilirse taş çökmez, son geçerli hali göstermeye devam eder. Açılışta bozuk bulunan dosya `milestones.json.corrupt-<zaman>` adıyla kenara alınır ve `milestones.json.bak` yedeğinden devam edilir.

Ayarlar (`settings`):
- `staleDays`: halkanın kaç gün ilerleme olmayınca nabız atmaya başlayacağı.

Pencereyle ilgili ayarlar (boyut, üstte tutma) tepsi menüsünde.

## GitHub modu (bulut projeleri için)

Claude bulut projelerinde senin diskine yazamaz. Bu durumda `milestones.json` bir GitHub deposunda durur, Claude onu commit'le günceller, taş da birkaç dakikada bir depodan çeker.

1. `config.example.json` dosyasını `%USERPROFILE%\.milestone-stone\config.json` olarak kopyala:

```
xcopy /E /I skills\milestone-stone %USERPROFILE%\.claude\skills\milestone-stone
```


Skill dosyayı `scripts/stone.js` ile doğrulayıp atomik yazar, bu yüzden Node yüklü olmalı.

## Test

```
npm test
```