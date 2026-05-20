# terraform-v2

EKS `guardus-eks-v2` (ap-northeast-2 b/d) + RDS / Redis / S3(Loki) / IAM Pod Identity.

옛 `terraform/` (guardus-eks, a/c subnet) 은 2026-05 destroy 완료. 이 디렉토리가 현 운영 IaC.

## 분리 배경

옛 cluster `guardus-eks` 의 2c subnet IP 부족 사고 (2026-05-15) 후 cluster 재생성 대신 b/d 의 새 cluster 만들고 DNS cutover 한 결과. EKS cluster subnet AZ 집합은 생성 후 변경 불가라 새 cluster 만 해법.

## 리소스

| 파일 | 정의 |
|---|---|
| `eks.tf` | EKS cluster + mngd node group (spot + baseline on-demand). `node_security_group_tags` 로 Karpenter SG discovery 활성화 |
| `karpenter.tf` | Karpenter module (Pod Identity + SQS interruption queue + node IAM role) |
| `vpc.tf` | VPC / subnet은 data source (옛 VPC 재활용) + subnet 에 cluster/karpenter discovery tag |
| `cilium.tf` | Cilium CNI (kubeProxyReplacement + ENI mode) |
| `rds-prod.tf` | `guardus-prod-pg-v2` (import 된 RDS, lifecycle ignore password) |
| `rds-dev.tf` | `guardus-prod-pg-dev` (t4g.micro) |
| `elasticache.tf` | `guardus-prod-redis-v2` |
| `elasticache-dev.tf` | `guardus-prod-redis-dev` |
| `s3-loki.tf` | `guardus-loki-chunks-v2` S3 + IAM role + Pod Identity association |
| `iam.tf` | admin-api / external-secrets / ebs-csi / loki / aws-lb-controller / cilium-operator Pod Identity |

## 명령 (read-only / 사용자 직접 실행 구분)

```bash
# Claude 가 직접 가능 (조회 / plan)
terraform init
terraform validate
terraform plan
terraform plan -target=module.eks_v2.aws_security_group.node
terraform state list
terraform state show <addr>

# 사용자가 직접 실행 (cost / state 영향)
terraform apply
terraform destroy
```

state backend: S3 (`backend.tf`).

## 자주 쓰는 output

```bash
terraform output karpenter_node_iam_role_name
terraform output karpenter_queue_name
terraform output loki_s3
```

## 학습된 제약 (이 cluster 운영 중 학습)

- **subnet AZ 집합 변경 불가** — `aws_eks_cluster.vpc_config.subnet_ids` 에 새 AZ 추가 시 `InvalidParameterException`. cluster 재생성만 해법.
- **mngd NG subnet_ids 변경 = force replacement** — 기존 노드 다 destroy. 4 AZ 확장은 Karpenter 로 (EC2NodeClass.subnetSelectorTerms 의 태그로 자동 발견).
- **Karpenter SG discovery** — `karpenter.sh/discovery` tag 가 node SG 에 없으면 `NodeClassReady=False (SecurityGroupsNotFound)` → provisioning 불가. `eks.tf` 의 `node_security_group_tags` 가 그 tag 박음.
- **RDS cross-AZ 이전** — read replica → promote 패턴 (무다운타임). snapshot/restore 보다 빠르고 안전.

## 관련 디렉토리

- 옛 `terraform/` (guardus-eks, destroy 완료) — 참조용으로 남아있음. state 도 dangling. 정리 후보.
- K8s 매니페스트: [`../k8s/README.md`](../k8s/README.md)
