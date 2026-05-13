# GuardUs · Kubernetes 마이그레이션

> 현재 EC2 + Docker Compose 운영 그대로 유지. EKS 는 별도 환경으로 병행 구축.

---

## 디자인 원칙

1. **GitOps (ArgoCD)** — 클러스터 상태는 이 repo 가 source of truth. `kubectl apply` 직접 X
2. **Kustomize overlay** — `base/` 공통 + `overlays/{dev,prod}` 환경 별 패치 (helm 보다 light)
3. **Cloud-native AWS** — ALB Controller / EBS CSI / External Secrets / IRSA
4. **단일 책임 매니페스트** — 각 디렉터리 = 한 컴포넌트, kustomization.yaml 로 묶음
5. **점진적 마이그레이션** — 한 번에 한 서비스씩, EC2 운영 무중단

---

## 디렉터리 구조

```
k8s/
├── bootstrap/                 # 클러스터 부팅 (수동 1회)
│   ├── argocd-install.yaml    # ArgoCD core
│   └── app-of-apps.yaml       # ArgoCD 가 자기 자신 + 다른 앱 관리
│
├── argocd/apps/               # ArgoCD Application 정의
│   ├── platform/              # 클러스터 인프라
│   │   ├── aws-load-balancer-controller.yaml
│   │   ├── external-secrets.yaml
│   │   ├── cert-manager.yaml
│   │   └── kube-prometheus-stack.yaml
│   └── guardus/               # 우리 앱
│       ├── guardus-dev.yaml
│       └── guardus-prod.yaml
│
├── platform/                  # 플랫폼 도구 helm values
│   ├── aws-load-balancer-controller/values.yaml
│   ├── external-secrets/values.yaml
│   ├── cert-manager/values.yaml
│   └── kube-prometheus-stack/values.yaml
│
├── base/                      # 우리 앱 공통 manifest
│   ├── namespace.yaml
│   ├── admin-api/
│   ├── internal-api/
│   ├── openresty/
│   ├── frontend/
│   ├── ingress/
│   └── kustomization.yaml
│
└── overlays/
    ├── dev/                   # 개발/학습 환경 (Spot, 작은 리소스)
    │   ├── kustomization.yaml
    │   └── patches/
    └── prod/                  # 운영 환경 (HA, 큰 리소스)
        ├── kustomization.yaml
        └── patches/
```

---

## 초기 부트스트랩 절차

### 1. EKS 클러스터 생성

```bash
# eksctl 사용 — k8s/bootstrap/cluster.yaml 참조
eksctl create cluster -f k8s/bootstrap/cluster.yaml
```

### 2. ECR 레포 생성 + 이미지 푸시

```bash
# admin-api, internal-api, openresty, frontend 4개
for svc in admin-api internal-api openresty frontend; do
  aws ecr create-repository --repository-name guardus/$svc --region ap-northeast-2
done

# 빌드 + 푸시 (학습 시점에 수동 — 추후 CI/CD)
docker build -t guardus/admin-api ./admin-api
docker tag guardus/admin-api 124052247302.dkr.ecr.ap-northeast-2.amazonaws.com/guardus/admin-api:latest
docker push 124052247302.dkr.ecr.ap-northeast-2.amazonaws.com/guardus/admin-api:latest
# ... (반복)
```

### 3. ArgoCD 설치

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f k8s/bootstrap/argocd-install.yaml
# 또는 helm
```

### 4. app-of-apps 적용

```bash
kubectl apply -f k8s/bootstrap/app-of-apps.yaml
# 이후 ArgoCD 가 platform + guardus 앱 자동 동기화
```

---

## 환경별 차이

| 항목 | dev | prod |
|---|---|---|
| 노드 타입 | Spot t4g.small | On-Demand t4g.large |
| 노드 수 | 1~2 | 2~5 (HPA) |
| 도메인 | `*.eks-dev.viewus.co` | (현재 EC2 도메인 그대로) |
| DB | SQLite PVC | RDS (Phase B 이후) |
| Replicas | admin/internal-api 1, frontend 1 | admin/internal 1 (SQLite 단일 writer), frontend 2 |
| 모니터링 | kube-prometheus-stack | 동일 + Loki/Tempo (선택) |

---

## 주의 — SQLite 제약

현재 admin-api / internal-api 는 SQLite 단일 writer.
K8s 에서는:
- `replicas: 1` 고정 + `strategy: Recreate`
- PVC `ReadWriteOnce` (EBS gp3)
- 노드 장애 시 EBS 가 다른 노드로 attach (수 분 소요)

이게 진짜 cloud-native 가 아님. **다음 단계: RDS PostgreSQL 이관 (Phase B)** 후
admin-api 만 `replicas: 2+` 로 확장 가능.

---

## 학습 우선 순위

1. **kubectl 기본** (Pod/Deployment/Service)
2. **Kustomize overlay** — base 와 overlay 변형
3. **ArgoCD UI + GitOps** — drift / sync / rollback
4. **AWS Load Balancer Controller** — Ingress → ALB 자동 생성
5. **IRSA** (IAM Roles for Service Accounts) — 파드가 AWS API 호출
6. **External Secrets** — AWS Secrets Manager 연동
7. **kube-prometheus-stack** — ServiceMonitor / PrometheusRule
8. **HPA + KEDA** — 메트릭 기반 자동 스케일
9. **NetworkPolicy** — 파드 간 통신 제어
10. **Karpenter** — 노드 오토스케일 (ASG 대체)
