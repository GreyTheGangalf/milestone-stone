---
name: milestone-stone
description: Milestone Taşı widget'ının milestones.json dosyasını okur ve günceller. "M3 bitti", "M2'de şu madde tamam", "taşı duraklat", "milestone'lar nerede" gibi isteklerde ya da bir PROJE.md veya konuşmadan milestone planı çıkarılıp taşa yüklenmesi istendiğinde kullan.
---

# Milestone Taşı

Kullanıcının masaüstünde bir taş duruyor; aktif milestone'u gösteriyor. Taşın tek doğruluk kaynağı bir JSON dosyası. Bu skill o dosyayı okur ve kurallara uygun yazar. Widget dosyayı yaklaşık bir saniyede fark edip taşı kendiliğinden yeniler.

- Dosya: `%USERPROFILE%\.milestone-stone\milestones.json` (macOS/Linux: `~/.milestone-stone/milestones.json`). Emin olmak için: `node <skill klasörü>/scripts/stone.js path`
- Şema: aşağıdaki özet. Ayrıntısı depodaki `SEMA.md` ve `milestones.schema.json`.
- Kullanıcıyla Türkçe konuş.

## Her işlemde izlenecek yol

1. `node scripts/stone.js show` ile dosyayı oku ve durumu gör. Değişiklik yapacaksan `node scripts/stone.js cat` ile tam içeriği al. Bellekteki eski bir kopyaya güvenme; widget o arada yazmış olabilir.
2. Değişikliği bu güncel içerik üzerine uygula. **Bilmediğin alanları silme**, sırayı bozma.
3. Yeni içeriği geçici bir dosyaya yaz (ör. işletim sisteminin geçici klasörüne `milestones.new.json`) ve `node scripts/stone.js apply <o dosya>` çalıştır. Betik doğrular, `updatedAt`/`updatedBy: "skill"` ekler ve atomik yazar (geçici dosya + yeniden adlandırma). Doğrulama hata verirse düzelt, dosyayı başka yoldan yazma.
4. Kullanıcıya ne değiştiğini bir iki cümleyle söyle.

Node yoksa: aynı kuralları elle uygula, `milestones.json` dosyasını aynı klasörde geçici bir dosyaya yazıp yeniden adlandırarak değiştir. Claude.ai sohbetinde dosyaya erişimin yoksa güncel JSON'un tamamını ver ve kullanıcıya dosyanın yerini söyle.

## Şema özeti (sürüm 1)

```json
{
  "schemaVersion": 1,
  "project": "Proje adı",
  "updatedAt": "2026-11-24T11:41:43.000Z", "updatedBy": "skill",
  "settings": { "alwaysOnTop": true, "staleDays": 5 },
  "current": 0,
  "milestones": [
    {
      "id": "M0", "title": "Kurulum", "status": "active",
      "items": [ { "text": "Repo iskeleti hazır", "done": false } ],
      "startedAt": "2026-11-24T09:00:00.000Z", "lastProgress": null, "doneAt": null, "retro": ""
    }
  ]
}
```

- `status`: `pending` (sırası gelmedi), `active`, `paused` (duraklatıldı), `done` (mühürlendi).
- Aynı anda en fazla bir milestone `active` ya da `paused`. `current` onun dizideki sırası; hepsi mühürlendiyse `milestones.length`.
- `items[].touched` widget'ın görsel işareti; varsa koru, yoksa ekleme zorunluluğu yok.
- Tarihler ISO 8601, UTC.

## İşlemler

### Durumu sorma ("taş ne durumda", "sıradaki ne")
`show` çıktısını kısa anlat: aktif milestone, kaç madde bitti, kalan maddeler, son ilerlemenin üzerinden kaç gün geçtiği.

### Madde işaretleme ("M2'de soru tipleri tamam")
- Maddeyi metninden eşleştir. Belirsizse hangi madde olduğunu sor.
- `done: true` (ya da geri almak için `false`), `touched: true`, milestone'un `lastProgress` alanını şimdiye ayarla.
- Milestone `paused` ise `active` yap.
- Bu işlem sonucunda bütün maddeler bittiyse, mühürlemeyi teklif et (aşağıda), kendiliğinden mühürleme.

### Milestone bitirme ve mühürleme ("M3 bitti")
1. Belirtilen milestone `active` ya da `paused` değilse kullanıcıya durumunu söyle ve ne yapmak istediğini sor.
2. Tamamlanmamış maddeler varsa bunları listele ve sor: hepsi bitti mi sayılsın, yoksa bazıları gerçekten eksik mi? Onay gelmeden işaretleme.
3. **Kısa geriye bakış** yürüt; tek seferde en fazla iki soru sor:
   - Ne iyi gitti?
   - Ne zorladı ya da bir dahakine neyi farklı yaparsın?
   Kullanıcının cevaplarından tek cümlelik bir `retro` yaz ve ona göster. Kullanıcı retroyu atlamak isterse `retro` boş kalabilir.
4. Mühürle: bütün maddeler `done: true`, `status: "done"`, `doneAt` şimdi, `retro` yazıldı, `lastProgress` şimdi.
5. Sıradaki: dizide ilk `pending` olanı `active` yap, `startedAt` şimdi, `current` onun sırası. Kalmadıysa `current = milestones.length` ve kullanıcıyı tebrik et.
6. Yazdıktan sonra sıradaki milestone'un "bitti" tanımını (maddelerini) hatırlat.

### Duraklatma / devam ettirme
`status` alanını `paused` ↔ `active` arasında değiştir. Duraklatma birinci sınıf bir durum: kullanıcıyı suçlu hissettirecek bir şey söyleme.

### Plan çıkarma (PROJE.md'den ya da konuşmadan)
1. Kaynağı oku; zaman çizelgesini değil, sıralı ara hedefleri ara. Her milestone için 2–5 tane **doğrulanabilir** "bitti" maddesi yaz ("X çalışıyor", "Y elle kontrol edildi" gibi). Tarih koyma.
2. Kimlikler `M0`'dan başlayıp sırayla artar. İlki `active` (`startedAt` şimdi), diğerleri `pending`; `current: 0`.
3. Planı önce kullanıcıya düz liste olarak göster ve onay al.
4. Mevcut dosyada ilerleme varsa (`done` maddeler, mühürlü taşlar) üzerine yazmadan önce bunu açıkça söyle ve onay al. Eski dosyayı korumak için önce aynı klasöre `milestones.<tarih>.json` adıyla kopyala.
5. `settings` ve bilinmeyen kök alanları eski dosyadan koru.

### Plan düzenleme (madde ekleme, milestone ekleme/çıkarma, yeniden adlandırma)
Mühürlü (`done`) milestone'lara dokunma; değiştirmek istenirse önce sor. Milestone silinirse `current`'ı yeniden hesapla.

## Yapma
- Taşın görünümüyle (index.html) ilgili hiçbir şeyi bu skill'den değiştirme.
- Kullanıcı onaylamadan milestone mühürleme ya da plan değiştirme.
- Dosyayı doğrudan `milestones.json` üzerine parça parça yazma; her zaman tam içerik + atomik yazma.
