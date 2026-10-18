import { Application, Container, FederatedPointerEvent, Graphics, type Texture } from 'pixi.js';
import { lineCut, polygonCentroid, segmentTouches, type Pair, type Polygon } from './geometry';
import { measureJoint, slideOffset, type JointResult } from './fit';
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
  next: HTMLButtonElement;
}

type Phase = 'cutting' | 'sliding' | 'result';
type Pieces = [Polygon, Polygon];

interface FallingPiece {
  view: BoardView;
  vx: number;
  vy: number;
  spin: number;
  age: number;
}

const MIN_CUT_LENGTH = 16;
const SLIDE_SECONDS = 0.5;
const GRAVITY = 2600;
const FALL_SECONDS = 1.4;
const EDGE_COLOR = 0x5a3a1a;
/** How much of the world is in view around the joint. */
const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 620;

export class Game {
  private readonly world = new Container();
  private readonly cabinet = new Graphics();
  private readonly boardLayer = new Container();
  private readonly outlineLayer = new Container();
  private readonly errorLayer = new Graphics();
  private readonly piecesLayer = new Container();
  private readonly hintLayer = new Graphics();
  private readonly cutPreview = new Graphics();
  private readonly textures: [Texture, Texture];

  private level!: Level;
  private levelIndex = 0;
  private views: BoardView[] = [];
  private phase: Phase = 'cutting';
  private pieces!: Pieces;
  private history: Pieces[] = [];
  private falling: FallingPiece[] = [];
  private dragStart: Pair | null = null;
  private slideTime = 0;
  private joint: JointResult | null = null;
  private toastTimer = 0;
  private resultTimer = 0;

  constructor(
    private readonly app: Application,
    private readonly levels: readonly Level[],
    private readonly ui: GameUi,
  ) {
    this.textures = [makeWoodTexture([226, 190, 140], 3), makeWoodTexture([214, 172, 118], 11)];

    const table = new Graphics().rect(-2000, -2000, WORLD_WIDTH + 4000, WORLD_HEIGHT + 4000).fill(0x2c333b);
    this.world.addChild(
      table,
      this.cabinet,
      this.boardLayer,
      this.outlineLayer,
      this.errorLayer,
      this.piecesLayer,
      this.hintLayer,
      this.cutPreview,
    );
    app.stage.addChild(this.world);

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', this.onDown);
    app.stage.on('globalpointermove', this.onMove);
    app.stage.on('pointerup', this.onUp);
    app.stage.on('pointerupoutside', this.onUp);

    ui.undo.onclick = () => this.undo();
    ui.hint.onclick = () => this.toggleHint();
    ui.join.onclick = () => this.join();
    ui.retry.onclick = () => this.loadLevel(this.levelIndex);
    ui.next.onclick = () => this.loadLevel((this.levelIndex + 1) % this.levels.length);

    app.ticker.add((t) => this.update(t.deltaMS / 1000));
    window.addEventListener('resize', () => this.layout());
    this.loadLevel(0);
  }

  private loadLevel(index: number) {
    this.levelIndex = index;
    this.level = this.levels[index];
    this.phase = 'cutting';
    this.history = [];
    this.joint = null;
    clearTimeout(this.resultTimer);
    this.pieces = [this.level.boards[0].shape, this.level.boards[1].shape];

    for (const v of this.views) v.destroy();
    this.views = this.level.boards.map((b, i) => {
      const view = new BoardView(this.textures[i], b.shape, EDGE_COLOR, Math.atan2(b.along[1], b.along[0]), this.outlineLayer);
      this.boardLayer.addChild(view);
      return view;
    });

    this.cabinet.clear().poly(this.level.cabinet[0].flat()).fill(0x4a4636).stroke({ width: 2, color: 0x2a281f });
    this.errorLayer.clear();
    this.drawHint();
    this.hintLayer.visible = false;
    this.ui.hint.classList.remove('active');
    this.ui.result.hidden = true;
    this.ui.title.textContent = `Bölüm ${index + 1}/${this.levels.length} · ${this.level.name}`;
    this.layout();
    this.refreshHud();
  }

  /** Frames the corner joint in the middle of the screen; the boards run off the edges. */
  private layout() {
    if (!this.level) return;
    const { width, height } = this.app.screen;
    const scale = Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT);
    const { innerCorner: c, outerCorner: o } = this.level;
    this.world.scale.set(scale);
    this.world.position.set(width / 2 - ((c[0] + o[0]) / 2) * scale, height * 0.55 - ((c[1] + o[1]) / 2) * scale);
  }

  private toWorld(e: FederatedPointerEvent): Pair {
    const p = this.world.toLocal(e.global);
    return [p.x, p.y];
  }

  private touchedBoards(a: Pair, b: Pair): number[] {
    return [0, 1].filter((i) => segmentTouches(this.pieces[i], a, b));
  }

  private readonly onDown = (e: FederatedPointerEvent) => {
    if (this.phase !== 'cutting') return;
    this.dragStart = this.toWorld(e);
  };

  private readonly onMove = (e: FederatedPointerEvent) => {
    if (!this.dragStart) return;
    const a = this.dragStart;
    const b = this.toWorld(e);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.cutPreview.clear();
    if (len < 2) return;
    const valid = this.canCut() && this.touchedBoards(a, b).length > 0;
    const color = valid ? 0x9dff8a : 0xffd27a;
    // The saw follows the whole line, so show it running past the stroke.
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    this.cutPreview
      .moveTo(a[0] - ux * 2000, a[1] - uy * 2000)
      .lineTo(b[0] + ux * 2000, b[1] + uy * 2000)
      .stroke({ width: 1.5, color, alpha: 0.45 })
      .moveTo(...a)
      .lineTo(...b)
      .stroke({ width: 3, color, alpha: 0.95 })
      .circle(...a, 5)
      .circle(...b, 5)
      .fill({ color, alpha: 0.95 });
  };

  private readonly onUp = (e: FederatedPointerEvent) => {
    if (!this.dragStart) return;
    const a = this.dragStart;
    const b = this.toWorld(e);
    this.dragStart = null;
    this.cutPreview.clear();
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_CUT_LENGTH) return;
    if (!this.canCut()) {
      this.showToast('Kesim hakkın bitti. Geri alabilir ya da birleştirebilirsin.');
      return;
    }
    const next: Pieces = [...this.pieces];
    let cutAny = false;
    for (const i of this.touchedBoards(a, b)) {
      const result = lineCut(this.pieces[i], a, b, this.level.boards[i].anchor);
      if (!result) continue;
      cutAny = true;
      next[i] = result.kept;
      for (const piece of result.removed) this.dropPiece(piece, i);
    }
    if (!cutAny) {
      this.showToast('Kesmek için çizgiyi bir tahtanın üzerinden geçir.');
      return;
    }
    this.history.push(this.pieces);
    this.setPieces(next);
  };

  private setPieces(pieces: Pieces) {
    this.pieces = pieces;
    pieces.forEach((p, i) => this.views[i].setPolygon(p));
    this.refreshHud();
  }

  private canCut() {
    return this.history.length < this.level.maxCuts;
  }

  private dropPiece(poly: Polygon, board: number) {
    const b = this.level.boards[board];
    const view = new BoardView(this.textures[board], poly, EDGE_COLOR, Math.atan2(b.along[1], b.along[0]));
    const [cx, cy] = polygonCentroid(poly);
    view.pivot.set(cx, cy);
    view.position.set(cx, cy);
    this.piecesLayer.addChild(view);
    // Off-cuts fly off the end of the board, away from the wall.
    const away = -Math.sign(b.along[0] || 1);
    this.falling.push({
      view,
      vx: away * (80 + Math.random() * 80),
      vy: -240 - Math.random() * 120,
      spin: away * (1.5 + Math.random() * 2),
      age: 0,
    });
  }

  private undo() {
    if (this.phase !== 'cutting') return;
    const previous = this.history.pop();
    if (previous) this.setPieces(previous);
  }

  private toggleHint() {
    if (this.phase !== 'cutting') return;
    this.hintLayer.visible = !this.hintLayer.visible;
    this.ui.hint.classList.toggle('active', this.hintLayer.visible);
  }

  /** Marks the two points where the boards' edges cross: the cut runs through both. */
  private drawHint() {
    const { innerCorner: c, outerCorner: o } = this.level;
    const g = this.hintLayer.clear();
    const len = Math.hypot(o[0] - c[0], o[1] - c[1]);
    const dash = 8;
    for (let t = 0; t < len; t += dash * 2) {
      const t2 = Math.min(len, t + dash);
      g.moveTo(c[0] + ((o[0] - c[0]) * t) / len, c[1] + ((o[1] - c[1]) * t) / len);
      g.lineTo(c[0] + ((o[0] - c[0]) * t2) / len, c[1] + ((o[1] - c[1]) * t2) / len);
    }
    g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.85 });
    for (const p of [c, o]) g.circle(p[0], p[1], 8).stroke({ width: 3, color: 0xffffff });
  }

  private join() {
    if (this.phase !== 'cutting') return;
    this.phase = 'sliding';
    this.hintLayer.visible = false;
    this.ui.hint.classList.remove('active');
    this.joint = measureJoint(this.level, this.pieces);
    this.slideTime = 0;
    this.refreshHud();
  }

  private finishSlide() {
    const joint = this.joint!;
    this.views.forEach((v, i) => v.setOffset(...slideOffset(this.level, i, joint.slide)));
    this.errorLayer.clear();
    for (const poly of joint.errors) {
      poly.forEach((ring, i) => {
        this.errorLayer.poly(ring.flat());
        if (i === 0) this.errorLayer.fill({ color: 0xff3b30, alpha: 0.75 });
        else this.errorLayer.cut();
      });
    }
    this.phase = 'result';
    this.resultTimer = window.setTimeout(() => this.showResult(joint), 450);
  }

  private showResult(joint: JointResult) {
    this.ui.stars.innerHTML = [0, 1, 2]
      .map((i) => `<span class="star${i < joint.stars ? ' on' : ''}" style="animation-delay:${i * 0.15}s">★</span>`)
      .join('');
    const verdict = ['Olmadı, tekrar dene!', 'Fena değil.', 'Güzel oturdu!', 'Tam oturdu!'][joint.stars];
    this.ui.fitText.textContent = `${verdict} Uyum: %${Math.round(joint.fitPercent)}`;
    this.ui.next.hidden = joint.stars === 0;
    this.ui.result.hidden = false;
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
      p.view.alpha = Math.max(0, 1 - p.age / FALL_SECONDS);
    }
    this.falling = this.falling.filter((p) => {
      if (p.age < FALL_SECONDS) return true;
      p.view.destroy();
      return false;
    });

    if (this.phase === 'sliding' && this.joint) {
      this.slideTime += dt;
      const t = Math.min(1, this.slideTime / SLIDE_SECONDS);
      // Ease in, so the boards pick up speed and meet with a knock.
      const slide = this.joint.slide * t * t;
      this.views.forEach((v, i) => v.setOffset(...slideOffset(this.level, i, slide)));
      if (t >= 1) this.finishSlide();
    }
  }
}
