# Terraform — EKS 인프라

`k8s/bootstrap/cluster.yaml` (eksctl) 의 **대체**.
하나의 IaC 소스로 통일 → drift 방지.

## 관리 범위

| 리소스 | 파일 | 비고 |
|---|---|---|
| VPC | `vpc.tf` | **기존 `content-vpc` 재사용** (data source). AZ a/c 서브넷 + EKS discovery tag 만 추가 |
| EKS 클러스터 + Spot 노드그룹 | `eks.tf` | `terraform-aws-modules/eks/aws`, public IP 강제 |
| ECR 레포 × 4 | `ecr.tf` | admin-api / internal-api / openresty / frontend |
| IAM 역할 + Pod Identity 매핑 × 4 | `iam.tf` | external-secrets / aws-lb-controller / admin-api / ebs-csi |
| GitHub OIDC + ECR push role | `iam.tf` | CI 용 |
| Secrets Manager (빈 stub) | `secrets.tf` | **값은 콘솔/CLI 로 수동 주입** |
| Outputs | `outputs.tf` | cluster endpoint, OIDC issuer, ECR URLs, role ARNs |

## 관리 범위 밖

- in-cluster 매니페스트 (Deployment, Ingress, …) → **ArgoCD + Kustomize** (`k8s/`)
- Helm 차트 (ALB controller, cert-manager, prometheus, ESO) → **ArgoCD Application** (`k8s/argocd/apps/platform/`)
- Secrets Manager 의 실제 값 → 콘솔/CLI

## 사용

```bash
cd terraform
terraform init
terraform plan
terraform apply        # ≈ 15~20분
```

apply 완료 후:

```bash
# 1. kubeconfig
aws eks update-kubeconfig --name guardus-eks --region ap-northeast-2

# 2. ArgoCD install
kubectl apply -f ../k8s/bootstrap/argocd-install.yaml

# 3. app-of-apps (이후 모든 sync 자동)
kubectl apply -f ../k8s/bootstrap/app-of-apps.yaml

# 4. Secrets Manager 값 주입 (예시)
aws secretsmanager put-secret-value \
  --secret-id guardus/dev/admin-api \
  --secret-string '{"ADMIN_KEY":"...","STATS_KEY":"..."}'
```

## State backend

S3 backend 사용 (`backend.tf`). 노트북 분실 시 state 손실 방지 + 협업/CI 대비.
Lock 은 S3 native conditional writes (TF 1.10+) — DynamoDB 불필요.

**1회 선행 작업** (apply 전 한 번):

```bash
ACCT=124052247302
BUCKET=guardus-tfstate-$ACCT
REGION=ap-northeast-2

aws s3api create-bucket \
  --bucket $BUCKET \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION

aws s3api put-bucket-versioning \
  --bucket $BUCKET \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket $BUCKET \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket $BUCKET \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

**state 이관** (이미 local state 가 있다면):

```bash
terraform init -migrate-state
# → "Do you want to copy existing state to the new backend?" → yes
```

신규 init 인 경우는 그냥 `terraform init`.

## 삭제

```bash
# 클러스터 떠난 후 ALB/PVC 가 leak 될 수 있어 ArgoCD 로 앱 먼저 prune
kubectl delete applications --all -n argocd

terraform destroy
```
