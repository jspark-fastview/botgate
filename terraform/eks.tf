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
  subnet_ids = local.subnet_ids

  # Pod Identity 사용 — IRSA 용 OIDC provider 불필요
  enable_irsa = false

  # 클러스터 생성한 IAM principal 에게 admin 자동 부여
  enable_cluster_creator_admin_permissions = true

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
