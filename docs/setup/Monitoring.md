
kube-prometheus-stack (Prometheus Operator, Prometheus, Grafana, node-exporter, kube-state-metrics) в namespace `monitoring`, ставится через Argo CD. Как всё устроено — в [architecture.md](architecture.md).

Файлы:

- `app-deploy/kubernetes/manifests/cluster/monitoring/values.yaml` — values для Helm-чарта
- `app-deploy/kubernetes/manifests/cluster/monitoring/extras/` — namespace, HTTPRoute для Grafana, ServiceMonitor бэкенда, PodMonitor Envoy, свои дашборды
- `app-deploy/argocd/monitoring-app.yaml` — Argo CD Application (чарт + values + extras)
- `app-deploy/kubernetes/manifests/cluster/network/clientTrafficPolicy.yaml` — фикс путей в Envoy Gateway для Argo CD UI

### Перед установкой

**Память.** Стек занимает ~1–1.5 GB. На control-ноде с 3 GB вместе с k3s и Argo CD память кончилась (`available` ~120 MB, swap нет), API-сервер перестал отвечать (`TLS handshake timeout`). Поэтому:

- control-нода поднята до 4096 MB (`infra/terraform/terraform.tfvars`)
- Prometheus, Grafana, оператор и kube-state-metrics в `values.yaml` запрещено ставить на control-plane (nodeAffinity), они едут на worker1/worker2. На control остается только node-exporter

Проверить, что на нодах есть место:

```
kubectl top nodes
```

**Envoy Gateway.** По умолчанию Envoy Gateway декодирует `%2F` обратно в `/`, склеивает `//` в `/` и редиректит. Argo CD UI передает URL репозитория прямо в пути (`/api/v1/repositories/https%3A%2F%2F.../helmcharts`), поэтому после такой нормализации получает 404 при создании приложения. Применяем политику, которая оставляет путь как есть:

```
kubectl apply -f clientTrafficPolicy.yaml
```

**Репозиторий.** Argo CD берет `values.yaml` и `extras/` из Gitea (`cluster-platform-repo`), а не из GitHub, поэтому папка `monitoring/` должна лежать в корне этой репы и быть запушена до создания приложения. Сам репозиторий должен быть добавлен в Argo CD (Settings → Repositories), как и для `app`.

### Установка

Namespace и секрет с логином Grafana. Секрет в git не хранится, создается руками:

```
kubectl create namespace monitoring
kubectl -n monitoring create secret generic grafana-admin \
--from-literal=admin-user=admin \
--from-literal=admin-password='admin'
```

Если секрет создать после приложения, Grafana будет в `CreateContainerConfigError`, пока секрет не появится.

Создаем Argo CD Application, дальше он сам ставит Helm-чарт и подтягивает values и `extras` из репы. Два равнозначных способа:

- Argo CD UI → NEW APP → EDIT AS YAML, вставляем `monitoring-app.yaml`. Именно через YAML: в форме нельзя задать несколько sources и `ignoreDifferences`
- или напрямую в кластер, минуя UI:

```
kubectl apply -f monitoring-app.yaml
```

Результат одинаковый — в обоих случаях Application живет только в кластере, не в git.

При создании через UI в DevTools будет `403` на `GET /api/v1/applications/monitoring` — это нормально: так Argo CD отвечает на запрос несуществующего приложения.

Ждем, пока приложение станет `Synced` / `Healthy`. Первый запуск занимает несколько минут — ноды тянут образы.

### Проверка

```
kubectl -n argocd get application monitoring
kubectl -n monitoring get pods,pvc -o wide
```

На control-ноде должен быть только `prometheus-node-exporter`, PVC Prometheus — `Bound`

Grafana: `http://app.local/grafana` (логин из секрета `grafana-admin`). `app.local` должен резолвиться в IP Envoy Gateway из пула MetalLB.

Prometheus наружу не выставлен. Таргеты смотрим через port-forward на `http://localhost:9090/targets`:

```
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090
```

Все таргеты должны быть `UP`, в том числе `serviceMonitor/monitoring/backend` и `podMonitor/monitoring/envoy-proxy`.

### Нюансы k3s

controller-manager, scheduler, proxy и etcd в k3s встроены в один бинарник и слушают 127.0.0.1, поэтому их скрейп выключен в `values.yaml`, иначе они висели бы в Prometheus как down.

Prometheus хранит TSDB на NFS (`nfs-client`). Для лабы нормально, но в проде TSDB на NFS не рекомендуется — возможна порча данных.

### Loki

Для логов будем использовать Loki + Grafana Alloy (Promtail в EOL). Файлы:

- `app-deploy/argocd/logging-app.yaml` — Argo CD Application `logging`: чарты `loki` и `alloy` + values из Gitea
- `app-deploy/kubernetes/manifests/cluster/logging/loki-values.yaml` — Loki одним подом (SingleBinary), хранение на NFS 10Gi, 7 дней
- `app-deploy/kubernetes/manifests/cluster/logging/alloy-values.yaml` — Alloy DaemonSet и его конфиг
- datasource Loki для Grafana — в `monitoring/values.yaml` (`additionalDataSources`)
- дашборд `Logs / Kubernetes - Logs` — `extras/dashboards/k8s-logs.json`
#### Перед установкой

- приложение `monitoring` уже стоит — namespace `monitoring` создает оно
- папка `logging/` запушена в корень Gitea-репы
- на нодах есть место: Loki ~256–768Mi памяти на одном воркере, Alloy до 256Mi на каждой ноде

**Диск.** Изначально у нод было по 10 GB, после установки Loki и Alloy на worker1 закончилось место, и kubelet начал выселять поды (`Evicted`, `The node had condition: [DiskPressure]`). Большую часть диска занимают образы контейнеров, сами логи и метрики лежат на NFS. Диски нод подняты до 20 GB (`size` в `infra/terraform/terraform.tfvars`). 
#### Установка

Через Argo CD UI (EDIT AS YAML) или консоль:

```
kubectl apply -f logging-app.yaml
```
#### Проверка

В UI Argo CD должно появиться приложение, которое должно быть синхронизировано и здорово, также проверить можно через:

```
kubectl -n argocd get application logging
kubectl -n monitoring get pods -o wide | grep -E "loki|alloy"
```

`loki-0` на воркере, `alloy-*` по одному на каждой ноде.

Loki готов и в нем есть лейблы:

```
kubectl -n monitoring port-forward svc/loki 3100
curl localhost:3100/ready
curl localhost:3100/loki/api/v1/labels
```

Если логов нет, первым делом смотрим Alloy — ошибки конфига и отправки в Loki видны там:

```
kubectl -n monitoring logs ds/alloy -c alloy --tail=50
```

У Alloy есть UI с графом компонентов, там видно, сколько файлов он читает и что отправляет:

```
kubectl -n monitoring port-forward svc/alloy 12345
```

и открыть `http://localhost:12345`. Сервис ведет на один случайный под Alloy — чтобы посмотреть конкретную ноду, port-forward на сам под (`pod/alloy-xxxxx`).


### Alert Manager

Alertmanager включен в том же kube-prometheus-stack, уведомления уходят в Telegram. Alertmanager только группирует сработавшие алерты, решает куда их отправить и как часто повторять.

##### Перед установкой

В @BotFather `/newbot` → получаем токен. Написать боту `/start` — первым бот писать не может. `chat_id` берем из `https://api.telegram.org/bot<TOKEN>/getUpdates` и прописываем в `values.yaml`.

Из сети кластера `api.telegram.org` недоступен (`dial tcp 149.154.166.110:443: connect: connection timed out`), поэтому запросы идут через свой Cloudflare Worker. Публичные «зеркала» Bot API не используем — токен идет в URL, и владелец зеркала его получит.

Cloudflare → Workers & Pages → Create → Worker `tg-proxy` → Edit code, вставить `tg-proxy-worker.js` → Deploy. Worker пропускает только `sendMessage` и `getMe` нашего бота, на все остальное отвечает 403. URL воркера прописывается в `api_url`

Проверка с ноды (403 — воркер доступен и отказал на пустой путь, так и должно быть):

```
curl -m 10 -s -o /dev/null -w "%{http_code}\n" https://tg-proxy.kuznecov00900.workers.dev/
```

```
kubectl -n monitoring create secret generic alertmanager-telegram --from-literal=bot-token='<TOKEN>'
```

##### Установка

Пушим `monitoring/values.yaml` и `monitoring/extras/` в Gitea, Argo CD сам поднимет `alertmanager-monitoring-kube-prometheus-alertmanager-0` и загрузит правила. Если для алертов values и прочие yaml были запушены раньше, они могу висеть в pending, так как не было секретов, токенов, id. Поэтому после изменений просто удаляем поды и деплойменты, Argo CD восстановит всё уже с новыми значениями.

##### Проверка

Бот, Worker и чат работают (токен берется из секрета, в историю не попадает):

```
TOKEN=$(kubectl -n monitoring get secret alertmanager-telegram -o jsonpath='{.data.bot-token}' | base64 -d)
curl -m 10 -s "https://tg-proxy.kuznecov00900.workers.dev/bot$TOKEN/sendMessage" -d chat_id=793746159 -d text=test
```

Тестовый алерт напрямую в Alertmanager:

```
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-alertmanager 9093
curl -XPOST localhost:9093/api/v2/alerts -H 'Content-Type: application/json' \
-d '[{"labels":{"alertname":"TestAlert","severity":"warning"},"annotations":{"summary":"Тестовый алерт"}}]'
```

Приходит через ~30 секунд, `resolved` — через 5 минут. Для повторного теста менять `alertname`: существующая группа отправляется заново только раз в `group_interval` (5 минут).

Проверка правила на диске — забиваем worker1 до 91% (по формуле правила, `df` покажет меньше: правило считает зарезервированные под root 5% занятыми):

```
read size avail < <(df -B1 --output=size,avail / | tail -1); fill=$(( avail - size*9/100 ))
sudo fallocate -l $fill /var/tmp/fill-disk && df -h /
```

Через минуту правило `Pending`, через 10 минут `Firing` и сообщение в Telegram. Сразу после — убрать файл:

```
sudo rm /var/tmp/fill-disk
```

Выше 95% не забивать: при свободных < 5% kubelet начинает выселять поды.

#### Если не приходит

Логи Alertmanager (токен в URL заменяем, логи с ним никуда не выкладываем):

```
kubectl -n monitoring logs alertmanager-monitoring-kube-prometheus-alertmanager-0 -c alertmanager --since=15m \
| sed -E 's/bot[0-9]+:[A-Za-z0-9_-]+/bot<REDACTED>/g' | grep -iE "notify|error"
```

- `connection timed out` до `api.telegram.org` — нет `api_url` на Worker
- `//bot...` в URL — `/` в конце `api_url`
- `Forbidden: bot can't initiate conversation` — не нажат `/start` у бота, `chat not found` — неверный `chat_id`
- `TLS handshake timeout` до `workers.dev`, хотя `curl` с ноды получает 403. Alertmanager собран на Go 1.26, а Go с 1.24 по умолчанию предлагает постквантовый обмен ключами (X25519MLKEM768). ClientHello получается больше одного пакета, и фильтр провайдера такие соединения вешает. `curl` на нодах (OpenSSL 3.0) этого не предлагает и проходит. Проверка из пода:

```
kubectl run tlstest --rm -it --restart=Never --image=curlimages/curl -- sh -c \
'U=https://tg-proxy.kuznecov00900.workers.dev/; curl -m 10 -s -o /dev/null -w "classic: %{http_code}\n" --curves X25519 $U; curl -m 10 -s -o /dev/null -w "post-quantum: %{http_code}\n" --curves X25519MLKEM768 $U'
```

`classic: 403`, `post-quantum: 000` — оно. Лечится переменной `GODEBUG=tlsmlkem=0,tlssecpmlkem=0` для контейнера `alertmanager` (`alertmanagerSpec.containers` в `values.yaml`, уже добавлено). Другие Go-сервисы (Grafana, Loki, Alloy) с тем же симптомом лечатся так же.

**Токен.** При ошибке отправки Alertmanager пишет в лог полный URL вместе с токеном. Alloy вырезает `bot<id>:<token>` перед отправкой в Loki (`stage.replace` в `alloy-values.yaml`). Если токен все же утек — `/revoke` в BotFather, обновить секрет и перезапустить под:

```
kubectl -n monitoring create secret generic alertmanager-telegram --from-literal=bot-token='<NEW_TOKEN>' --dry-run=client -o yaml | kubectl apply -f -
kubectl -n monitoring delete pod alertmanager-monitoring-kube-prometheus-alertmanager-0
```

### Проблемы, которые уже встречались

**DiskPressure и выселение подов.** Порог выселения — 5% свободного места от размера ФС. По `Threshold quantity` в событии видно реальный размер ФС: `510673313` (~487 MiB) — это 5% от ~10 GB, значит диск еще не расширен. Расширение без Terraform — Proxmox → VM → Hardware → Hard Disk → Disk Action → Resize (+10G, итог должен совпасть с `size` в `terraform.tfvars`), затем в VM:

```
echo 1 | sudo tee /sys/class/block/sda/device/rescan
sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1
df -h /
```

После снятия taint `disk-pressure` убрать выселенные поды:

```
kubectl -n monitoring delete pod --field-selector=status.phase=Failed
```

**Grafana `OOMKilled` / 2 из 3 контейнеров ready.** На лимите 384Mi Grafana 13 упиралась в `GOMEMLIMIT` и не успевала отвечать на readiness-пробу (таймаут 1s), Argo CD из-за этого показывал приложение `Progressing`. Лимит поднят до 768Mi, таймаут пробы — до 5s.

**HTTPRoute `grafana` вечно OutOfSync**, Argo CD каждые несколько минут делает self-heal. API server дописывает в `parentRefs` и `backendRefs` дефолты (`group`, `kind`, `weight`), а Argo CD сравнивает элементы списков CRD целиком. Лечится тем, что дефолты прописаны в манифесте явно. То же самое касается других HTTPRoute под Argo CD.

**`KubePodNotReady` / `KubeDaemonSetRolloutStuck` для `svclb-envoy-*`.** Встроенный в k3s ServiceLB конфликтует с MetalLB за LoadBalancer-сервис Envoy: его поды пытаются занять 80/443 на каждой ноде. Нужно ставить k3s с `--disable servicelb` (пока не исправлено).

