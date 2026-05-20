provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "GuardUs"
      ManagedBy = "Terraform"
      Env       = var.env
      Cluster   = var.cluster_name
    }
  }
}

# kubernetes/helm provider 는 새 cluster (module.eks_v2) 출력 의존.
provider "kubernetes" {
  host                   = module.eks_v2.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks_v2.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks_v2.cluster_name, "--region", var.region]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks_v2.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks_v2.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args       = ["eks", "get-token", "--cluster-name", module.eks_v2.cluster_name, "--region", var.region]
    }
  }
}
