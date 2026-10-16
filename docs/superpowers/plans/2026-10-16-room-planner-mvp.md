# Room Planner MVP — план реализации

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ SUB-SKILL: superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans — выполнять задачу за задачей. Шаги размечены чекбоксами (`- [ ]`).

**Цель:** довести Room Planner до рабочего состояния по критериям готовности MVP (SPEC §12): комната из `project.json` в 3D с дверью и окном, мебель двигается/поворачивается с подсветкой нарушений, проект переживает перезагрузку, сайт живёт на GitHub Pages и обновляется после `git push`.

**Архитектура:** чистая доменная логика (единицы, геометрия стен, валидация, коллизии, операции над проектом, хранение) — без Three.js и DOM, полностью покрыта Vitest. Поверх неё — тонкий слой сцены на Three.js, который подписан на иммутабельный `ProjectStore` и сверяет меши по `id`, и vanilla-TS UI-панели. Источник правды — объект `Project` в сторе; сцена и UI только читают его и вызывают операции.

**Стек:** TypeScript 7.0, Vite 8.3, three 0.186 (+ @types/three 0.186), Vitest 5.0, Node 24, GitHub Actions → GitHub Pages.

**Spec:** [`SPEC.md`](../../../SPEC.md)

## Global Constraints

- Единицы в JSON — миллиметры; в Three.js — метры. Конвертация только через `src/utils/units.ts`.
- Y — вверх, пол в плоскости XZ, начало координат — левый ближний угол комнаты (см. «Зафиксированные решения»).
- `rotationY` — градусы; шаг 90° по умолчанию.
- Привязка к сетке по умолчанию — 50 мм, шаг настраивается.
- Все размеры в UI — в мм.
- Схема проекта валидируется при загрузке, ошибки понятны человеку (на русском, с путём к полю).
- Никаких внешних сервисов, трекинга и CDN: данные остаются в браузере.
- Первая загрузка — до ~2 МБ без моделей мебели.
- Десктоп: Chrome, Firefox, Safari, Edge. Мобильные — только просмотр (орбита/зум работают, перетаскивания нет).
- Минимум зависимостей: runtime — только `three`. Dev — `typescript`, `vite`, `vitest`, `@types/three`.
- `base` в Vite = `'/RoomPlanner/'` (точное имя репозитория, регистр важен). Пути к ассетам — через `import.meta.env.BASE_URL`.
- Если `model` в каталоге пустой — предмет рисуется параллелепипедом по `size`.

## Зафиксированные решения

Спецификация оставляет эти вопросы открытыми; исполнитель не должен решать их заново.

1. **Корень проекта — корень репозитория**, а не подпапка `room-planner/` из SPEC §4. Чистые модули дополнительно вынесены в `src/state/` и `src/scene/walls.ts`.
2. **Система координат плана (мм):** начало — юго-западный угол (левый ближний, если стоять у южной стены лицом на север). `x` растёт на восток (0…`width`), `z` — на север (0…`length`). Северная стена: `z = length`, южная: `z = 0`, западная: `x = 0`, восточная: `x = width`.
3. **План → мир Three.js:** `world.x = x / 1000`, `world.z = -z / 1000`, `world.y = высота / 1000`. Тогда север — это `-Z` мира, система остаётся правой, а положительный `rotationY` (против часовой стрелки при взгляде сверху) совпадает с `mesh.rotation.y` в радианах.
4. **`offset` проёма** — от левого угла стены при взгляде изнутри комнаты (функция `wallFrame`):

   | Стена | origin (x, z) | dir | inward |
   |---|---|---|---|
   | north | (0, length) | (1, 0) | (0, −1) |
   | south | (width, 0) | (−1, 0) | (0, 1) |
   | east | (width, length) | (0, −1) | (−1, 0) |
   | west | (0, 0) | (0, 1) | (1, 0) |

5. **Габариты комнаты внутренние.** Стены толщиной `wallThickness` строятся наружу; углы закрываются четырьмя угловыми столбами `t × t × height`.
6. **Footprint предмета:** при `rotationY = 0` ширина `w` идёт по `x`, глубина `d` — по `z`; поворот — против часовой стрелки вокруг `position`.
7. **Допуск касания:** `EPS = 0.5` мм. Касание стены или соседнего предмета — не нарушение.
8. **Зона проёма:** прямоугольник вдоль стены (`offset … offset + width`) глубиной внутрь комнаты: дверь — `opening.width` (зона распахивания), окно — `300` мм. Окно перекрывает только предмет с `size.h > opening.sill`.
9. **Проёмы на MVP — сегментированные стены**, без CSG (SPEC §11).
10. **Ключи localStorage:** `room-planner:project:v1`; повреждённое содержимое сохраняется в `room-planner:project:v1:corrupt` перед откатом к встроенному проекту.
11. **Сэмпл-данные:** шкаф из SPEC §5.1 стоит в `x: 300` при `w: 900`, то есть выходит за западную стену на 150 мм. В `src/data/project.json` ставим `x: 450`, чтобы стартовая сцена была без красного.
12. **Видимость репозитория:** GitHub Pages для приватного репозитория требует платного плана (SPEC §8.3). Задача 11 начинается с решения владельца: сделать репозиторий публичным (тогда `project.json` публичен — без адресов и личных данных) или подтвердить план GitHub Pro.

## Review Focus

Входные данные, которые спецификация подразумевает, но явно не описывает. Тест на каждый пункт добавлен в задачу-владельца.

1. **Мебель вплотную к стене или к соседу** не подсвечивается красным (касание ≠ пересечение) → Задача 4, `touching walls and neighbours is not an issue`.
2. **Поворот на 90° у стены** меняет footprint (`w` ↔ `d`) — проверка выхода за стену должна учитывать поворот → Задача 4, `rotation swaps footprint extents`.
3. **Кривой JSON при импорте и испорченный localStorage**: приложение не падает, показывает ошибки, текущий проект не теряется, повреждённые данные не затираются молча → Задача 6, `corrupt storage falls back and keeps backup` и `import of invalid file does not replace project`.
4. **Проём за пределами стены или пересекающиеся проёмы** дают понятную ошибку валидации, а не сломанную геометрию → Задача 3, `rejects opening beyond wall` и `rejects overlapping openings`.
5. **Ввод в панели свойств: пусто, 0, минус, не число, «#zzz»** — значение не применяется, поле помечено как неверное → Задача 5, `resize rejects non-positive and non-finite` и `recolor rejects invalid color`; Задача 10 — проверка подсветки поля.

---

## Структура файлов

```
.github/workflows/deploy.yml   CI: тесты, сборка, публикация на Pages
public/models/.gitkeep         место для GLB (этап 2)
src/main.ts                    точка входа: сборка store, сцены и UI
src/style.css                  раскладка: тулбар, канва, панель свойств
src/data/schema.ts             типы проекта и каталога
src/data/validate.ts           валидация project.json / catalog.json
src/data/project.json          стартовый проект
src/data/catalog.json          каталог (шкаф, кровать, стол — без GLB)
src/utils/units.ts             мм ↔ м, план ↔ мир
src/utils/storage.ts           localStorage, импорт/экспорт JSON
src/state/store.ts             ProjectStore: состояние + подписки
src/state/furnitureOps.ts      иммутабельные операции над мебелью, snap
src/scene/walls.ts             wallFrame, wallLength, wallPanels (чистая геометрия)
src/scene/collisions.ts        footprint, проверки (чистая геометрия)
src/scene/viewer.ts            renderer, сцена, свет, цикл, resize
src/scene/room.ts              меши пола, стен, потолка, стёкол
src/scene/furniture.ts         FurnitureLayer: меши мебели, выделение, подсветка
src/scene/controls.ts          камеры перспектива/сверху, OrbitControls
src/scene/drag.ts              выбор и перетаскивание по полу
src/ui/toolbar.ts              вид, потолок, шаг сетки, добавить, импорт/экспорт/сброс
src/ui/propertiesPanel.ts      свойства выделенного предмета и его нарушения
src/ui/notifications.ts        сообщения и список ошибок валидации
tests/*.test.ts                Vitest (среда node, без DOM)
```

---

### Задача 1: Каркас проекта

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`, `src/vite-env.d.ts`, `public/models/.gitkeep`, `README.md`
- Keep: `.gitignore` (уже есть, не перезаписывать шаблонным)

**Interfaces:**
- Produces: скрипты `npm run dev | build | preview | test | test:watch`; `import json from './x.json'` работает (`resolveJsonModule`).

- [ ] **Шаг 1: Сгенерировать шаблон во временную папку** — `npm create vite@latest ../rp-scaffold -- --template vanilla-ts`. Скопировать в репозиторий `package.json`, `tsconfig.json`, `index.html`, `src/vite-env.d.ts`, `public/` (без демо-ассетов). Демо-файлы (`counter.ts`, `typescript.svg`, `vite.svg`) не переносить. Удалить `../rp-scaffold`.
- [ ] **Шаг 2: Зависимости** — `npm i three` и `npm i -D @types/three vitest`. Поле `"name": "room-planner"`, `"private": true`.
- [ ] **Шаг 3: Скрипты** — `"test": "vitest run --passWithNoTests"`, `"test:watch": "vitest"`; `build` оставить шаблонным (typecheck + `vite build`).
- [ ] **Шаг 4: `vite.config.ts`** — `defineConfig` из `vitest/config`: `base: '/RoomPlanner/'`, `test: { include: ['tests/**/*.test.ts'], environment: 'node' }`.
- [ ] **Шаг 5: `tsconfig.json`** — включить `"resolveJsonModule": true`, оставить `strict: true`; добавить `tests` в `include`.
- [ ] **Шаг 6: Заглушки** — `index.html` с `<div id="app">` и заголовком «Room Planner»; `src/main.ts` импортирует `./style.css` и пишет «Room Planner» в `#app`.
- [ ] **Шаг 7: README.md** — 10–15 строк: что это, `npm i`, `npm run dev` (открывать `http://localhost:5173/RoomPlanner/`), `npm test`, ссылка на SPEC.md.
- [ ] **Шаг 8: Проверка** — `npm test` → exit 0; `npm run build` → создан `dist/index.html`, в нём пути вида `/RoomPlanner/assets/...`.
- [ ] **Шаг 9: Commit** — `git add -A && git commit -m "chore: scaffold Vite + TypeScript + three + vitest"`

---

### Задача 2: Единицы и геометрия стен

**Files:**
- Create: `src/utils/units.ts`, `src/scene/walls.ts`
- Test: `tests/units.test.ts`, `tests/walls.test.ts`

**Interfaces:**
- Consumes: тип `Room`, `WallSide` (объявить в этой задаче в `src/data/schema.ts` минимально; Задача 3 его дополнит).
- Produces:
  - `type Vec2 = { x: number; z: number }` (в `units.ts`)
  - `mmToM(mm: number): number`, `mToMm(m: number): number`
  - `planToWorld(p: Vec2): Vec2`, `worldToPlan(p: Vec2): Vec2`
  - `degToRad(deg: number): number`
  - `wallLength(room: Room, wall: WallSide): number` — north/south → `width`, east/west → `length`
  - `wallFrame(room: Room, wall: WallSide): { origin: Vec2; dir: Vec2; inward: Vec2 }` — таблица из «Решений» п.4
  - `wallPointToPlan(room: Room, wall: WallSide, u: number): Vec2` — `origin + dir * u`
  - `interface WallRect { u0: number; u1: number; v0: number; v1: number }`
  - `wallPanels(length: number, height: number, holes: { offset: number; width: number; sill: number; height: number }[]): WallRect[]` — сплошные куски стены вокруг проёмов, отсортированы по `u0`, затем `v0`, без вырожденных (нулевой ширины/высоты)

- [ ] **Шаг 1: Написать падающие тесты**

```ts
// units.test.ts
expect(mmToM(4200)).toBe(4.2);
expect(planToWorld({ x: 1000, z: 2000 })).toEqual({ x: 1, z: -2 });
expect(worldToPlan(planToWorld({ x: 1234, z: 567 }))).toEqual({ x: 1234, z: 567 });

// walls.test.ts
const room = { width: 4200, length: 5000, height: 2700, wallThickness: 100, /* materials */ };
expect(wallLength(room, 'north')).toBe(4200);
expect(wallLength(room, 'east')).toBe(5000);
expect(wallPointToPlan(room, 'north', 1200)).toEqual({ x: 1200, z: 5000 });
expect(wallPointToPlan(room, 'south', 800)).toEqual({ x: 3400, z: 0 });
expect(wallPointToPlan(room, 'east', 1000)).toEqual({ x: 4200, z: 4000 });
expect(wallPointToPlan(room, 'west', 1000)).toEqual({ x: 0, z: 1000 });

test('door splits wall into three panels', () => {
  expect(wallPanels(4200, 2700, [{ offset: 800, width: 900, sill: 0, height: 2100 }])).toEqual([
    { u0: 0, u1: 800, v0: 0, v1: 2700 },
    { u0: 800, u1: 1700, v0: 2100, v1: 2700 },
    { u0: 1700, u1: 4200, v0: 0, v1: 2700 },
  ]);
});
test('window leaves panels below and above', () => {
  expect(wallPanels(4200, 2700, [{ offset: 1200, width: 1500, sill: 900, height: 1400 }])).toEqual([
    { u0: 0, u1: 1200, v0: 0, v1: 2700 },
    { u0: 1200, u1: 2700, v0: 0, v1: 900 },
    { u0: 1200, u1: 2700, v0: 2300, v1: 2700 },
    { u0: 2700, u1: 4200, v0: 0, v1: 2700 },
  ]);
});
test('opening at corner and up to ceiling yields no degenerate panels', () => {
  expect(wallPanels(4200, 2700, [{ offset: 0, width: 1000, sill: 0, height: 2700 }]))
    .toEqual([{ u0: 1000, u1: 4200, v0: 0, v1: 2700 }]);
});
test('wall without openings is one panel', () => {
  expect(wallPanels(5000, 2700, [])).toEqual([{ u0: 0, u1: 5000, v0: 0, v1: 2700 }]);
});
test('two openings are ordered and gap between them is full height', () => { /* offsets 500 и 2500, width 1000 → панель {1500..2500, 0..2700} присутствует */ });
```

- [ ] **Шаг 2: Запустить** — `npx vitest run tests/units.test.ts tests/walls.test.ts` → FAIL (модули не найдены).
- [ ] **Шаг 3: Реализовать** `units.ts` и `walls.ts` по сигнатурам выше. `wallPanels` предполагает, что проёмы валидны (не пересекаются, в пределах стены) — это гарантирует Задача 3.
- [ ] **Шаг 4: Запустить** — те же тесты → PASS.
- [ ] **Шаг 5: Commit** — `git commit -m "feat: units and wall geometry"`

---

### Задача 3: Схема, валидация и стартовые данные

**Files:**
- Create/Modify: `src/data/schema.ts`, `src/data/validate.ts`, `src/data/project.json`, `src/data/catalog.json`
- Test: `tests/validate.test.ts`

**Interfaces:**
- Consumes: `wallLength` (Задача 2).
- Produces (`schema.ts`): `WallSide`, `MaterialSpec { color: string }`, `Room`, `Opening { id; type: 'door' | 'window'; wall; offset; width; height; sill }`, `Socket { id; wall; offset; height }`, `Size3 { w; h; d }`, `FurnitureItem { id; catalogId; position: { x; z }; rotationY; size: Size3; color }`, `EstimateItem { id; category; name; unit; quantity; unitPrice; note }`, `Project { version: 1; name; room; openings; sockets; furniture; estimate }`, `CatalogEntry { id; name; category; model; defaultSize: Size3; source; license }` — поля и имена ровно как в SPEC §5.
- Produces (`validate.ts`):
  - `interface ValidationError { path: string; message: string }` — путь вида `furniture[0].size.w`, корень — `''`
  - `type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] }`
  - `validateProject(input: unknown): ValidationResult<Project>`
  - `validateCatalog(input: unknown): ValidationResult<CatalogEntry[]>`
  - `isColor(s: unknown): s is string` — `/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`

**Правила валидации** (собирать все ошибки, а не первую; сообщения по-русски):
- `version === 1`, иначе «Неподдерживаемая версия проекта: N».
- Все размеры (`room.*`, `size.*`, `width`, `height`, `quantity`) — конечные числа; размеры комнаты и предметов `> 0`; `sill`, `offset`, `unitPrice`, `quantity` `>= 0`.
- `wall` ∈ `north | south | east | west`; `type` ∈ `door | window`.
- Проём: `offset + width <= wallLength` («выходит за пределы стены»), `sill + height <= room.height`; проёмы одной стены не пересекаются (касание допустимо).
- Розетка: `offset <= wallLength`, `height <= room.height`.
- Цвета — `isColor`.
- `id` уникальны внутри каждого массива.
- `position` — конечные числа; выход за комнату — не ошибка схемы, это задача коллизий.
- Каталог: `id`, `name`, `license` — непустые строки (лицензия обязательна, SPEC §11); `model` — строка (может быть пустой); `defaultSize` как `Size3`.
- Лишние поля не ошибка и сохраняются как есть (файл правят вручную и ИИ).

**Данные:**
- `project.json` — пример из SPEC §5.1, но шкаф в `x: 450, z: 250`; добавить `bed-1` (`catalogId: "bed-double"`, `position {3200, 2500}`, `rotationY: 90`, `size {w:1600,h:450,d:2000}`, `#d9cbb3`) и `desk-1` (`"desk-basic"`, `{1950, 4700}`, `0`, `{1200, 750, 600}`, `#8b6b4a`). Эта раскладка не даёт ни одного нарушения — тест в Задаче 4.
- `catalog.json` — `wardrobe-basic` (из SPEC), `bed-double`, `desk-basic`; везде `"model": ""`, `"source": "box placeholder"`, `"license": "CC0"`.

- [ ] **Шаг 1: Написать падающие тесты**

```ts
import sample from '../src/data/project.json';
import catalog from '../src/data/catalog.json';
const clone = () => structuredClone(sample) as any;

test('accepts bundled project and catalog', () => {
  expect(validateProject(sample).ok).toBe(true);
  expect(validateCatalog(catalog).ok).toBe(true);
});
test('rejects non-object root', () => {
  const r = validateProject('nope');
  expect(r.ok).toBe(false); expect(!r.ok && r.errors[0].path).toBe('');
});
test('rejects unsupported version', () => { const p = clone(); p.version = 2; expectError(p, 'version'); });
test('reports exact path for bad size', () => { const p = clone(); p.furniture[0].size.w = -1; expectError(p, 'furniture[0].size.w'); });
test('rejects opening beyond wall', () => {
  const p = clone(); p.openings[1].offset = 3000; // north: 3000 + 1500 > 4200
  expectError(p, 'openings[1]', /выходит за пределы стены/);
});
test('rejects overlapping openings', () => {
  const p = clone(); p.openings.push({ id: 'window-2', type: 'window', wall: 'north', offset: 2000, width: 800, height: 1000, sill: 900 });
  expectError(p, 'openings[2]', /пересекается/);
});
test('rejects duplicate ids', () => { const p = clone(); p.furniture[1].id = p.furniture[0].id; expectError(p, 'furniture[1].id'); });
test('accepts #fff and rejects named colors', () => {
  const p = clone(); p.furniture[0].color = '#fff'; expect(validateProject(p).ok).toBe(true);
  p.furniture[0].color = 'red'; expectError(p, 'furniture[0].color');
});
test('collects several errors at once', () => {
  const p = clone(); p.room.width = 0; p.furniture[0].size.h = 'tall';
  const r = validateProject(p); expect(!r.ok && r.errors.length).toBeGreaterThanOrEqual(2);
});
test('catalog requires license', () => { const c = structuredClone(catalog) as any; c[0].license = ''; /* errors path '[0].license' */ });
// expectError(p, path, msg?) — локальный хелпер: ok === false и есть ошибка с этим path (и сообщением по regex)
```

- [ ] **Шаг 2: Запустить** — `npx vitest run tests/validate.test.ts` → FAIL.
- [ ] **Шаг 3: Реализовать** `schema.ts`, `validate.ts`, JSON-файлы. Валидатор — ручной, на маленьких хелперах (`num(path, v, {min, exclusiveMin})`, `str`, `oneOf`); без zod и прочих библиотек.
- [ ] **Шаг 4: Запустить** → PASS; `npm run build` → без ошибок типов.
- [ ] **Шаг 5: Commit** — `git commit -m "feat: project schema, validation and sample data"`

---

### Задача 4: Коллизии

**Files:**
- Create: `src/scene/collisions.ts`
- Test: `tests/collisions.test.ts`

**Interfaces:**
- Consumes: `Vec2` (Задача 2), `wallFrame` (Задача 2), `Project`, `FurnitureItem`, `Opening`, `Room` (Задача 3).
- Produces:
  - `const EPS = 0.5`, `const WINDOW_CLEARANCE = 300`
  - `footprint(item: Pick<FurnitureItem, 'position' | 'rotationY' | 'size'>): Vec2[]` — 4 угла, против часовой
  - `isInsideRoom(poly: Vec2[], room: Room): boolean`
  - `polygonsOverlap(a: Vec2[], b: Vec2[]): boolean` — SAT по выпуклым многоугольникам; перекрытие меньше `EPS` не считается
  - `openingZone(opening: Opening, room: Room): Vec2[]`
  - `type IssueKind = 'outside-room' | 'overlap' | 'blocks-opening'`
  - `interface Issue { kind: IssueKind; otherId?: string }` — `otherId`: id другого предмета или проёма
  - `findIssues(project: Project): Map<string, Issue[]>` — ключ — id предмета; в карте только предметы с нарушениями

- [ ] **Шаг 1: Написать падающие тесты** (комната 4200 × 5000 × 2700; `item(x, z, w, d, rot = 0, h = 1000)` — локальный хелпер)

```ts
test('touching walls and neighbours is not an issue', () => {
  // 900×500 в (450,250): касается западной и южной стен
  // A 1000×500 в (500,250) и B 1000×500 в (1500,250) — стык по x = 1000
  expect(findIssues(projectWith([a, b])).size).toBe(0);
});
test('outside room by 10 mm is reported', () => { /* 900×500 в (440,250) → [{ kind: 'outside-room' }] */ });
test('rotation swaps footprint extents', () => {
  // 900×500 в (250,450), rot 90 → x∈[0,500], z∈[0,900]: внутри
  // тот же предмет с rot 0 → x∈[-200,700]: outside-room
});
test('overlap is reported for both items', () => {
  // B в (1490,250) → A: [{ kind: 'overlap', otherId: 'B' }], B: [{ kind: 'overlap', otherId: 'A' }]
});
test('free rotation uses real shape, not bounding box', () => {
  // A 1000×1000 в (1000,1000) rot 45 (вершина ромба при x≈1707)
  // B 200×200 в (1650,1000) → overlap; B в (1850,1000) → нет
});
test('door swing zone is blocked', () => {
  // южная дверь offset 800 width 900 → зона x∈[2500,3400], z∈[0,900]
  // 600×400 в (2950,200) → blocks-opening, otherId 'door-1'; в (2950,1200) → нет
});
test('window is blocked only by items taller than sill', () => {
  // северное окно offset 1200 width 1500 sill 900 → зона x∈[1200,2700], z∈[4700,5000]
  // стол h 750 в (1950,4700) d 600 → нет; шкаф h 2100 там же → blocks-opening 'window-1'
});
test('bundled sample project has no issues', () => { expect(findIssues(sample).size).toBe(0); });
```

- [ ] **Шаг 2: Запустить** — `npx vitest run tests/collisions.test.ts` → FAIL.
- [ ] **Шаг 3: Реализовать** по сигнатурам. `isInsideRoom`: все вершины в `[-EPS, width+EPS] × [-EPS, length+EPS]`. `openingZone`: точки `wallPointToPlan(offset)`, `wallPointToPlan(offset + width)` и они же, смещённые на `inward * depth`. `findIssues` — O(n²) по предметам, этого достаточно.
- [ ] **Шаг 4: Запустить** → PASS.
- [ ] **Шаг 5: Commit** — `git commit -m "feat: collision checks for walls, furniture and openings"`

---

### Задача 5: Состояние и операции над мебелью

**Files:**
- Create: `src/state/store.ts`, `src/state/furnitureOps.ts`
- Test: `tests/store.test.ts`, `tests/furnitureOps.test.ts`

**Interfaces:**
- Consumes: `Project`, `FurnitureItem`, `Size3`, `CatalogEntry` (Задача 3), `isColor` (Задача 3), `Vec2` (Задача 2).
- Produces (`store.ts`):
  - `class ProjectStore { constructor(initial: Project); get(): Project; set(next: Project): void; subscribe(fn: (p: Project, prev: Project) => void): () => void }` — `set` с тем же объектом ничего не рассылает. Состояние иммутабельно: подписчики сравнивают `p.room !== prev.room`, чтобы понять, нужно ли перестраивать комнату. Сюда позже ляжет undo/redo (этап 3).
- Produces (`furnitureOps.ts`) — чистые функции; при неизвестном `id` возвращают исходный `Project` (тот же объект):
  - `const DEFAULT_GRID_STEP = 50`
  - `snap(mm: number, step: number): number` — `step <= 0` → без изменений
  - `moveItem(p: Project, id: string, pos: Vec2, step: number): Project`
  - `rotateItem(p: Project, id: string, deltaDeg: number): Project` — результат нормализуется в `[0, 360)`
  - `type OpResult = { ok: true; project: Project } | { ok: false; error: string }`
  - `resizeItem(p: Project, id: string, size: Partial<Size3>): OpResult` — конечное, `> 0`, `<= 20000` мм
  - `recolorItem(p: Project, id: string, color: string): OpResult`
  - `addItem(p: Project, entry: CatalogEntry, at: Vec2): { project: Project; id: string }` — id `${entry.id}-${n}`, первый свободный `n ≥ 1`; размер — `entry.defaultSize`, цвет `#cccccc`, поворот 0
  - `removeItem(p: Project, id: string): Project`

- [ ] **Шаг 1: Написать падающие тесты**

```ts
test('snap rounds to grid', () => {
  expect(snap(1234, 50)).toBe(1250); expect(snap(1224, 50)).toBe(1200);
  expect(snap(-26, 50)).toBe(-50); expect(snap(1234, 0)).toBe(1234);
});
test('move snaps and is immutable', () => {
  const next = moveItem(sample, 'desk-1', { x: 1012, z: 2988 }, 50);
  expect(next.furniture.find(f => f.id === 'desk-1')!.position).toEqual({ x: 1000, z: 3000 });
  expect(sample.furniture.find(f => f.id === 'desk-1')!.position).toEqual({ x: 1950, z: 4700 });
  expect(next.room).toBe(sample.room); // комната не пересоздаётся
});
test('rotate normalizes angle', () => { /* bed-1: 90 → +270 → 0; desk-1: 0 → −90 → 270 */ });
test('resize rejects non-positive and non-finite', () => {
  for (const w of [0, -10, NaN, Infinity]) expect(resizeItem(sample, 'desk-1', { w }).ok).toBe(false);
  expect(resizeItem(sample, 'desk-1', { h: 800 }).ok).toBe(true);
});
test('recolor rejects invalid color', () => { expect(recolorItem(sample, 'desk-1', '#zzz').ok).toBe(false); });
test('add generates unique ids', () => { /* wardrobe-basic-1 уже занят каким-то предметом → новый id 'wardrobe-basic-2' */ });
test('unknown id returns same project', () => { expect(moveItem(sample, 'nope', { x: 0, z: 0 }, 50)).toBe(sample); });
test('store notifies with prev and supports unsubscribe', () => { /* set → fn(next, prev); после unsubscribe вызовов нет; set(get()) — без вызова */ });
```

- [ ] **Шаг 2: Запустить** — `npx vitest run tests/store.test.ts tests/furnitureOps.test.ts` → FAIL.
- [ ] **Шаг 3: Реализовать** по сигнатурам.
- [ ] **Шаг 4: Запустить** → PASS.
- [ ] **Шаг 5: Commit** — `git commit -m "feat: project store and furniture operations"`

---

### Задача 6: Хранение, импорт и экспорт

**Files:**
- Create: `src/utils/storage.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: `validateProject`, `ValidationResult`, `ValidationError` (Задача 3).
- Produces:
  - `const STORAGE_KEY = 'room-planner:project:v1'`
  - `interface KeyValueStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }`
  - `getSafeStorage(): KeyValueStorage | null` — `null`, если доступ к `localStorage` бросает исключение (приватный режим Safari)
  - `loadInitialProject(storage: KeyValueStorage | null, fallback: Project): { project: Project; warnings: string[] }`
  - `saveProject(storage: KeyValueStorage | null, p: Project): { ok: true } | { ok: false; error: string }` — ловит `QuotaExceededError` и прочие исключения
  - `parseProjectFile(text: string): ValidationResult<Project>` — ошибка `JSON.parse` → `[{ path: '', message: 'Файл не является корректным JSON: …' }]`
  - `serializeProject(p: Project): string` — `JSON.stringify(p, null, 2) + '\n'`
  - `exportFileName(p: Project): string` — `${slug(name) || 'room-project'}.json`, кириллица сохраняется, недопустимые для имени файла символы заменяются на `-`
  - `downloadProject(p: Project): void` — Blob + временная ссылка `<a download>` (DOM, без юнит-теста)

- [ ] **Шаг 1: Написать падающие тесты** (`memoryStorage()` — фейк на `Map`; `throwingStorage()` — `setItem` бросает `DOMException('…', 'QuotaExceededError')`)

```ts
test('empty storage gives fallback without warnings', () => {
  expect(loadInitialProject(memoryStorage(), sample)).toEqual({ project: sample, warnings: [] });
});
test('valid stored project wins over fallback', () => { /* сохранённый проект с name 'X' → project.name === 'X' */ });
test('corrupt storage falls back and keeps backup', () => {
  const s = memoryStorage({ [STORAGE_KEY]: '{oops' });
  const r = loadInitialProject(s, sample);
  expect(r.project).toBe(sample); expect(r.warnings).toHaveLength(1);
  expect(s.getItem(STORAGE_KEY + ':corrupt')).toBe('{oops');
});
test('schema-invalid stored project also falls back with backup', () => { /* version 2 → то же поведение */ });
test('null storage works', () => { expect(loadInitialProject(null, sample).project).toBe(sample); });
test('save reports quota errors instead of throwing', () => { expect(saveProject(throwingStorage(), sample).ok).toBe(false); });
test('round trip serialize → parse', () => {
  const r = parseProjectFile(serializeProject(sample)); expect(r.ok && r.value).toEqual(sample);
});
test('import of invalid file does not replace project', () => {
  const r = parseProjectFile('not json'); expect(r.ok).toBe(false); expect(!r.ok && r.errors[0].path).toBe('');
});
test('export file name is safe', () => { expect(exportFileName({ ...sample, name: 'Моя комната: v2/3' })).toBe('Моя комната- v2-3.json'); });
```

- [ ] **Шаг 2: Запустить** — `npx vitest run tests/storage.test.ts` → FAIL.
- [ ] **Шаг 3: Реализовать** по сигнатурам.
- [ ] **Шаг 4: Запустить** → PASS.
- [ ] **Шаг 5: Commit** — `git commit -m "feat: localStorage persistence and JSON import/export"`

---

### Задача 7: 3D-вьюер и комната

**Files:**
- Create: `src/scene/viewer.ts`, `src/scene/room.ts`
- Modify: `src/main.ts`, `src/style.css`

**Interfaces:**
- Consumes: `planToWorld`, `mmToM`, `degToRad` (Задача 2), `wallFrame`, `wallLength`, `wallPanels` (Задача 2), `Room`, `Opening` (Задача 3), `ProjectStore` (Задача 5), `loadInitialProject`, `getSafeStorage` (Задача 6).
- Produces:
  - `class Viewer { constructor(container: HTMLElement); readonly scene: THREE.Scene; readonly renderer: THREE.WebGLRenderer; setCamera(cam: THREE.Camera): void; onFrame(fn: () => void): void; dispose(): void }` — `ResizeObserver` на контейнере, `setAnimationLoop`, `HemisphereLight` + `DirectionalLight`, фон `#eef0f3`, `GridHelper` 100 мм под полом (видимость переключается)
  - `buildRoom(room: Room, openings: Opening[], opts: { showCeiling: boolean }): THREE.Group` — пол (`floorMaterial.color`), 4 стены из `wallPanels` (бокс толщиной `wallThickness`, сдвинут наружу на `t/2` по `-inward`), 4 угловых столба, потолок (если `showCeiling`; `side: BackSide`, чтобы не мешал при взгляде сверху), полупрозрачное стекло в окнах (`#9cc7e6`, `opacity 0.3`). Имена объектов: `room-floor`, `wall-north-0…`, `window-glass-<id>`.
  - `disposeObject(obj: THREE.Object3D): void` — освобождает geometry/material у всего поддерева

- [ ] **Шаг 1: Viewer + временная камера** — в `main.ts`: `store = new ProjectStore(loadInitialProject(getSafeStorage(), sampleProject).project)`; `PerspectiveCamera` смотрит на центр комнаты.
- [ ] **Шаг 2: Комната** — `buildRoom` добавляется в сцену; подписка на стор перестраивает группу только при `p.room !== prev.room || p.openings !== prev.openings` (старую — `disposeObject`).
- [ ] **Шаг 3: Проверка в браузере** — `npm run dev`, открыть `http://localhost:5173/RoomPlanner/`. Ожидается: пол 4.2 × 5 м, дверной проём в южной стене у восточного края (x 2.5…3.4 м), окно в северной стене (x 1.2…2.7 м, низ на 0.9 м). Нет ошибок в консоли. Скриншот приложить к отчёту задачи.
- [ ] **Шаг 4: `npm test && npm run build`** → PASS, без ошибок типов.
- [ ] **Шаг 5: Commit** — `git commit -m "feat: three.js viewer and room geometry with openings"`

---

### Задача 8: Мебель в сцене, выделение, подсветка

**Files:**
- Create: `src/scene/furniture.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `FurnitureItem` (3), `Issue` (4), `planToWorld`, `mmToM`, `degToRad` (2).
- Produces:
  - `class FurnitureLayer { constructor(parent: THREE.Object3D); sync(items: FurnitureItem[], issues: Map<string, Issue[]>, selectedId: string | null): void; pick(raycaster: THREE.Raycaster): string | null; meshFor(id: string): THREE.Object3D | undefined; dispose(): void }`
  - Реализация: один `BoxGeometry(1,1,1)` на весь слой, меш масштабируется в `size` (м); `position = planToWorld(position)`, `y = h/2`; `rotation.y = degToRad(rotationY)`; `userData.furnitureId`. Сверка по id: новые создаются, исчезнувшие удаляются, остальные обновляются — без пересоздания.
  - Нарушение: цвет материала `#e5484d` (исходный цвет предмета не теряется — хранится в `userData`). Выделение: `LineSegments(EdgesGeometry)` цвета `#2563eb` поверх меша.

- [ ] **Шаг 1: Подключить** — в `main.ts` вызывать `layer.sync(p.furniture, findIssues(p), selectedId)` при каждом изменении стора и выделения.
- [ ] **Шаг 2: Проверка в браузере** — видны шкаф, кровать, стол на своих местах, без красного. Временно поменять в localStorage x шкафа на 300 через DevTools и перезагрузить → шкаф красный (затем «Сбросить», когда появится тулбар, или очистить ключ).
- [ ] **Шаг 3: `npm test && npm run build`** → PASS.
- [ ] **Шаг 4: Commit** — `git commit -m "feat: render furniture boxes with selection and issue highlight"`

---

### Задача 9: Камеры, выбор и перетаскивание

**Files:**
- Create: `src/scene/controls.ts`, `src/scene/drag.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Viewer` (7), `FurnitureLayer` (8), `worldToPlan` (2), `Room` (3).
- Produces:
  - `type ViewMode = 'perspective' | 'top'`
  - `class ViewControls { constructor(viewer: Viewer, dom: HTMLElement); readonly orbit: OrbitControls; get camera(): THREE.Camera; setMode(m: ViewMode): void; fitToRoom(room: Room): void; setEnabled(on: boolean): void }` — `OrbitControls` из `three/addons/controls/OrbitControls.js`. Перспектива: орбита + зум + пан, `maxPolarAngle` чуть меньше π/2. Сверху: `OrthographicCamera` над центром комнаты, вращение выключено (только пан и зум) — это и есть 2D-режим.
  - `class DragController { constructor(dom: HTMLElement, controls: ViewControls, layer: FurnitureLayer, cb: { onSelect(id: string | null): void; onMove(id: string, planPos: Vec2): void }) }` — `pointerdown` по предмету: выделить, выключить орбиту, запомнить смещение от центра до точки пересечения с плоскостью пола `y = 0`; `pointermove`: `onMove(id, центр)` (снап делает `moveItem`); `pointerup` — включить орбиту. Клик по пустому месту без перемещения → `onSelect(null)`. При `pointerType === 'touch'` — только выбор, без перетаскивания (мобильные — просмотр).
- Клавиатура (в `main.ts`; игнорировать, когда фокус в `input`/`select`): `R` → +90°, `Shift+R` → −90°, `Delete`/`Backspace` → удалить выделенный, `Escape` → снять выделение.

- [ ] **Шаг 1: Реализовать** `controls.ts`, `drag.ts`, подключить в `main.ts`; `onMove` → `store.set(moveItem(store.get(), id, pos, gridStep))`.
- [ ] **Шаг 2: Проверка в браузере** (оба режима вида):
  - стол тащится по полу, позиция в мм кратна 50;
  - стол, вытащенный за стену, краснеет; возврат — снова нормальный цвет;
  - `R` у кровати поворачивает её на 90°, нарушения пересчитываются;
  - в режиме «сверху» камера не вращается;
  - орбита не дёргается во время перетаскивания;
  - в DevTools в режиме мобильного устройства перетаскивания нет, орбита работает.
- [ ] **Шаг 3: `npm test && npm run build`** → PASS.
- [ ] **Шаг 4: Commit** — `git commit -m "feat: camera modes, selection and snapped dragging"`

---

### Задача 10: UI-панели и сохранение

**Files:**
- Create: `src/ui/toolbar.ts`, `src/ui/propertiesPanel.ts`, `src/ui/notifications.ts`
- Modify: `src/main.ts`, `src/style.css`, `index.html`

**Interfaces:**
- Consumes: всё из Задач 3–9; `catalog.json`.
- Produces:
  - `interface UiState { selectedId: string | null; gridStep: number; showCeiling: boolean; viewMode: ViewMode }` — живёт в `main.ts`, не в проекте
  - `mountToolbar(el: HTMLElement, deps: { catalog: CatalogEntry[]; ui: UiState; onViewMode(m: ViewMode): void; onCeiling(on: boolean): void; onGridStep(mm: number): void; onAdd(catalogId: string): void; onImport(file: File): void; onExport(): void; onReset(): void }): void`
  - `mountPropertiesPanel(el: HTMLElement, deps: { getProject(): Project; catalog: CatalogEntry[]; onMove(id: string, pos: Vec2): void; onResize(id: string, size: Partial<Size3>): OpResult; onRecolor(id: string, color: string): OpResult; onRotate(id: string, delta: number): void; onRemove(id: string): void }): { render(selectedId: string | null, issues: Issue[]): void }`
  - `showMessage(text: string, kind: 'info' | 'warn' | 'error'): void`, `showErrors(title: string, errors: ValidationError[]): void`

**Поведение:**
- Раскладка: тулбар сверху, канва по центру, панель свойств справа (на ширине < 768 px панель уходит вниз, тулбар переносится).
- Тулбар: «Перспектива / Сверху», «Потолок» (чекбокс), «Шаг сетки, мм» (число ≥ 0; 0 = без привязки), селект каталога + «Добавить» (в центр комнаты, затем выделить), «Импорт», «Экспорт», «Сбросить к исходному» (с `confirm`).
- Панель свойств: название из каталога и id; X, Z, Ш, В, Г (мм), поворот (°) с кнопками ⟲ 90° и ⟳ 90°, цвет (`input type=color`), «Удалить»; список нарушений по-русски: «Выходит за стены», «Пересекается с {id}», «Перекрывает дверь {id}» / «Перекрывает окно {id}». Без выделения — подсказка «Выберите предмет кликом».
- Неверный ввод (пусто, ≤ 0, не число) → поле получает класс `invalid` и `title` с текстом ошибки из `OpResult`, проект не меняется. Применение — по `change`, не по каждому символу.
- Автосохранение: подписка на стор → `saveProject` с debounce 300 мс; ошибка → `showMessage(…, 'error')` один раз, пока сохранение снова не удастся.
- При старте `warnings` из `loadInitialProject` → `showMessage(…, 'warn')`.
- Импорт: `parseProjectFile` → при ошибке `showErrors('Файл не загружен', errors)`, текущий проект не меняется; при успехе — `store.set`, сброс выделения, `fitToRoom`.

- [ ] **Шаг 1: Реализовать** модули и связку в `main.ts`.
- [ ] **Шаг 2: Проверка в браузере:**
  - изменение ширины стола в панели → меш меняется, нарушения пересчитываются;
  - ввод `0`, `-5`, пустой строки → поле красное, проект не изменился;
  - добавить шкаф из каталога → появился в центре, выделен, id `wardrobe-basic-1`;
  - перезагрузка страницы → изменения на месте;
  - экспорт → скачан `Моя комната.json`; импорт этого же файла → проект тот же;
  - импорт файла с `"version": 2` → список ошибок, сцена не изменилась;
  - «Сбросить к исходному» → стартовая раскладка.
- [ ] **Шаг 3: `npm test && npm run build`** → PASS; размер `dist/` без моделей < 2 МБ (`du -sh dist`).
- [ ] **Шаг 4: Commit** — `git commit -m "feat: toolbar, properties panel, autosave and import/export"`

---

### Задача 11: Деплой на GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `README.md` (ссылка на сайт)

**Предусловие (решение владельца, «Решения» п.12):** репозиторий `Yury-Dtech/RoomPlanner` сейчас приватный. Нужно либо сделать его публичным (`gh repo edit Yury-Dtech/RoomPlanner --visibility public --accept-visibility-change-consequences`), предварительно убедившись, что в `project.json` нет адреса и личных данных, либо подтвердить, что у аккаунта есть GitHub Pro. Без этого задача не выполняется.

- [ ] **Шаг 1: Workflow** — YAML из SPEC §8.2 с обновлёнными версиями: `actions/checkout@v7`, `actions/setup-node@v7` (`node-version: 24`, `cache: npm`), `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`. Шаг `npm test` — без `--if-present`, тесты обязательны.
- [ ] **Шаг 2: Включить Pages с источником GitHub Actions** — `gh api -X POST repos/Yury-Dtech/RoomPlanner/pages -f build_type=workflow` (если Pages уже включены — `-X PUT`).
- [ ] **Шаг 3: Commit и push** — `git commit -m "ci: deploy to GitHub Pages"` и `git push`.
- [ ] **Шаг 4: Проверка** — `gh run watch` → оба джоба зелёные; `curl -sI https://yury-dtech.github.io/RoomPlanner/` → `200`; страница в браузере грузит сцену, в консоли нет 404 на ассеты.
- [ ] **Шаг 5: README** — ссылка на сайт, commit + push; убедиться, что этот push тоже задеплоился.

---

### Задача 12: Приёмка MVP

Проверка по SPEC §12 на опубликованном сайте (не на dev-сервере):

- [ ] Комната из `project.json` отображается в 3D с дверью и окном.
- [ ] Шкаф, кровать и стол двигаются и поворачиваются; выход за стены, пересечение и перекрытие проёма подсвечиваются красным.
- [ ] Проект сохраняется и восстанавливается после перезагрузки страницы.
- [ ] Сайт доступен на GitHub Pages и обновляется после `git push` (сделать видимую правку, например `name` в `project.json`, push, проверить после деплоя; затем «Сбросить к исходному», так как localStorage важнее встроенного файла).
- [ ] Прогон в Chrome и Firefox (Safari/Edge — если доступны); открыть с телефона: просмотр работает.
- [ ] Обновить `Today.md`.

---

## Дальше: этапы 2 и 3 (отдельные планы)

Каждый этап — отдельный план с тем же уровнем детализации, который пишется после приёмки MVP. Здесь — только разбивка и решения, которые MVP должен им оставить.

**Этап 2 — модели и детализация**
1. GLB из каталога: `GLTFLoader` с ленивой загрузкой по `import.meta.env.BASE_URL + model`, нормализация по `Box3` к `size` (неравномерный масштаб по осям), основание на полу; бокс — пока модель грузится и если загрузка упала. Поддержка Draco/meshopt; лимит размера файла модели.
2. Каталог с поиском и категориями (заменяет селект тулбара).
3. Размерные линии от выделенного предмета до ближайших стен и его высота (в мм).
4. Розетки/выключатели на стенах из `sockets` (рендер + редактирование; данные и валидация уже есть с MVP).
5. Текстуры пола и стен с масштабом в мм (`MaterialSpec` расширяется полями `texture`, `tileSize`; версия схемы остаётся 1, поля необязательные).

**Этап 3 — смета и удобство**
1. Таблица сметы с итогами по категориям; автоподсчёт площади пола (`width × length`), стен (периметр × высота − проёмы) и периметра.
2. Экспорт сметы в CSV (UTF-8 с BOM, разделитель `;` — для Excel в RU-локали).
3. Варианты планировки — требует изменения схемы (`version: 2` и миграция `1 → 2` в `validate.ts`).
4. Undo/redo — стек снимков `Project` в `ProjectStore` (иммутабельность с MVP делает это дешёвым).
5. Скриншот сцены в PNG (`preserveDrawingBuffer` или рендер в момент снимка).
