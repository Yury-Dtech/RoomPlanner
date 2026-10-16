# Room Planner

Статическое веб-приложение для планирования комнаты: 3D-сцена на three.js, расстановка мебели, проверка пересечений.
Работает полностью в браузере, без бэкенда и внешних сервисов; развёртывается на GitHub Pages.

## Запуск

```bash
npm i
npm run dev      # открыть http://localhost:5173/RoomPlanner/
npm run build    # проверка типов + сборка в dist/
npm run preview  # предпросмотр собранной версии
npm test         # юнит-тесты (vitest)
```

Подробности и требования — в [SPEC.md](SPEC.md).

## Деплой

Сайт: https://yury-dtech.github.io/RoomPlanner/

Деплой выполняет workflow `.github/workflows/deploy.yml` при пуше в `main`: тесты, сборка, публикация `dist/`.

- В настройках репозитория: **Settings → Pages → Source: GitHub Actions**.
- GitHub Pages для приватного репозитория доступен только на платном плане. На бесплатном плане репозиторий должен быть публичным. В этом случае публичен и `project.json` — в нём не должно быть адресов и личных данных.
