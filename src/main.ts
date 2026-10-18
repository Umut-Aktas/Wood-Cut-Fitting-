import { Application } from 'pixi.js';
import { Game, type GameUi } from './game';
import { LEVEL_1 } from './level';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const app = new Application();
await app.init({
  resizeTo: window,
  background: '#2a1f17',
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
$('app').appendChild(app.canvas);

const ui: GameUi = {
  title: $('title'),
  cuts: $('cuts'),
  toast: $('toast'),
  undo: $('undo'),
  hint: $('hint'),
  join: $('join'),
  result: $('result'),
  stars: $('stars'),
  fitText: $('fit-text'),
  retry: $('retry'),
};

new Game(app, LEVEL_1, ui);
