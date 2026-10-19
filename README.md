# Wood Cut Fitting

Uymayan tahtaları kesip tam oturtma üzerine bir mobil bulmaca oyunu.

Bir dolabın köşesinde iki düz tahta üst üste duruyor. Çizdiğin çizgi üzerinden
geçtiği tahtaları boydan boya keser. **Birleştir**'e basınca tahtalar kendi
duvarları boyunca köşeye doğru kayar ve birbirine dayanır. Köşe ne kadar tam
oturursa o kadar çok yıldız alırsın. Püf noktası: iki tahtanın kenarlarının
kesiştiği iki noktadan geçen tek kesim kusursuz gönye verir, köşe açısı ya da
tahta genişlikleri ne olursa olsun.

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
| `src/geometry.ts` | Çokgen kesme (testere payıyla, çizgi boyunca), yardımcı geometri |
| `src/fit.ts` | Tahtaları duvarları boyunca kaydırıp temas ettirir, köşeyi kusursuz gönyeyle karşılaştırıp yıldız verir |
| `src/level.ts` | Bölümler: köşe açısı, dönüş ve tahta genişliklerinden sahneyi kurar |
| `src/wood.ts` | Kodla üretilen ahşap dokusu ve tahta çizimi |
| `src/game.ts` | Fareyle/parmakla kesim, düşen parçalar, kayma animasyonu, sonuç ekranı |

Teknoloji: TypeScript, Vite, PixiJS 8. Mobil paketleme için ileride Capacitor eklenecek.
