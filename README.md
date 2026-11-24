# Milestone Taşı (v0.4)

Masaüstünün sağ alt köşesinde duran küçük bir taş. Ortasındaki yuvarlakta aktif milestone'un numarası yazar.

## Kurulum (Windows)

1. Node.js yüklü değilse https://nodejs.org adresinden LTS sürümünü kur.
2. Bu klasörde bir terminal aç (klasörde boş bir yere Shift + sağ tık, "Terminalde aç"):

```
npm install
npm start
```

## Kullanım

- **Taşa tıkla:** taş büyür, arkası döner ve milestone planı görünür.
- **+ / −:** maddeyi tamamlandı ya da tamamlanmadı olarak işaretler. Yuvarlağın etrafındaki halka ilerledikçe dolar.
- **‹ ›:** diğer taşlara bakmanı sağlar.
- **Duraklat / Devam et:** taşı duraklatır. Duraklatılan taş grileşir.
- Bütün maddeler + olunca **geriye bakış** kutusu ve **Mühürle** düğmesi çıkar. Mühürlenen taş parlar ve sıradaki milestone açılır.
- Aktif taşta 5 gün boyunca ilerleme olmazsa halka yavaşça nabız gibi atmaya başlar.
- **↺:** taşı geri çevirir. **taşı gizle:** taşı ekrandan kaldırır, uygulama tepside çalışmaya devam eder.

## Tepsi menüsü

Taş açıkken görev çubuğunda, saatin yanındaki gizli simgeler (^) arasında taş simgesi durur. Simgeye sol tıklayınca taş öne gelir. Sağ tıklayınca menü açılır:

- **Taşı göster / gizle**
- **Boyut:** Küçük (%75), Orta (%100), Büyük (%130). İnce ayar için farenin imleci taşın üstündeyken **Ctrl + fare tekerleği** (%50 ile %200 arası, %5 adımlarla).
- **Her zaman üstte tut:** kapalıyken (varsayılan) taş masaüstünde durur ve açtığın pencerelerin arkasında kalır. Görmek istediğinde simgeye tıkla.
- **Windows açılınca başlat**
- **Tamamlanınca bildirim gönder:** taş bir milestone'un bütün maddelerinin tamamlandığını dışarıdan öğrendiğinde (skill, GitHub ya da dosyayı elle düzenleme) motive edici bir Windows bildirimi gönderir. Bildirime tıklayınca taş açılır ve mühürlemeye hazır olur. Taşın üstünde kendin tiklediğinde bildirim gelmez, çünkü Mühürle düğmesi zaten çıkar.
- **Bildirimi dene:** bildirimlerin çalıştığını görmek için örnek bir bildirim gösterir.
- **GitHub'dan şimdi çek** (yalnızca GitHub modunda)
- **Taşı kapat:** uygulamadan çıkar.

Bu ayarlar `%USERPROFILE%\.milestone-stone\prefs.json` dosyasında saklanır. `milestones.json` içindeki eski `settings.alwaysOnTop` ayarı artık kullanılmıyor.

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
copy config.example.json %USERPROFILE%\.milestone-stone\config.json
```

2. İçindeki `repo` alanını kendi deponla (`sahip/ad`) değiştir. Dosya depoda başka bir yerdeyse `path`, başka daldaysa `branch` alanını düzelt. `intervalMinutes` kaç dakikada bir bakılacağı (en az 1, varsayılan 5).
3. Depo özelse (private) bir token gerekir, aşağıya bak.
4. Taşı yeniden başlat.

### Özel (private) depo

Taş özel depodaki dosyayı okumak için yalnızca okuma izni olan bir token kullanır:

1. GitHub'da **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** "Only select repositories" seç ve yalnızca veri deposunu işaretle.
3. **Permissions → Repository permissions → Contents:** "Read-only". Başka izin verme.
4. Bir son kullanma tarihi seç ve token'ı oluştur.
5. Token'ı `config.json` içindeki `token` alanına yapıştır. İstersen dosyaya yazmak yerine ortam değişkeni olarak ver (cmd'de bir kez, sonra taşı yeniden başlat):

```
setx MILESTONE_STONE_GITHUB_TOKEN "github_pat_..."
```

Token yanlışsa ya da süresi dolduysa taş son geçerli hali göstermeye devam eder ve nedenini terminale yazar (401: token yanlış ya da süresi dolmuş; 404: depo, yol ya da dal yanlış veya token o depoyu göremiyor). Token yalnızca senin bilgisayarında durur; `config.json` dosyasını bir depoya koyma.

Ağ yoksa ya da GitHub hata verirse taş son geçerli hali göstermeye devam eder. Depodaki dosya şemaya uymuyorsa uygulanmaz. Taş GitHub'a hiçbir şey yazmaz. Taşa attığın + tikleri hiçbir zaman silinmez: depodan yeni bir plan gelse de, taşı yeniden başlatsan da tikli maddeler tikli kalır (milestone id'si ve madde metniyle eşleşir). Depoda tiklenen maddeler de taşa gelir. Yerelde bir tiki geri alırsan ama depoda tikliyse, depodaki tik geri gelir.

`config.json` dosyasını silersen ya da `"source"` değerini `"local"` yaparsan taş yerel dosya moduna döner.

## Claude skill'i

`skills/milestone-stone` klasörü bir Claude skill'i. Claude ile konuşurken "M0 bitti", "M1'de Wikidata sorgusu tamam" ya da "PROJE.md'den milestone planı çıkar" dediğinde aynı dosyayı günceller; taş kendini yeniler.

Claude Code'da kurmak için klasörü kopyala:

```
xcopy /E /I skills\milestone-stone %USERPROFILE%\.claude\skills\milestone-stone
```

Skill dosyayı `scripts/stone.js` ile doğrulayıp atomik yazar, bu yüzden Node yüklü olmalı.

## Test

```
npm test
```