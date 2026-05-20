# GuardUs · Kubernetes

EKS `guardus-eks-v2` (ap-northeast-2 b/d) prod 운영 중. ArgoCD GitOps, Kustomize overlay.

## 디렉토리

```
k8s/
├── bootstrap/
│   ├── argocd-install.yaml      # ArgoCD core (수동 1회 적용)
│   └── app-of-apps-v2.yaml      # ArgoCD 가 다른 모든 app 관리
│
├── platform-v2/                 # v2 cluster 전용 platform Application 정의
│   └── argocd-ingress/           # argocd.viewus.co ALB Ingress
│
├── platform/                    # platform 컴포넌트 helm values
│   ├── kube-prometheus-stack/   # Prometheus + Grafana + Alertmanager
│   │   └── dashboards/          # ConfigMap 으로 Grafana 자동 import
│   ├── loki/                    # Loki (S3 backend)
│   ├── alloy/                   # 로그 수집 → Loki
│   ├── cert-manager/
│   ├── external-secrets/
│   └── argocd-image-updater/
│
├── base/                        # 앱 공통 매니페스트
│   ├── namespace.yaml
│   ├── admin-api/
│   ├── internal-api/
│   ├── openresty/
│   ├── frontend/
│   ├── ingress/
│   └── kustomization.yaml
│
└── overlays/
    ├── dev/                     # guardus-dev namespace (CI 자동 SHA bump)
    └── prod-v2/                 # guardus namespace (수동 promote)
```

## 컴포넌트 통신

```
ALB (group=guardus-shared-v2)
  ├── host=guardus-admin.viewus.co           → frontend (admin SPA)
  ├── host=guardus-admin-dev.viewus.co       → frontend (dev)
  ├── host=argocd.viewus.co                  → argocd-server
  └── host=* (catchall, group.order=1000)    → openresty
                                                 ├── /admin/*, /me/*, /auth/*  → admin-api
                                                 ├── /internal/*               → internal-api
                                                 └── (그 외 채널 host)         → 외부 origin
```

채널 등록은 admin UI 에서. K8s Ingress 변경 없음 (`ingress-catchall.yaml` 이 모든 host 수신).

## 환경별 차이

| 항목 | dev | prod-v2 |
|---|---|---|
| Namespace | `guardus-dev` | `guardus` |
| Host | `guardus-admin-dev.viewus.co` | `guardus-admin.viewus.co` + 채널 도메인 catchall |
| RDS | `guardus-prod-pg-dev` (t4g.micro) | `guardus-prod-pg-v2` |
| Redis | `guardus-prod-redis-dev` (t4g.micro) | `guardus-prod-redis-v2` |
| Replicas | admin/internal-api 1, frontend 1, openresty 1 | admin 2, internal 2, frontend 2, openresty 3+ (HPA) |
| CI 동작 | 컴포넌트 변경 시 newTag 자동 bump | newTag 수동 변경 (dev → prod promote) |

## ArgoCD app 목록

```
app-of-apps                  → 자기 자신 + 모든 platform / guardus app
platform 부류:
  alloy
  argocd-ingress
  aws-load-balancer-controller
  cert-manager
  external-secrets
  karpenter
  kube-prometheus-stack
  loki
  argocd-image-updater
guardus 앱:
  guardus-dev                → overlays/dev
  guardus-prod-v2            → overlays/prod-v2
```

## 일상 운영

```bash
# Pod 상태
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded

# ArgoCD app 상태
kubectl get application -n argocd

# dev 배포 (자동) — 코드 push 후 CI 가 dev overlay 의 newTag bump
git push origin main

# prod promote — 변경된 컴포넌트만 prod-v2 의 newTag 를 dev SHA 로 변경
$EDITOR k8s/overlays/prod-v2/kustomization.yaml
git commit -am 'chore(prod-v2): promote X' && git push

# 로그
kubectl logs -n guardus -l app.kubernetes.io/name=openresty --tail=200
# 또는 Grafana → Explore → Loki: {namespace="guardus", app="openresty"}
```

## 핵심 운영 규칙

1. **prod 직접 mutation 금지** — 모든 변경은 git → ArgoCD 경유
2. **ingress catchall + admin Ingress 분리** — 채널은 admin UI 로만 등록 (K8s manifest 안 건드림)
3. **`group.name=guardus-shared-v2` 변경 금지** — ALB hostname 재생성 사고 위험
4. **PVC AZ 의존** — node AZ 와 PV AZ 일치해야 schedule. PVC 가 2b 인데 2b 노드 부족 시 pending.
5. **EKS cluster subnet 변경 불가** — 생성 후 AZ 집합 변경 시 InvalidParameterException. control plane IP 부족 시 cluster 재생성 외 방법 없음.
