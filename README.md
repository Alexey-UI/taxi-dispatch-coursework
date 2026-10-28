# Тактика — автоматическое распределение заказов такси

Учебная система на Go и JavaScript: ближайший подходящий водитель, предложения с тайм-аутом, отказы и повторные назначения. Расширенная карта с движением только по дорогам, масштабированием и полноэкранным режимом, пассажир, водитель, диспетчер и публичный наблюдатель. Реальные поездки и платежи не выполняются.

## Быстрый запуск — Mac, Windows, Linux

Нужны Docker с Compose и Node.js 24. На Windows включите Linux containers в Docker Desktop; команды выполняются в PowerShell из каталога проекта.

```sh
node scripts/setup.mjs
docker compose up -d --build --wait
```

Откройте **http://localhost:8088**. Просмотр доступен сразу; «Создать заказ» создаёт гостевую сессию. Для запуска симуляции нажмите «Наблюдатель», выберите «Диспетчер» и введите `DEMO_PASSWORD` из локального `.env`. Файл генерируется автоматически и не публикуется. Для ручной работы водителя приостановите симуляцию и войдите с ролью «Водитель».

```sh
docker compose logs -f --tail=100 api dispatcher simulator
node scripts/smoke.mjs
docker compose down
```

`down` сохраняет PostgreSQL. Опция `down -v` удаляет данные и для обычной остановки не нужна.

## Kubernetes

Нужны k3d, kubectl и Helm. Создаётся отдельный локальный кластер из одного управляющего и двух рабочих узлов.

```sh
k3d cluster create --config deploy/k3d.yaml
k3d image import taxi-app:local taxi-web:local taxi-simulator:local -c taxi
```

Получите kubeconfig командой `k3d kubeconfig write taxi` и задайте `KUBECONFIG` к возвращённому пути. Bash: `export KUBECONFIG="$(k3d kubeconfig write taxi)"`; PowerShell: `$env:KUBECONFIG = k3d kubeconfig write taxi`.

```sh
kubectl create namespace taxi
node scripts/kube-secret.mjs | kubectl apply -f -
helm upgrade --install taxi deploy/helm/taxi -n taxi --wait --timeout 180s
kubectl get pods -n taxi -o wide
```

Откройте **http://taxi.localhost:8089**. Если ОС не разрешает имя, добавьте `127.0.0.1 taxi.localhost` в hosts либо используйте `kubectl port-forward -n taxi svc/web 8090:8080` и http://localhost:8090.

## Устройство и проверка

Шесть компонентов Compose: Nginx/web, Go API, Go dispatcher, Node.js simulator, PostgreSQL, Redis. В Kubernetes API, web и dispatcher имеют по две реплики. PostgreSQL хранит заказы и события; Redis передаёт ограниченные уведомления о новой работе. При его отказе dispatcher продолжает сканирование БД.

```sh
go vet ./...
go test -race ./...
node --test simulator/*.test.mjs
helm lint deploy/helm/taxi
```

GitHub Actions выполняет проверки, разворачивает Compose и временный Kubernetes-кластер, запускает интеграционные сценарии и публикует многоархитектурные образы в GHCR с тегом commit SHA. Облачные ресурсы автоматически не создаются.

Документация: [архитектура](docs/architecture.md), [эксплуатация](docs/operations.md), [подготовка облака и HTTPS](docs/cloud.md), [результаты проверок](docs/validation.md), [требования](docs/requirements.md). Учебные материалы хранятся отдельно от репозитория по указанию автора.

## Ограничения

Город схематичный: регулярная уличная сеть 200×140 единиц. Учитывается кратчайшее расстояние по её дорогам; реальная география, одностороннее движение и пробки не моделируются. Участие демонстрационное, публичная БД требует периодической очистки/архивации. PostgreSQL одиночный; local-path PVC привязан к узлу. Реплики приложений обеспечивают восстановление процессов, но не высокую доступность БД или единственной облачной ВМ. Доступ диспетчера и водителей использует общий демонстрационный пароль; не применяйте эту модель для настоящей службы такси.
