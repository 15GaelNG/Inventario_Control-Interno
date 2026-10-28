/**
 * Imagen (src/html/js/componentes/imagen.html): reducir una foto antes de subirla, con poca memoria y de una en una.
 *
 * Correr: node tests/imagen.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const h = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'imagen.html'), 'utf8');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;

// jsdom no carga ni dibuja imágenes: una Image que "abre" según el nombre de la URL ("4000x2000", "malo") y un lienzo
// que anota lo que se le hace
let abiertas = 0;
let maxAbiertas = 0;
const lienzos = [];
window.URL.createObjectURL = (archivo) => 'blob:' + archivo.name;
window.URL.revokeObjectURL = () => { abiertas--; };
window.Image = class {
  set src(v) {
    if (!v) return;
    abiertas++;
    maxAbiertas = Math.max(maxAbiertas, abiertas);
    const m = /(\d+)x(\d+)/.exec(v);
    setTimeout(() => {
      if (!m) { this.onerror && this.onerror(); return; }
      this.naturalWidth = Number(m[1]);
      this.naturalHeight = Number(m[2]);
      this.onload && this.onload();
    }, 5);
  }
};
window.HTMLCanvasElement.prototype.getContext = function () {
  const lienzo = this;
  const g = { pasos: [], fillRect: () => g.pasos.push('relleno ' + g.fillStyle), drawImage: () => g.pasos.push('foto') };
  lienzos.push({ lienzo, g });
  return g;
};
window.HTMLCanvasElement.prototype.toDataURL = function (tipo, calidad) {
  return 'data:' + tipo + ';base64,' + window.btoa(this.width + 'x' + this.height + '@' + calidad);
};
window.eval(h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>')) + '\nwindow.Imagen = Imagen;');
const { Imagen } = window;
const archivo = (nombre, bytes) => { const f = new window.File(['x'], nombre, { type: 'image/jpeg' }); Object.defineProperty(f, 'size', { value: bytes || 1000 }); return f; };
const medida = (r) => window.atob(r.base64);

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

(async () => {
  console.log('1. Por el lado más largo o por el ancho');
  const r1 = await Imagen.reducir(archivo('4000x3000.jpg'), { lado: 1600, calidad: 0.82 });
  ok(medida(r1) === '1600x1200@0.82' && r1.mime === 'image/jpeg' && r1.ancho === 1600 && r1.alto === 1200, 'lado: 4000×3000 → 1600×1200, con su calidad');
  const r2 = await Imagen.reducir(archivo('1000x4000.jpg'), { lado: 2000 });
  ok(medida(r2) === '500x2000@0.85', 'una vertical se mide por su lado largo (y la calidad por omisión es .85)');
  const r3 = await Imagen.reducir(archivo('4000x2000.jpg'), { ancho: 1200 });
  ok(medida(r3) === '1200x600@0.85', 'ancho: solo el ancho (la foto de una firma)');

  console.log('2. Nunca agranda; dice si ya cabía');
  const r4 = await Imagen.reducir(archivo('800x600.png'), { lado: 1600 });
  ok(medida(r4) === '800x600@0.85' && r4.cabia, 'una chica se queda de su tamaño y cabia = true');
  ok(!r1.cabia, 'la que se redujo: cabia = false');

  console.log('3. Fondo blanco antes de la foto');
  ok(lienzos.every((x) => x.g.pasos.join() === 'relleno #ffffff,foto'), 'cada lienzo: relleno blanco y luego la foto');
  ok(lienzos.every((x) => x.lienzo.width === 0), 'y se suelta al terminar (width = 0)');

  console.log('4. Miniatura de la misma apertura');
  const r5 = await Imagen.reducir(archivo('3000x2000.jpg'), { lado: 2000, miniatura: 240 });
  ok(window.atob(r5.miniatura.split(',')[1]) === '240x160@0.7', 'una miniatura de 240 px, JPEG .7');

  console.log('5. Una que no se lee → null');
  ok(await Imagen.reducir(archivo('malo.heic'), { lado: 1600 }) === null, 'null (quien la pidió decide: mandarla tal cual o avisar)');

  console.log('6. De una en una, aunque se pidan juntas');
  maxAbiertas = 0;
  const varias = await Promise.all(['2000x1000', '3000x1500', '4000x2000', '5000x2500'].map((n) => Imagen.reducir(archivo(n + '.jpg'), { lado: 1000 })));
  ok(varias.every((r) => medida(r) === '1000x500@0.85'), 'las 4 salen bien');
  ok(maxAbiertas === 1, 'y nunca hubo dos abiertas a la vez (máximo ' + maxAbiertas + ')');
  ok(abiertas === 0, 'todas se soltaron');

  console.log('7. bytes');
  ok(Array.from(Imagen.bytes(window.btoa('AB'))).join() === '65,66', 'base64 → Uint8Array');

  if (fallas) { console.error('\n' + fallas + ' falla(s)'); process.exit(1); }
  console.log('\nTODO OK');
})();
