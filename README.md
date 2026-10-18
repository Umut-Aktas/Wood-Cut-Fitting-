# Wood Cut Fitting

Uymayan tahtaları kesip tam oturtma üzerine bir mobil bulmaca oyunu.

Üstteki tahta sabittir. Alttaki tahtayı parmağınla düz çizgilerle kesersin,
**Birleştir**'e basınca tahta yukarı kayar ve üsttekine dayanır. Kenarlar ne
kadar iyi oturursa o kadar çok yıldız alırsın.

## Çalıştırma

```sh
npm install
npm run dev      # http://localhost:5173 (aynı ağdaki telefondan da açılır)
npm test         # kesme ve puanlama testleri
npm run build    # dist/ klasörüne üretim çıktısı
```

## Kod yapısı

| Dosya | Ne yapar |
| --- | --- |
| `src/geometry.ts` | Çokgen kesme (testere payıyla), alan, nokta-içinde testleri |
| `src/fit.ts` | Tahtayı kaydırıp temas noktasını bulur, boşluğu ölçer, yıldız verir |
| `src/level.ts` | Bölüm tanımı; sabit tahtanın kenarı çözüm kesimlerinden üretilir |
| `src/wood.ts` | Kodla üretilen ahşap dokusu ve tahta çizimi |
| `src/game.ts` | Dokunma ile kesim, düşen parçalar, kayma animasyonu, sonuç ekranı |

Teknoloji: TypeScript, Vite, PixiJS 8. Mobil paketleme için ileride Capacitor eklenecek.
