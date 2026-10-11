Все плейбуки и сам terraform запускается с промежуточной ноды на Raspberry Pi, на ней предварительно были установлены ansible, git и terraform

![infra.png|579](../images/infra.png)
# Создание ВМ при помощи Terraform

В качестве провайдера используется `bpg/proxmox`.

Создание виртуальных машин происходит из шаблона, который уже должен быть в Proxmox, у меня это Ubuntu-22-cloudinit. Также для того, чтобы к ВМ был доступ сразу по ключам необходимо создать ключ для ssh, при создании он будет копироваться на машину, и к ней можно будет подключиться без пароля. 

```
ssh-keygen -t ed25519
```

Переменные для ВМ в terraform.tfvars

```
pm_api_url          = "https://192.168.1.77:8006/api2/json"
pm_api_token_id     = "terrauser@pve!mytoken"
pm_api_token_secret = "ur-token"

virtual_machines = {
  "control"   = { id = 201, cores = 2, memory = 3072, size = 10, ip = "192.168.1.201/24" }
  "worker1"  = { id = 202, cores = 2, memory = 3072, size = 10, ip = "192.168.1.202/24" }
  "worker2" = { id = 203, cores = 2, memory = 3072, size = 10, ip = "192.168.1.203/24" }
  "nfs-server" = { id = 204, cores = 2, memory = 1042, size = 50, ip = "192.168.1.204/24" }
  "gitea" = { id = 205, cores = 4, memory = 4092, size = 20, ip = "192.168.1.205/24" }
}
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

### Config

ansible.cfg классический на оптимизацию плейбуков и сбор логов, за исключением `host_key_checking = False`. **Так лучше не делать**, поскольку отключается проверка SSH host key, но в рамках домашнего сервера удобно.

```
[defaults]
host_key_checking = False
forks = 20 # до 20 хостов могут обрабатываться параллельно.
gathering = smart # кеширует facts, поэтому при повторных запусках не собирает их заново без необходимости.
gathering_facts = true
fact_caching = jsonfile
fact_caching_connection = /var/cache/ansible/facts
log_path = /var/log/ansible.log
roles_path = roles
interpreter_python = auto # Ansible сам ищет подходящий Python на хосте.
library = library

[connection]
pipelining = True # уменьшает количество SSH-операций, ускоряет playbook.

[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=300s -o ConnectTimeout=30 # переиспользует SSH-соединение в течение 5 минут

[privilege_escalation]
become = True
become_method = sudo
become_user = root
become_ask_pass = False
```

### Hosts.ini

Пользователь и host задается на прошлом этапе при конфигурации виртуальных машин, они должны совпадать, чтобы ansible мог к ним подключиться. 

```
[control]
control ansible_host=192.168.1.201 ansible_user=ubuntu

[workers]
worker1 ansible_host=192.168.1.202 ansible_user=ubuntu
worker2 ansible_host=192.168.1.203 ansible_user=ubuntu

[nfs]
nfs-server ansible_host=192.168.1.204 ansible_user=ubuntu

[gitea]
gitea ansible_host=192.168.1.205 ansible_user=ubuntu
```

Чтобы не переписывать инвентарь с каждым изменением terraform state, его можно автоматически подтягивать от туда
Для этого надо установить

```
ansible-galaxy collection install cloud.terraform
```
И в инвентаре создать:

```
hosts.terraform.yml
plugin: cloud.terraform.terraform_provider
project_path: ../terraform/
```
После этого плейбуки запускаем 

```
ansible-playbook -i inventory/hosts.terraform.yml playbooks/db-server-configuration.yml
```


Также для этого надо в самом terraform прописать что именно будет записываться в state

```
resource "ansible_host" "db" {
  name   = var.vm_name
  groups = ["db_servers"]

  variables = {
    ansible_host                 = var.vm_ip
    ansible_user                 = var.vm_user
    ansible_ssh_private_key_file = "~/.ssh/id_rsa"
  }

  depends_on = [proxmox_virtual_environment_vm.nodes]
}
```
### Gitea

Основные переменные лежат в `inventory/group_vars/gitea/main.yml`, при необходимости их можно изменить, они влияют на Jinja темплейт для docker-compose

По сути своей плейбук устанавливает docker, копирует docker-compose с уже вставленными переменными и запускает его

```
ansible % ansible-playbook -i inventory/hosts.ini playbooks/setup-gitea.yml
```

После этого в консоль выведется url, на котором будет gitea:

```
"msg": "Gitea is available at: http://192.168.1.205:3000/"
```

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
