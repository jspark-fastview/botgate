# terraform-v2 — guardus-eks-v2 (Blue/Green migration)

옛 `terraform/` (guardus-eks) 와 **분리된 별도 state** 의 새 cluster.
2026-05-19 사고 (2c subnet IP 부족) 의 근본 해결로 cluster 재생성 대신 새 cluster 만들고 DNS cutover.

## 분리 설계

```
terraform/        guardus-eks       (a/c subnet, state key = eks/...)        ← 옛
terraform-v2/     guardus-eks-v2    (b/d subnet, state key = eks-v2/...)     ← 새
```

- **VPC / ECR**: data source 로 share (옛 거 참조)
- **IAM Pod Identity**: cluster-별 새로 생성 (association 은 cluster ARN 의존)
- **RDS / Redis**: 새 v2 안에 별도 정의 — 2b 로 새로 (phase 2/3)
- **ArgoCD / app**: 같은 GitOps repo 사용. 새 cluster 에 ArgoCD 만 수동 bootstrap.

## 작업 순서

1. `terraform init`  → S3 backend 새 key migrate
2. `terraform plan`  → 0 destroy 확인 (옛 cluster 안 흔듦)
3. `terraform apply`
4. `aws eks update-kubeconfig --name guardus-eks-v2 --region ap-northeast-2 --alias guardus-v2`
5. `kubectl --context guardus-v2 apply -f ../k8s/bootstrap/argocd-install.yaml`
6. `kubectl --context guardus-v2 apply -f ../k8s/bootstrap/app-of-apps.yaml`
7. Phase 2/3 (새 RDS / Redis) → Phase 4 (app deploy 자동) → Phase 5 (DNS cutover)

## 옛 cluster 와의 동시 운영

같은 GitOps repo 보지만 ArgoCD application 의 `destination.server` 가 cluster-내부 (`https://kubernetes.default.svc`) 라 각 cluster 의 ArgoCD 가 자기 cluster 에만 deploy. 충돌 없음.

DNS cutover (Phase 5) 전엔 옛 cluster 가 트래픽 받음. 새 cluster 는 hot standby.
