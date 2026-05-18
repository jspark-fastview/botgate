# EKS cluster + 관리형 Spot 노드그룹
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = var.cluster_name
  cluster_version = var.k8s_version

  # public-only VPC — control plane endpoint 도 public 으로 노출
  # 학습용이라 OK, prod 면 private endpoint + bastion 고려
  cluster_endpoint_public_access = true
  cluster_endpoint_private_access = false

  vpc_id     = local.vpc_id
  # ⚠️ EKS cluster 의 subnet AZ 집합은 cluster 생성 후 변경 불가 (AWS 제약).
  # cluster 는 a/c 그대로. 4 AZ 활용은 Karpenter 가 담당 (b/d subnet 도 태그로 발견).
  # 만약 control plane ENI 가 2c IP 부족 (InsufficientFreeAddresses) 으로 진짜 막히면
  # → 그땐 EKS 재생성하는 별도 작업 필요 (다운타임 큰 작업).
  subnet_ids = local.subnet_ids

  # Pod Identity 사용 — IRSA 용 OIDC provider 불필요
  enable_irsa = false

  # 클러스터 생성한 IAM principal 에게 admin 자동 부여
  enable_cluster_creator_admin_permissions = true

  # TODO: 다음 클러스터 부팅 시 bootstrap_self_managed_addons = false 추가 권장.
  # 그래야 aws-node / kube-proxy 자동 설치 안 됨 (Cilium 가 둘 다 대체).
  # 단, 이 속성은 create-time 만 적용 — 기존 클러스터에 추가하면 destroy+recreate 발생.
  # 현재 클러스터는 'kubectl delete daemonset' 로 수동 정리 (이미 처리됨).

  # EKS-managed addons
  # vpc-cni, kube-proxy 는 Cilium 이 대체 (cilium.tf)
  # ebs-csi 권한은 iam.tf 의 aws_eks_pod_identity_association.ebs_csi 가 담당
  # coredns 는 Cilium 이 노드를 Ready 로 만든 뒤에 스케줄됨 (의존성 자동 해결)
  cluster_addons = {
    coredns                = { most_recent = true }
    eks-pod-identity-agent = { most_recent = true }
    aws-ebs-csi-driver     = { most_recent = true }
  }

  eks_managed_node_groups = {
    spot = {
      ami_type       = "BOTTLEROCKET_ARM_64"
      instance_types = var.node_instance_types
      capacity_type  = "SPOT"

      min_size     = var.node_min_size
      desired_size = var.node_desired_size
      max_size     = var.node_max_size

      # public subnet 배치 + public IP 강제
      # (content-vpc 의 서브넷은 MapPublicIpOnLaunch=False 라 launch template 에서 명시)
      # ⚠️ managed node group 의 subnet_ids 변경은 force replacement → 기존 노드 다 destroy.
      # 그래서 a/c 그대로 둠. 4 AZ 활용은 Karpenter 가 담당 (EC2NodeClass 가 태그로 자동 발견).
      subnet_ids = local.subnet_ids

      # public IP 자동 할당 — NAT 없이 ECR/Secrets Manager 접근하려면 필수
      network_interfaces = [{
        associate_public_ip_address = true
        delete_on_termination       = true
      }]

      # gp3 root disk
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size = 30
            volume_type = "gp3"
            encrypted   = true
          }
        }
      }

      labels = { role = "workload" }
      tags = {
        "k8s.io/cluster-autoscaler/enabled"               = "true"
        "k8s.io/cluster-autoscaler/${var.cluster_name}"   = "owned"
      }
    }

    # On-Demand baseline — spot 동시 회수 시 안정 기반 1 노드.
    # 비용 ~$30/월 (t4g.medium). 채널 다운 1회 손해 << 월 $30.
    baseline = {
      ami_type       = "BOTTLEROCKET_ARM_64"
      instance_types = ["t4g.medium"]
      capacity_type  = "ON_DEMAND"

      min_size     = 1
      desired_size = 1
      max_size     = 2

      # spot 과 동일한 subnet (a/c) 사용 — 4 AZ 확장은 Karpenter 담당.
      subnet_ids = local.subnet_ids

      network_interfaces = [{
        associate_public_ip_address = true
        delete_on_termination       = true
      }]

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size = 30
            volume_type = "gp3"
            encrypted   = true
          }
        }
      }

      labels = { role = "workload-baseline" }
      tags = {
        "k8s.io/cluster-autoscaler/enabled"               = "true"
        "k8s.io/cluster-autoscaler/${var.cluster_name}"   = "owned"
      }
    }
  }
}

# gp3 StorageClass — EKS 기본은 gp2 라 별도 정의 필요
resource "kubernetes_storage_class_v1" "gp3" {
  metadata {
    name = "gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }
  storage_provisioner    = "ebs.csi.aws.com"
  reclaim_policy         = "Delete"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true
  parameters = {
    type      = "gp3"
    encrypted = "true"
  }

  depends_on = [module.eks]
}
