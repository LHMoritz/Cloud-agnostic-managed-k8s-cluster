# AWS EKS Provider

This module creates an Amazon EKS (Elastic Kubernetes Service) cluster.

## Prerequisites

### Install and Configure AWS CLI

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure credentials
aws configure
```

### Required IAM Permissions

The IAM user/role needs the following permissions:

- `AmazonEKSClusterPolicy`
- `AmazonEKSWorkerNodePolicy`
- `AmazonEC2ContainerRegistryReadOnly`
- `AmazonEKS_CNI_Policy`
- `AmazonVPCFullAccess`
- `IAMFullAccess` (for service roles)

Or use an admin policy for development purposes.

## Configuration

```bash
# Set provider and region
pulumi config set cloudProvider aws
pulumi config set region eu-central-1

# Basic configuration
pulumi config set environment dev
pulumi config set projectName my-k8s
```

### Available Regions

| Region | Description |
|--------|-------------|
| `eu-central-1` | Frankfurt |
| `eu-west-1` | Ireland |
| `eu-west-2` | London |
| `us-east-1` | N. Virginia |
| `us-west-2` | Oregon |

### AWS-Specific Options

```bash
# Private cluster (no public API endpoint)
pulumi config set awsPrivateCluster true

# Enable EBS CSI Driver
pulumi config set awsEnableEbsCsi true
```

## Instance Sizes

| Size | AWS Instance Type | vCPU | RAM |
|------|-------------------|------|-----|
| small | t3.small | 2 | 2 GB |
| medium | t3.medium | 2 | 4 GB |
| large | t3.large | 2 | 8 GB |
| xlarge | t3.xlarge | 4 | 16 GB |

## State Backend (S3)

```bash
# Create S3 bucket
aws s3 mb s3://my-pulumi-state-bucket --region eu-central-1

# Enable versioning (recommended)
aws s3api put-bucket-versioning \
  --bucket my-pulumi-state-bucket \
  --versioning-configuration Status=Enabled

# Configure Pulumi backend
pulumi login s3://my-pulumi-state-bucket
```

## Example Configuration

```yaml
# Pulumi.dev.yaml
config:
  k8s-setup:cloudProvider: aws
  k8s-setup:environment: dev
  k8s-setup:region: eu-central-1
  k8s-setup:projectName: my-k8s
  k8s-setup:kubernetesVersion: "1.31"
```

## Created Resources

- VPC with DNS support
- 3 public subnets (for load balancers)
- 3 private subnets (for worker nodes)
- Internet Gateway
- NAT Gateway + Elastic IP
- Route Tables
- EKS Cluster
- EKS Managed Node Groups
- IAM Roles and Policies

## Connect with kubectl

```bash
# Export kubeconfig
pulumi stack output kubeconfig --show-secrets > kubeconfig.yaml
export KUBECONFIG=./kubeconfig.yaml

# Or via AWS CLI
aws eks update-kubeconfig --name <cluster-name> --region eu-central-1

# Test connection
kubectl get nodes
```

## Cost Estimate

Approximate monthly costs (eu-central-1):

| Resource | Cost |
|----------|------|
| EKS Control Plane | ~$73 |
| NAT Gateway | ~$33 + traffic |
| t3.medium Node (x2) | ~$60 |
| **Total (minimal)** | **~$170/month** |
