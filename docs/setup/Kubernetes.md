### Настройка nfs-provisioner

В качестве контроллера будем использовать [nfs-provisioner](https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner) 

Все основные настройки находятся в `nfs-provisioner/deployment.yaml` в env: сервер, директория монтирования, ip. Для того чтобы deployment мог обращаться к k8s API для необходимо прописать роли и serviceAccount, без этого контроллер не сможет создавать PV и PVC

Создадим для него ns

```
kubectl create ns nfs-provisioner
```

```
kubectl -n nfs-provisioner apply -f service-account.yaml
kubectl -n nfs-provisioner apply -f rbac.yaml
kubectl -n nfs-provisioner apply -f deployment.yaml
```

Далее необходимо создать storageClass, который и будет динамически создавать PV используя nfs-provisioner

```
kubectl -n nfs-provisioner apply -f storageClass.yaml
```

```
kubectl get storageclasses
```

##### Диагностика 

Проверка, что сам provisioner запустился

```
kubectl -n nfs-provisioner get all
kubectl -n nfs-provisioner get sa

kubectl -n nfs-provisioner get pods
kubectl -n nfs-provisioner describe deploy nfs-client-provisioner

kubectl -n nfs-provisioner get role,rolebinding

kubectl get storageclass
```

Если возникли проблемы, они описываются в `describe`, после изменения необходимо перезапустить deployment:

```
kubectl -n nfs-provisioner rollout restart deploy nfs-client-provisioner
```
### Поднятие Postgres

БД будет создаваться в обычном statefulSet с одной репликой (для тестов, далее для отказоустойчивости можно развернуть Bitnami или другой оператор для репликации бд), вместе с ним создается обязательный headless сервис и type: ClusterIp для удобства. Пароль для БД хранится в Secret.

Для начала создадим ns и секрет в нем

```
kubectl create ns psql
```

```
kubectl -n psql apply -f secret.yaml
```

Применим манифест

```
kubectl -n psql apply -f statefulSet.yaml
```

##### Диагностика

```
kubectl -n psql get all
kubectl -n psql get pvc,pv

kubectl -n psql describe pod psql-0
```

Если PVC не биндится — сразу смотреть provisioner

```
kubectl -n nfs-provisioner logs deploy/nfs-client-provisioner
```

### Проверка, что всё поднялось

```
kubectl -n psql get pods,pvc
kubectl -n psql get pod psql-0 -o wide
```

```
kubectl -n psql exec -it psql-0 -- psql -U postgres -c "\l"
```

### DNS

К БД доступ идет не напрямую через ip, а через dns внутри кластера

```
psql.app.svc.cluster.local
```

Проверить можно, создав временный контейнер:

```
kubectl -n app run -it --rm dnsutils --image=registry.k8s.io/e2e-test-images/jessie-dnsutils:1.3 -- sh


nslookup psql.app.svc.cluster.local
```

# Приложение

Для фронта и бэка создадим отдельный ns:

```
kubectl create ns app
```

Чтобы можно было спулить образы, необходимо создать секрет с кредами от пользователя, у которого есть доступ к registy:

```
kubectl create secret docker-registry gitea-registry-creds \
  --docker-server=192.168.1.205:3000 \
  --docker-username=user1 \
  --docker-password=80ba0a49916203724bd1c063d4437a15312cd520 \
  --namespace=app
```

Также в рамках лабы gitea работает на http. Каждая нода кластера должна знать, что этот реестр — insecure. Иначе pods зависнут в `ImagePullBackOff`. Чтобы этого избежать надо прописать `/etc/rancher/k3s/registries.yaml`:

```
mirrors:
  "192.168.1.205:3000":
    endpoint:
      - "http://192.168.1.205:3000"
```

Применим плейбук для всех нод кластера:

```
ansible-playbook -i inventory/hosts.ini playbooks/allow-http-registry-k3s.yml 
```

### Frontend

Фронт будет запускаться в обычном deployment с двумя репликами и обычным сервисом

```
kubectl apply -f deployment.yaml
```

Сразу прокинем доступ извне

[[PVE-GiteOps-Lab/setup/Network]]
### Backend

Бэк также запускается в deployment, но уже с одной репликой, чтобы проще было сделать миграцию БД через init-контейнер. С несколькими репликами пришлось бы делать Job и ждать пока он завершится

Перед созданием пода, необходимо создать секрет с адресом БД:

```
kubectl apply -f secret.yaml
```

```
kubectl apply -f deployment.yaml
```

# Ограничения 

### Роли

В рамках изоляции разработки добавим роли, ограничения по ресурсам, дефолтные значения для объектов.

У нас уже есть обычный пользователь `ubuntu`, ограничим его права в рамках ns app и psql. Чтобы не усложнять Role, воспользуемся уже готовой `edit`. Она ограничивает доступ к другим ns, но важно помнить, что у пользователя всё равно будет доступ к Network Policy:

```
kubectl apply -f dev-edit-app-role.yaml
```

Если всё-таки необходимо жестко ограничить разработчика, то написать свою роль и в ней добавить ограничения на Network Policy. Также создадим роль для psql и ограничим удаление, exec (чтобы нельзя было удалить бд внутри), secrets, svc (чтобы не сломать dns). Чтобы роли были глобальны а не для отдельного ns создадим их через ClusterRole, в дальнейшем их можно будет привязать к другим ns

```
kubectl apply -f dev-app-role.yaml
```

Далее зададим дефолтные значения и лимиты по ресурсам и внутренним объектам для ns app:

```
kubectl apply -f limitrange.yaml
kubectl apply -f resources.yaml
```

### Сертификат для пользователя

Но если просто зайти под ubuntu на control ноду, ничего не изменится, и у пользователя всё равно не будет прав в кластере. Чтобы появились права, нужно выпустить такой сертификат и собрать для `ubuntu` отдельный kubeconfig.

Ключ и запрос на сертификат (под ubuntu):

```
mkdir -p ~/.kube && cd ~/.kube
openssl genrsa -out ubuntu.key 2048
openssl req -new -key ubuntu.key -out ubuntu.csr -subj "/CN=ubuntu/O=dev"
```

Подписать через API кластера (под админом, через sudo):

```
cat <<EOF | sudo kubectl apply -f -
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: ubuntu
spec:
  request: $(base64 -w0 ~/.kube/ubuntu.csr)
  signerName: kubernetes.io/kube-apiserver-client
  expirationSeconds: 31536000   # 1 год
  usages: ["client auth"]
EOF

sudo kubectl certificate approve ubuntu
sudo kubectl get csr ubuntu -o jsonpath='{.status.certificate}' | base64 -d > ~/.kube/ubuntu.crt
```

Собрать kubeconfig для ubuntu:

```
cd ~/.kube
sudo kubectl config view --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d > ca.crt

export KUBECONFIG=~/.kube/config
kubectl config set-cluster k3s --server=https://127.0.0.1:6443 \
  --certificate-authority=ca.crt --embed-certs=true
kubectl config set-credentials ubuntu \
  --client-certificate=ubuntu.crt --client-key=ubuntu.key --embed-certs=true
kubectl config set-context ubuntu@k3s --cluster=k3s --user=ubuntu --namespace=app
kubectl config use-context ubuntu@k3s
chmod 600 ~/.kube/config

echo 'export KUBECONFIG=$HOME/.kube/config' >> ~/.bashrc
```

