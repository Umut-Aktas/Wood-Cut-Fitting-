import { Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import type { Polygon } from './geometry';
import { WORLD_HEIGHT, WORLD_WIDTH } from './level';

const TILE = 512;
const TAU = Math.PI * 2;

/** Seamlessly tiling wood grain, drawn pixel by pixel so the game needs no image files. */
export function makeWoodTexture(base: readonly [number, number, number], seed: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(TILE, TILE);
  let rand = seed * 9301 + 49297;
  const noise = () => {
    rand = (rand * 9301 + 49297) % 233280;
    return rand / 233280;
  };
  // Every frequency is a whole number of periods across the tile, so it repeats without seams.
  const k = TAU / TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const warp =
        6 * Math.sin(x * k + seed) + 2.5 * Math.sin(x * k * 3 + y * k * 2 + seed * 2) + 1 * Math.sin(x * k * 7 + seed);
      const ring = 0.5 + 0.5 * Math.sin((y + warp) * k * 22);
      const fine = 0.5 + 0.5 * Math.sin((y + warp * 0.5) * k * 71 + x * k * 2);
      const shade = 1 - 0.22 * ring ** 6 - 0.05 * fine - 0.04 * noise();
      const i = (y * TILE + x) * 4;
      img.data[i] = base[0] * shade;
      img.data[i + 1] = base[1] * shade;
      img.data[i + 2] = base[2] * shade;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(canvas);
}

function tracePolygon(g: Graphics, poly: Polygon) {
  poly.forEach((ring, i) => {
    g.poly(ring.flat());
    if (i === 0) g.fill(0xffffff);
    else g.cut();
  });
}

/** A board on screen: wood grain clipped to a polygon, with an outline and a drop shadow. */
export class BoardView extends Container {
  private readonly shadow = new Graphics();
  private readonly wood: TilingSprite;
  private readonly shape = new Graphics();
  readonly outline = new Graphics();

  /**
   * `grainAngle` turns the grain to run along the board. Pass `outlineParent`
   * to draw the outline on a higher layer, so edges stay visible where boards overlap.
   */
  constructor(
    texture: Texture,
    poly: Polygon,
    private readonly edgeColor: number,
    grainAngle = 0,
    outlineParent?: Container,
  ) {
    super();
    const size = 2 * Math.hypot(WORLD_WIDTH, WORLD_HEIGHT);
    this.wood = new TilingSprite({ texture, width: size, height: size });
    this.wood.anchor.set(0.5);
    this.wood.position.set(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.wood.rotation = grainAngle;
    this.wood.mask = this.shape;
    this.addChild(this.shadow, this.wood, this.shape);
    (outlineParent ?? this).addChild(this.outline);
    this.setPolygon(poly);
  }

  /** Moves the board and its outline together. */
  setOffset(x: number, y: number) {
    this.position.set(x, y);
    if (this.outline.parent !== this) this.outline.position.set(x, y);
  }

  setPolygon(poly: Polygon) {
    this.shadow.clear();
    poly.forEach((ring, i) => {
      this.shadow.poly(ring.map(([x, y]) => [x + 5, y + 8]).flat());
      if (i === 0) this.shadow.fill({ color: 0x000000, alpha: 0.35 });
      else this.shadow.cut();
    });
    this.shape.clear();
    tracePolygon(this.shape, poly);
    this.outline.clear();
    for (const ring of poly) this.outline.poly(ring.flat()).stroke({ width: 2, color: this.edgeColor, alpha: 0.9 });
  }

  override destroy() {
    this.outline.destroy();
    super.destroy({ children: true });
  }
}
