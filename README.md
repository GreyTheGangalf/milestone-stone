# Milestone Taşı (v0.1)

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

İlk açılışta bu klasördeki `milestones.json` dosyası oraya kopyalanır. Dosyayı elle düzenleyebilirsin; taş değişikliği birkaç saniye içinde görür. İleride skill de aynı dosyayı okuyup yazacak.

Ayarlar (`settings`):
- `alwaysOnTop`: `false` yaparsan taş pencerelerin arkasında kalır.
- `staleDays`: halkanın kaç gün ilerleme olmayınca nabız atmaya başlayacağı.
