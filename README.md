# Milestone Taşı (v0.2)

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
- **↺:** taşı geri çevirir. **taşı kapat:** uygulamadan çıkar.

## Veri

Durum şu dosyada tutulur: `%USERPROFILE%\.milestone-stone\milestones.json`

İlk açılışta bu klasördeki `milestones.json` dosyası oraya kopyalanır. Dosyayı elle düzenleyebilirsin; taş değişikliği birkaç saniye içinde görür. Dosyanın biçimi [SCHEMA.md](SCHEMA.md) dosyasında.

Dosya bozulursa ya da yarım kaydedilirse taş çökmez, son geçerli hali göstermeye devam eder. Açılışta bozuk bulunan dosya `milestones.json.corrupt-<zaman>` adıyla kenara alınır ve `milestones.json.bak` yedeğinden devam edilir.

Ayarlar (`settings`):
- `alwaysOnTop`: `false` yaparsan taş pencerelerin arkasında kalır.
- `staleDays`: halkanın kaç gün ilerleme olmayınca nabız atmaya başlayacağı.

## GitHub modu (bulut projeleri için)

Claude bulut projelerinde senin diskine yazamaz. Bu durumda `milestones.json` bir GitHub deposunda durur, Claude onu commit'le günceller, taş da birkaç dakikada bir depodan çeker.

1. `config.example.json` dosyasını `%USERPROFILE%\.milestone-stone\config.json` olarak kopyala:

```
copy config.example.json %USERPROFILE%\.milestone-stone\config.json
```

2. İçindeki `repo` alanını kendi deponla (`sahip/ad`) değiştir. Dosya depoda başka bir yerdeyse `path`, başka daldaysa `branch` alanını düzelt. `intervalMinutes` kaç dakikada bir bakılacağı (en az 1, varsayılan 5).
3. Depo özelse `token` alanına bir fine-grained token yaz (yalnızca o depo, "Contents: Read-only" izni yeter). İstersen token'ı dosya yerine `MILESTONE_STONE_GITHUB_TOKEN` ortam değişkeniyle de verebilirsin.
4. Taşı yeniden başlat.

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