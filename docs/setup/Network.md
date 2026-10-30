В качестве Gateway API будет использоваться Envoy, а доступ извне будет за счет MetalLB
### Установка Envoy

[Installation](https://gateway.envoyproxy.io/docs/tasks/quickstart/#installation)

Через helm:

```
sudo snap install helm --classic
```

```
helm install eg oci://docker.io/envoyproxy/gateway-helm --version v1.9.2 -n envoy-gateway-system --create-namespace
```

Если запускать в k3s кластере, то может возникнуть ошибка, потому что helm ссылается по-умолчанию на `~/.kube/config`, а k3s ставит конфиг в `/etc/rancher/k3s/k3s.yaml`. Чтобы исправить - просто скопируем конфиг:

```
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
chmod 600 ~/.kube/config
```

### Envoy Proxy

[Envoy Proxy](https://gateway.envoyproxy.io/docs/api/extension_types/#envoyproxy)

Для каждого `Gateway` будет создаваться отдельный экземпляр прокси envoy. Конфигурация прокси происходит при помощи `kind: EnvoyProxy`. Это особенность непосредственно envoy и никакого отношения к GatewayAPI не имеет.

Конфигурацию можно привязать к `GatewayClass`. Тогда она будет распространяться на все экземпляры envoy proxy, относящиеся к этому классу. Либо делать отдельную конфигурацию для каждого экземпляра `Gateway`. Т.е. для отдельного экземпляра envoy.

В манифесте есть дополнительное логирование, а также `externalTrafficPolicy`. `externalTrafficPolicy` бывает Local и Cluster. Отличие в том, что Local направляет трафик только к тем подам, которые находятся на этой же ноде, Cluster направляет на все поды кластера.
[KubernetesServiceSpec](https://gateway.envoyproxy.io/docs/api/extension_types/#kubernetesservicespec)

Запустим сначала Proxy

```
kubectl create ns envoy
```

```
kubectl apply -f envoy-proxy.yaml
```

Далее GatewayClass

```
kubectl apply -f gatewayclass.yaml
```

### Gateway

Перед тем как создать gateway и httproute, нужно создать сертификаты

Для того чтобы добавить HTTPS необходимо:
1. Создать сертификаты
2. Создать HTTPRoute для https

##### Создание сертификатов

```
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=testnginx.local"
```

Далее нужно создать secret с этими сертификатами

```
kubectl create secret tls local-selfsigned-tls \
  --cert=tls.crt --key=tls.key \
  --namespace envoy
```


В gateway необходимо создать два слушателя для http и https:

```
kubectl apply -f gateway.yaml
```

Также для приложения создадим httproute с http и https, где `/api` будет перенаправлять трафик на бэк, а `/` на фронт. При этом надо еще создать отдельные правила для /docs, /api и прочего

```
kubectl apply -f HTTPRoute.yaml
```

Проверим, что всё поднялось:

```
kubectl describe gateway envoy -n envoy
kubectl describe gatewayclass eg
```

Так как envoy не может найти внешние адреса, то будет ошибка `AddressNotAssigned`:

```
No addresses have been assigned to the Gateway
```

Так как кластер домашний, у нас нет облачного LoadBalancer, который мог бы выдать внешний ip, поэтому можно либо пробросить порты, либо использовать MetalLB, либо поставить NodePort. Для быстрой проверки посмотрим:

```
root@control:~/manifests/network# kubectl -n envoy-gateway-system get svc

NAME                         TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)                                            AGE

envoy-envoy-envoy-b8ce7232   LoadBalancer   10.43.150.253   <pending>     80:30769/TCP,443:32254/TCP                         10m

envoy-gateway                ClusterIP      10.43.22.186    <none>        18000/TCP,18001/TCP,18002/TCP,19001/TCP,9443/TCP   15m
```

Kubernetes, несмотря на `pending` у LoadBalancer, **уже назначил NodePort**для этого сервиса, поэтому можно напрямую обратиться через ip ноды:

```
curl -k -H "Host: app.local" https://192.168.1.203:32254/
```
### Установка MetalLB

[MetalLB](https://metallb.io/installation/)

Если необходимо нужно включить strict APR для kube-proxy

Далее просто запускаем манифест из документации

```
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.16.1/config/manifests/metallb-frr-k8s.yaml
```

Дожидаемся, пока все поды поднимутся:

```
kubectl get pods -n metallb-system
```

И создаем пулл адресов

```
kubectl apply -f mlb.yaml
```

Чтобы посмотреть какой адрес является входным взглянем на сервис, который привязан к поду контроллера

```
root@control:~/manifests/network# kubectl -n envoy-gateway-system get svc

NAME                         TYPE           CLUSTER-IP      EXTERNAL-IP     PORT(S)                                            AGE

envoy-envoy-envoy-b8ce7232   LoadBalancer   10.43.150.253   192.168.1.181   80:30769/TCP,443:32254/TCP                         18m

envoy-gateway                ClusterIP      10.43.22.186    <none>          18000/TCP,18001/TCP,18002/TCP,19001/TCP,9443/TCP   23m
```

Заметим, что metallb выдал `192.168.1.181` адрес, чтобы проверить работоспособность необходимо либо создать в /etc/hosts днс запись с ip и именем, которые мы задавали в HTTPRoute. Или же можно использовать curl:

```
curl -I -H "Host: app.local" http://192.168.1.181
```
