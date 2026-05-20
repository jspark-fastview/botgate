# EKS cluster v2 — guardus-eks-v2 (b/d subnet)
# 옛 terraform/eks.tf 와 거의 동일. module 이름 만 _v2.
module "eks_v2" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = var.cluster_name
  cluster_version = var.k8s_version

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = false

  vpc_id     = local.vpc_id
  # b/d 만 — 2c IP 부족 회피, 2a 는 옛 cluster 와 segregation.
  subnet_ids = local.subnet_ids

  # Pod Identity 사용 — IRSA 용 OIDC provider 불필요
  enable_irsa = false

  # 클러스터 생성한 IAM principal 에게 admin 자동 부여
  enable_cluster_creator_admin_permissions = true

  # bootstrap_self_managed_addons=false 유지 — 이미 cluster created 상태라 변경 시 force replacement.
  # vpc-cni / kube-proxy 는 cluster_addons (EKS addon API) 로 명시 install — cluster bootstrap 설정과 별개로 강제 적용 가능.
  bootstrap_self_managed_addons = false

  # ⚠️ vpc-cni / kube-proxy 제거됨 (2026-05-20 사고 학습).
  # Cilium ENI mode + kubeProxyReplacement 로 대체 — addon 으로 vpc-cni 두면
  # 다음 terraform apply 시 aws-node DaemonSet 부활 → CNI 충돌 → pod 네트워크/DNS 다운.
  # cluster bootstrap 은 cilium.tf 의 helm_release 가 처리.
  cluster_addons = {
    coredns                = { most_recent = true }
    eks-pod-identity-agent = { most_recent = true }
    aws-ebs-csi-driver     = { most_recent = true }
  }

  # Karpenter EC2NodeClass.securityGroupSelectorTerms 가 자동 발견.
  # 누락 시 NodePool 이 NodeClassReady=False (SecurityGroupsNotFound) 로 빠져 provisioning 불가.
  node_security_group_tags = {
    "karpenter.sh/discovery" = var.cluster_name
  }

  eks_managed_node_groups = {
    spot = {
      ami_type       = "BOTTLEROCKET_ARM_64"
      instance_types = var.node_instance_types
      capacity_type  = "SPOT"

      min_size     = var.node_min_size
      desired_size = var.node_desired_size
      max_size     = var.node_max_size

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

      labels = { role = "workload" }
      tags = {
        "k8s.io/cluster-autoscaler/enabled"             = "true"
        "k8s.io/cluster-autoscaler/${var.cluster_name}" = "owned"
      }
    }

    # On-Demand baseline — spot 동시 회수 대비 (2026-05-18 학습)
    baseline = {
      ami_type       = "BOTTLEROCKET_ARM_64"
      instance_types = ["t4g.medium"]
      capacity_type  = "ON_DEMAND"

      min_size     = 1
      desired_size = 1
      max_size     = 2

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
        "k8s.io/cluster-autoscaler/enabled"             = "true"
        "k8s.io/cluster-autoscaler/${var.cluster_name}" = "owned"
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

  depends_on = [module.eks_v2]
}
