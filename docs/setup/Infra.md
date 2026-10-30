# Создание ВМ при помощи Terraform

Для того, чтобы к ВМ был доступ сразу по ключам необходимо создать ключ для ssh, при создании он будет копироваться на машину, и к ней можно будет подключиться без пароля. 

```
ssh-keygen -t ed25519
```

Инициализируем, смотрим план и применяем:

```
terraform init
terraform plan
terraform apply
```

! **tfstate не должен выходить наружу** - там хранятся все пароли и ключи

Если нужно будет удалить:

```
terraform destroy
```

# Настройка через Ansible

### Gitea

Основные переменные лежат в `inventory/group_vars/gitea/main.yml`, при необходимости их можно изменить, они влияют на Jinja темплейт для docker-compose

По сути своей плейбук устанавливает docker, копирует docker-compose с уже вставленными переменными и запускает его

```
ansible-playbook -i inventory/hosts.ini playbooks/setup-gitea.yml
```

После этого в консоль выведется url, на котором будет gitea:

```
"msg": "Gitea is available at: http://192.168.1.205:3000/"
```

Далее нужно будет настроить сам gitea, runner, создать секреты, переменные, токены.

[[PVE-GiteOps-Lab/setup/CICD и GitOps]]
### NFS server

Нужен для последующего использования NFS provisioner контроллера, который будет создавать и удалять PV

```
ansible-playbook -i inventory/hosts.ini playbooks/setup-nfs-server.yml
```

### k3s

В качестве кластера используется k3s, потому что он легче и подходит в рамках проекта

```
ansible % ansible-playbook -i inventory/hosts.ini playbooks/install-k3s.yml
```

После настройки нод проверим, что они все доступны и подключились, зайдя на одну из нод:

```
kubectl get nodes
```

```
NAME      STATUS   ROLES           AGE     VERSION
control   Ready    control-plane   6m43s   v1.36.5+k3s1
worker1   Ready    <none>          60s     v1.36.5+k3s1
worker2   Ready    <none>          71s     v1.36.5+k3s1
```

[[PVE-GiteOps-Lab/setup/Kubernetes]]