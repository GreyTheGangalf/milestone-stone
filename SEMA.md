# milestones.json şeması (sürüm 1)

`milestones.json` widget ile skill'in ortak, tek doğruluk kaynağı. Makine tarafından okunabilir hali: [`milestones.schema.json`](milestones.schema.json). Depodaki `milestones.json` bu şemaya uyan bir örnek ve ilk açılış şablonudur.

Çalışırken dosya burada durur: `%USERPROFILE%\.milestone-stone\milestones.json` (macOS/Linux'ta `~/.milestone-stone/milestones.json`).

## Kök alanlar

| Alan | Tür | Zorunlu | Açıklama |
|---|---|---|---|
| `schemaVersion` | `1` | hayır (yoksa 1) | Şema sürümü. Uyumsuz bir değişiklikte artar. |
| `project` | metin | hayır | Projenin adı. |
| `updatedAt` | ISO tarih ya da `null` | hayır | Dosyanın en son yazıldığı an (UTC). |
| `updatedBy` | `"widget"`, `"skill"`, `"manual"` ya da `null` | hayır | Son yazan taraf. |
| `settings.alwaysOnTop` | mantıksal | hayır (varsayılan `true`) | `false` ise taş pencerelerin arkasında kalır. |
| `settings.staleDays` | tam sayı | hayır (varsayılan 5) | Kaç gün ilerleme olmazsa halka nabız gibi atar. |
| `current` | tam sayı | hayır (varsayılan 0) | Ön yüzdeki milestone'un dizideki sırası. `milestones.length` ise hepsi mühürlenmiştir. |
| `milestones` | dizi | **evet** | En az bir milestone. |

## Milestone

| Alan | Tür | Zorunlu | Açıklama |
|---|---|---|---|
| `id` | `"M0"`, `"M1"`, ... | **evet** | Taşın ortasında numarası yazar. |
| `title` | metin | **evet** | |
| `status` | `pending` / `active` / `paused` / `done` | **evet** | Sırası gelmedi / aktif / duraklatıldı / mühürlendi. |
| `items` | dizi | **evet** | "Bitti" tanımı. Her madde `{ "text": metin, "done": mantıksal }`. |
| `items[].touched` | mantıksal | hayır | Widget, maddeye + ya da − basılınca ekler. Yalnızca görsel. |
| `startedAt` | ISO tarih ya da `null` | hayır | Milestone aktif olduğunda doldurulur (widget eksikse kendisi ekler). |
| `lastProgress` | ISO tarih ya da `null` | hayır | Son madde değişikliği. |
| `doneAt` | ISO tarih ya da `null` | hayır | Mühürlendiği an. |
| `retro` | metin | hayır | Geriye bakış notu. |

## Kurallar

- **Aynı anda en fazla bir** milestone `active` ya da `paused` olur. `current` onu gösterir.
- Mühürlenen milestone: `status: "done"`, `doneAt` dolu, `retro` yazılmış. Ardından dizide ilk `pending` olan `active` olur, `startedAt` alır ve `current` onu gösterir. Kalmadıysa `current = milestones.length`.
- Tarihler ISO 8601, UTC (`2026-11-24T11:41:43.000Z`).
- Bilinmeyen alanlar silinmez; yazan taraf okuduğu her alanı korur. Bu, ileride eklenecek alanların (ör. GitHub eşitlemesi) eski sürümlerle bozulmamasını sağlar.
- Dosya UTF-8 kaydedilir. Widget başta BOM varsa onu yok sayar.

## Yazma kuralları (widget ve skill için)

1. **Önce oku, sonra yaz.** Dosyayı yazmadan hemen önce yeniden oku, değişikliği onun üzerine uygula.
2. **Atomik yaz.** Aynı klasöre geçici bir dosya yaz (`milestones.json.<pid>.tmp`), sonra adını `milestones.json` yap. Okuyan taraf hiçbir zaman yarım dosya görmez.
3. `updatedAt` ve `updatedBy` alanlarını güncelle.

## Widget'ın dayanıklılığı

- Dosya bozuk ya da yarımsa widget çökmez, son geçerli durumu göstermeye devam eder ve dosya düzelince onu yükler.
- Açılışta dosya bozuksa bozuk hali `milestones.json.bozuk-<zaman>` adıyla kenara alınır, `milestones.json.bak` yedeğinden (o da yoksa depodaki şablondan) devam edilir.
- Widget kendi yazdığı içeriği dış değişiklik saymaz; bunu zamanlamaya değil içeriğe bakarak anlar.
- Skill dosyayı değiştirmiş ama widget bunu henüz yüklememişse, widget eski durumla üzerine yazmaz: önce taşı yeniler. O anki tıklama kaybolabilir, skill'in değişikliği kaybolmaz.

## İleride: GitHub'dan çekme

Bulut projeleri için widget dosyayı bir GitHub deposundan okuyabilecek. Şema buna hazır: dosya hangi yolda durursa dursun aynı içerik geçerli, `updatedAt`/`updatedBy` hangi kopyanın daha yeni olduğunu anlamaya yarar, bilinmeyen alanlar korunduğu için eşitleme bilgisi eklenebilir. Bu sürümde uygulanmadı.
