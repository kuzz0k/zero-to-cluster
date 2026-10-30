# kubernetes

Учебный DevOps-проект — собственная инфраструктура на базе Proxmox и Kubernetes с автоматизацией, CI/CD, GitOps, управлением трафиком и мониторингом.

Виртуальные машины в Proxmox создаются и настраиваются через Terraform и Ansible с отдельной ноды на Raspberry Pi. На трех ВМ поднят кластер k3s (control + 2 worker), рядом стоят NFS-сервер для постоянных данных и Gitea с раннером и registry. В кластере крутится веб-приложение (React + FastAPI + PostgreSQL), трафик снаружи приходит через MetalLB и Envoy Gateway. Код собирается в Gitea Actions, а в кластер попадает только через Argo CD из git. Метрики, логи и алерты — Prometheus, Loki и Alertmanager.

### Технологии

- **Инфраструктура:** Proxmox VE, Terraform, Ansible, Ubuntu 22.04 cloud-init
- **Kubernetes:** k3s, Helm, Kustomize, NFS subdir external provisioner
- **Сеть:** MetalLB, Gateway API, Envoy Gateway
- **CI/CD и GitOps:** Gitea, Gitea Actions, Gitea container registry, Argo CD
- **Приложение:** React, Redux Toolkit, Vite, Tailwind; FastAPI, SQLAlchemy, Alembic; PostgreSQL 16
- **Мониторинг:** kube-prometheus-stack (Prometheus, Grafana, Alertmanager), Loki, Grafana Alloy, Telegram через proxy на Cloudflare Worker
- **Локальная разработка:** Docker Compose (приложение + Prometheus и Grafana)

### Документация

Для каждой части есть описание архитектуры и инструкция по установке.

- **Инфраструктура** — Proxmox, Terraform, Ansible
  [архитектура](docs/architecture-overview/Infra.md)
- **Kubernetes** — кластер, приложение, хранение данных, ресурсы и RBAC
  [архитектура](docs/architecture-overview/Kubernetes.md)
- **Сеть** — MetalLB, Envoy Gateway, TLS
  [архитектура](docs/architecture-overview/Network.md)
- **CI/CD и GitOps** — Gitea, раннер, registry, Argo CD
  [архитектура](docs/architecture-overview/CICD%20и%20GitOps.md)
- **Мониторинг** — метрики, логи, алерты
  [архитектура](docs/architecture-overview/Monitoring.md)

Исходники draw.io лежат в `docs/diagrams`

### Порядок установки

1. [Infra](docs/setup/Infra.md) — ВМ в Proxmox, Gitea, NFS-сервер, k3s
2. [Kubernetes](docs/setup/Kubernetes.md) — nfs-provisioner, Postgres, namespace приложения, ограничения
3. [Network](docs/setup/Network.md) — Envoy Gateway, сертификаты, MetalLB
4. [CI/CD и GitOps](docs/setup/CICD%20и%20GitOps.md) — registry, раннер, репозитории, Argo CD
5. [Monitoring](docs/setup/Monitoring.md) — метрики, логи, алерты


### Вкратце что где лежит

```
infra/
  terraform/ - ВМ в Proxmox
  ansible/ - Плейбуки, роли, конфиг, values
  cloudflare/ - Cloudflare Worker — прокси до Telegram API для алертов
frontend/
backend/
app-deploy/
  argocd/ - Argo CD приложения: app, monitoring, logging
  kubernetes/manifests/
    deploy-app/ - frontend и backend
    cluster/ - платформа кластера
      network/ - Gateway, GatewayClass, EnvoyProxy, MetalLB, HTTPRoute приложения
      argocd/ - HTTPRoute для Argo CD
      psql/ - Postgres и nfs-provisioner
      restrictions/ - роли, LimitRange, ResourceQuota
      monitoring/ - values kube-prometheus-stack, алерты, дашборды
      logging/ - values Loki и Alloy
local-dev/ - Docker Compose: приложение + Prometheus и Grafana для локальной разработки
docs/
```

### Эндпоинты

- приложение — `https://app.local`
- Argo CD — `https://app.local/argocd`
- Grafana — `https://app.local/grafana`
- Gitea — `http://192.168.1.205:3000`