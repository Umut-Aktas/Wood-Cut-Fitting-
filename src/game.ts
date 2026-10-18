import { Application, Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import { cutPolygon, polygonCentroid, type Pair, type Polygon } from './geometry';
import { measureFit, type FitResult } from './fit';
import { WORLD_HEIGHT, WORLD_WIDTH, type Level } from './level';
import { BoardView, makeWoodTexture } from './wood';

export interface GameUi {
  title: HTMLElement;
  cuts: HTMLElement;
  toast: HTMLElement;
  undo: HTMLButtonElement;
  hint: HTMLButtonElement;
  join: HTMLButtonElement;
  result: HTMLElement;
  stars: HTMLElement;
  fitText: HTMLElement;
  retry: HTMLButtonElement;
}

type Phase = 'cutting' | 'sliding' | 'result';

interface FallingPiece {
  view: BoardView;
  vx: number;
  vy: number;
  spin: number;
  age: number;
}

const MIN_CUT_LENGTH = 24;
const SLIDE_SECONDS = 0.55;
const GRAVITY = 2600;

export class Game {
  private readonly world = new Container();
  private readonly fixedView: BoardView;
  private readonly movingView: BoardView;
  private readonly piecesLayer = new Container();
  private readonly gapLayer = new Graphics();
  private readonly hintLayer = new Graphics();
  private readonly cutPreview = new Graphics();

  private phase: Phase = 'cutting';
  private moving: Polygon;
  private history: Polygon[] = [];
  private falling: FallingPiece[] = [];
  private dragStart: Pair | null = null;
  private slideTime = 0;
  private fit: FitResult | null = null;
  private toastTimer = 0;
  private readonly movingTexture;

  constructor(
    private readonly app: Application,
    private readonly level: Level,
    private readonly ui: GameUi,
  ) {
    this.moving = level.moving;
    this.movingTexture = makeWoodTexture([222, 176, 112], 3);
    this.fixedView = new BoardView(makeWoodTexture([150, 96, 56], 7), level.fixed, 0x3b220f);
    this.movingView = new BoardView(this.movingTexture, this.moving, 0x6b4520);

    const bench = new Graphics().rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(0x3a2a1e);
    this.hintLayer.visible = false;
    this.world.addChild(
      bench,
      this.fixedView,
      this.movingView,
      this.hintLayer,
      this.gapLayer,
      this.piecesLayer,
      this.cutPreview,
    );
    app.stage.addChild(this.world);
    this.drawHint();

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', this.onDown);
    app.stage.on('globalpointermove', this.onMove);
    app.stage.on('pointerup', this.onUp);
    app.stage.on('pointerupoutside', this.onUp);

    ui.title.textContent = level.name;
    ui.undo.onclick = () => this.undo();
    ui.hint.onclick = () => this.toggleHint();
    ui.join.onclick = () => this.join();
    ui.retry.onclick = () => this.reset();

    app.ticker.add((t) => this.update(t.deltaMS / 1000));
    window.addEventListener('resize', () => this.layout());
    this.layout();
    this.refreshHud();
  }

  private layout() {
    const { width, height } = this.app.screen;
    const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
    this.world.scale.set(scale);
    this.world.position.set((width - WORLD_WIDTH * scale) / 2, (height - WORLD_HEIGHT * scale) / 2);
  }

  private toWorld(e: FederatedPointerEvent): Pair {
    const p = this.world.toLocal(e.global);
    return [p.x, p.y];
  }

  private readonly onDown = (e: FederatedPointerEvent) => {
    if (this.phase !== 'cutting') return;
    this.dragStart = this.toWorld(e);
  };

  private readonly onMove = (e: FederatedPointerEvent) => {
    if (!this.dragStart) return;
    const end = this.toWorld(e);
    const valid = this.canCut() && this.tryCut(this.dragStart, end) !== null;
    const color = valid ? 0x9dff8a : 0xffd27a;
    this.cutPreview
      .clear()
      .moveTo(...this.dragStart)
      .lineTo(...end)
      .stroke({ width: 4, color, alpha: 0.95 })
      .circle(...this.dragStart, 7)
      .circle(...end, 7)
      .fill({ color, alpha: 0.95 });
  };

  private readonly onUp = (e: FederatedPointerEvent) => {
    if (!this.dragStart) return;
    const start = this.dragStart;
    const end = this.toWorld(e);
    this.dragStart = null;
    this.cutPreview.clear();
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) < MIN_CUT_LENGTH) return;
    if (!this.canCut()) {
      this.showToast('Kesim hakkın bitti. Geri alabilir ya da birleştirebilirsin.');
      return;
    }
    const result = this.tryCut(start, end);
    if (!result) {
      this.showToast('Kesim tahtayı baştan sona geçip bir parça ayırmalı.');
      return;
    }
    this.history.push(this.moving);
    this.moving = result.kept;
    this.movingView.setPolygon(this.moving);
    for (const piece of result.removed) this.dropPiece(piece, end[0] > start[0] ? 1 : -1);
    this.refreshHud();
  };

  private canCut() {
    return this.history.length < this.level.maxCuts;
  }

  private tryCut(a: Pair, b: Pair) {
    return cutPolygon(this.moving, a, b, this.level.anchor);
  }

  private dropPiece(poly: Polygon, direction: number) {
    const view = new BoardView(this.movingTexture, poly, 0x6b4520);
    const [cx, cy] = polygonCentroid(poly);
    view.pivot.set(cx, cy);
    view.position.set(cx, cy);
    this.piecesLayer.addChild(view);
    this.falling.push({
      view,
      vx: direction * (60 + Math.random() * 80),
      vy: -260 - Math.random() * 120,
      spin: direction * (1.5 + Math.random() * 2),
      age: 0,
    });
  }

  private undo() {
    if (this.phase !== 'cutting') return;
    const previous = this.history.pop();
    if (!previous) return;
    this.moving = previous;
    this.movingView.setPolygon(this.moving);
    this.refreshHud();
  }

  private toggleHint() {
    if (this.phase !== 'cutting') return;
    this.hintLayer.visible = !this.hintLayer.visible;
    this.ui.hint.classList.toggle('active', this.hintLayer.visible);
  }

  /** Dashed outline on the moving board showing where its edge must end up. */
  private drawHint() {
    const ring = this.level.fixed[0];
    const edge = ring.slice(2, -1).map(([x, y]) => [x, y + this.level.perfectShift] as Pair);
    const dash = 9;
    const g = this.hintLayer;
    for (let i = 1; i < edge.length; i++) {
      const [x1, y1] = edge[i - 1];
      const [x2, y2] = edge[i];
      const len = Math.hypot(x2 - x1, y2 - y1);
      for (let t = 0; t < len; t += dash * 2) {
        const t2 = Math.min(len, t + dash);
        g.moveTo(x1 + ((x2 - x1) * t) / len, y1 + ((y2 - y1) * t) / len);
        g.lineTo(x1 + ((x2 - x1) * t2) / len, y1 + ((y2 - y1) * t2) / len);
      }
    }
    g.stroke({ width: 3, color: 0xffffff, alpha: 0.75 });
  }

  private join() {
    if (this.phase !== 'cutting') return;
    this.phase = 'sliding';
    this.hintLayer.visible = false;
    this.ui.hint.classList.remove('active');
    this.fit = measureFit(this.level.fixed, this.moving, this.level.x0, this.level.x1, this.level.thresholds);
    this.slideTime = 0;
    this.refreshHud();
  }

  private finishSlide() {
    const fit = this.fit!;
    this.movingView.y = -fit.shift;
    this.gapLayer.clear();
    const dx = (this.level.x1 - this.level.x0) / fit.columns.length;
    for (const c of fit.columns) {
      if (c.gap <= 1) continue;
      const h = c.bottom === null ? 6 : c.gap;
      this.gapLayer.rect(c.x - dx / 2, c.top, dx + 0.5, h);
    }
    this.gapLayer.fill({ color: 0xff3b30, alpha: 0.7 });
    this.phase = 'result';
    setTimeout(() => this.showResult(fit), 450);
  }

  private showResult(fit: FitResult) {
    if (this.phase !== 'result') return;
    this.ui.stars.innerHTML = [0, 1, 2]
      .map((i) => `<span class="star${i < fit.stars ? ' on' : ''}" style="animation-delay:${i * 0.15}s">★</span>`)
      .join('');
    const verdict = ['Olmadı, tekrar dene!', 'Fena değil.', 'Güzel oturdu!', 'Tam oturdu!'][fit.stars];
    this.ui.fitText.textContent = `${verdict} Uyum: %${Math.round(fit.fitPercent)}`;
    this.ui.result.hidden = false;
  }

  private reset() {
    this.phase = 'cutting';
    this.moving = this.level.moving;
    this.history = [];
    this.fit = null;
    this.movingView.y = 0;
    this.movingView.setPolygon(this.moving);
    this.gapLayer.clear();
    this.ui.result.hidden = true;
    this.refreshHud();
  }

  private refreshHud() {
    const used = this.history.length;
    this.ui.cuts.textContent = `Kesim ${used}/${this.level.maxCuts}`;
    const cutting = this.phase === 'cutting';
    this.ui.undo.disabled = !cutting || used === 0;
    this.ui.hint.disabled = !cutting;
    this.ui.join.disabled = !cutting;
  }

  private showToast(text: string) {
    this.ui.toast.textContent = text;
    this.ui.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.ui.toast.classList.remove('show'), 2200);
  }

  private update(dt: number) {
    for (const p of this.falling) {
      p.age += dt;
      p.vy += GRAVITY * dt;
      p.view.x += p.vx * dt;
      p.view.y += p.vy * dt;
      p.view.rotation += p.spin * dt;
      p.view.alpha = Math.max(0, 1 - p.age / 1.4);
    }
    this.falling = this.falling.filter((p) => {
      if (p.age < 1.4) return true;
      p.view.destroy({ children: true });
      return false;
    });

    if (this.phase === 'sliding' && this.fit) {
      this.slideTime += dt;
      const t = Math.min(1, this.slideTime / SLIDE_SECONDS);
      // Ease in, so the board picks up speed and lands with a knock.
      this.movingView.y = -this.fit.shift * t * t;
      if (t >= 1) this.finishSlide();
    }
  }
}
