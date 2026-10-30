### Gitea

При первом открытии появится настройка gitea. Создаем пользователя, первый созданный пользователь будет админом.
### registry

Чтобы использовать registry необходимо создать токен и выдать read и write для **`package:

Settings → Applications → Manage Access Tokens

Далее необходимо добавить переменные в Gitea Secrets:

Settings → Actions → Secrets

Добавляем
- REGISTRY_HOST - 192.168.1.205:3000
- REGISTRY_USER - user
- REGISTRY_PASSWORD - 80ba0a49916203724bd1c063d4437a15312cd520 (тот самый токен для registry)
### runner

Runner в рамках домашней лабы будет запускаться на той же машине, что и сам gitea. Для работы раннера ему также нужен токен, получим его:

Settings → Actions → Runners → Registration Token

При необходимости можно изменить значения в inventory/group_vars/gitea/

После этого этот токен нужно положить в ansible-vault и запустить плейбук:

```
ansible-vault create inventory/group_vars/gitea/vault.yml
```

Внутрь кладем:

```
vault_gitea_runner_token: mC8hXyCMA005AIzzuCxFxOAIdU5s3YlxsUUzdDXm
```

Запускаем плейбук, введя пароль от vault:

```
ansible-playbook -i inventory/hosts.ini playbooks/setup-runner.yml --ask-vault-pass
```
### Frontend

Создадим репу и запушим туда приложение. Также для билда нам нужно указать VITE_API_URL в variables:

Settings → Actions → Variables

- VITE_API_URL - https://your-domain/api/v1

Если в репе нет вкладки Actions, то надо включить напрямую для репозитория:

settings → Advanced Settings → Actions

После запуска одного билда, образ окажется в registry, его можно найти /user1 в packages

### Backend

Также создаем репу, пушим туда приложение, секреты уже есть (мы их создавали на уровне юзера). Не забываем включить Actions в настройках репозитория

### Cluster Platform repo

Создадим репу для хранения манифестов кластера, далее в этой репе раннер будет изменять теги в образах приложения, а ArgoCD будет следить за изменениями.

### Настройка ArgoCD

[Документация](https://argo-cd.readthedocs.io/en/stable/)

Установим:

```
kubectl create namespace argocd 
kubectl apply -n argocd --server-side --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Чтобы ArgoCD вывести сразу наружу нам надо создать для него отдельный HTTPRoute и убрать https у ArgoCD, так как после Gateway трафик внутри кластера идет по http. Для начала исправим ConfigMap и перезапустим под:

```
kubectl -n argocd edit cm argocd-cmd-params-cm
```

В открывшемся YAML дописываете в `data`:

```
data:
  server.insecure: "true"
  server.basehref: /argocd
  server.rootpath: /argocd
```

Перезапускаем под:

```
kubectl -n argocd rollout restart deploy argocd-server
```

Далее необходимо принять новый HTTPRoute для ArgoCD:

```
kubectl apply -f argocdHTTPRoute.yaml
```

Проверим, чтобы поднялись все поды argocd:

```
kubectl -n argocd get pods
```

Возможна проблема с redis и пулом слоев для образа, чтобы этого избежать подключим зеркало:

```
sudo k3s crictl pull mirror.gcr.io/library/redis:8.2.3-alpine
sudo kubectl -n argocd set image deploy/argocd-redis redis=mirror.gcr.io/library/redis:8.2.3-alpine
sudo kubectl -n argocd rollout status deploy argocd-redis
sudo kubectl -n argocd rollout restart deploy argocd-server
```
##### Пользователь

При первом запуске будет создан пользователь `admin` с паролем из секрета:

```
sudo kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
```

Далее заходим с этим паролем в UI, меняем его и удаляем секрет:

```
sudo kubectl -n argocd delete secret argocd-initial-admin-secret
```

##### Создание своего пользователя

Локальные пользователи заводятся в ConfigMap `argocd-cm`:

```
sudo kubectl -n argocd edit cm argocd-cm
```

```
data:
  accounts.ubuntu: login, apiKey   # login — вход в UI, apiKey — токены для CI
```

Пароль новому пользователю задаёт admin, указывая свой текущий пароль:

```
argocd account update-password --account ubuntu --current-password <пароль admin> --new-password <новый>
```

Права задаются в `argocd-rbac-cm`. Без них у нового пользователя нет прав, если не задана `policy.default`.

```
sudo kubectl -n argocd edit cm argocd-rbac-cm
```

```
data:
  policy.default: role:readonly
  policy.csv: |
    g, ubuntu, role:admin
```

Встроенные роли — `role:admin` и `role:readonly`. Можно описывать свои правила, например `p, ubuntu, applications, sync, default/*, allow`. Когда у вас появится свой пользователь с `role:admin`, admin можно отключить, добавив в `argocd-cm` строку `admin.enabled: "false"`.

### Подключение репозитория с манифестами

Публичный репозиторий подключать не нужно, указывается лишь url, для приватного необходимо создать секрет (или в веб settings/repositories). По HTTPS с токеном (GitHub PAT, GitLab deploy token):

```
apiVersion: v1
kind: Secret
metadata:
  name: repo-app
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://github.com/<user>/<repo>.git
  username: user
  password: 80ba0a49916203724bd1c063d4437a15312cd520
```

По SSH с deploy key (публичную часть добавьте в настройки репозитория, достаточно read-only):

```
stringData:
  type: git
  url: git@github.com:<user>/<repo>.git
  sshPrivateKey: |
    -----BEGIN OPENSSH PRIVATE KEY-----
    ...
    -----END OPENSSH PRIVATE KEY-----
```

### Application: что и куда деплоить

```
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app
  namespace: argocd
spec:
  destination:
    namespace: app
    server: https://kubernetes.default.svc
  sources:
    - path: backend
      repoURL: http://192.168.1.205:3000/user1/cluster-platform-repo.git
      targetRevision: main
    - path: frontend
      repoURL: http://192.168.1.205:3000/user1/cluster-platform-repo.git
      targetRevision: main
  project: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

path: app - папка с манифестами в репозитории
prune: true - удалять из кластера то, что удалили из git
selfHeal: true - откатывать ручные правки в кластере

Дальше этот манифест либо принимаем руками:

```
kubectl apply -f application.yaml
```

Либо в NEW APP сверху справа EDIT AS YAML

После этого Argo CD следит за веткой `main` и сам применяет изменения: пушите манифесты в git, и через несколько минут (или сразу по кнопке Refresh) они появятся в кластере.

### Подключение ArgoCD к CI и runner

Для начала нужно создать токен, чтобы раннер мог изменять репозиторий с манифестами

##### тег фронта отдельным полем

В папке `frontend/` репозитория `cluster-platform-repo` добавьте `kustomization.yaml`. Argo CD определит Kustomize автоматически.

```
resources:
  - deployment.yaml
  # ...все остальные файлы из папки

images:
  - name: 192.168.1.205:3000/user1/frontend
    newTag: "1.0.1"
```

В `deployment.yaml` при этом можно оставить любой тег: Kustomize подменит его на `newTag`. Теперь CI правит одну строку и не трогает сам Deployment.

##### токен для пуша

В Gitea создайте токен с правом записи в `cluster-platform-repo` (Settings → Applications → Access Token, scope `write:repository`). Лучше отдельным пользователем-ботом, чтобы в истории было видно, какие коммиты сделал CI. Добавьте его в секреты репозитория фронта как `MANIFESTS_TOKEN`.

При желании интервал можно поменять:

```
kubectl -n argocd edit cm argocd-cm
```

```
data:
  timeout.reconciliation: 60s
```

##### Webhook

Argo CD опрашивает git раз в 3 минуты. Чтобы выкатка шла сразу после пуша, настройте в Gitea webhook на `https://app.local/argocd/api/webhook` (тип Gitea, событие push). Учтите: Gitea должна доверять вашему самоподписанному сертификату, или в настройках webhook нужно отключить проверку SSL.

##### Что нужно настроить в Gitea, иначе webhook не дойдёт

**1. Gitea должна знать, где `app.local`.** Gateway маршрутизирует по имени хоста, поэтому адрес по IP не подойдёт. На машине с Gitea (или в контейнере, если Gitea в Docker) добавьте в `/etc/hosts`:

```
192.168.1.181  app.local
```

**2. Разрешить webhook'и в локальную сеть и отключить проверку самоподписанного сертификата.** По умолчанию Gitea запрещает отправку webhook на приватные адреса. В `app.ini` добавьте:

```ini
[webhook]
ALLOWED_HOST_LIST = private
SKIP_TLS_VERIFY = true
```

После этого перезапустить Gitea.

### Проверка ресурсов с аннотациями от Argo CD

```
kubectl -n app get deploy -o custom-columns='NAME:.metadata.name,ARGO:.metadata.annotations.argocd\.argoproj\.io/tracking-id'
```