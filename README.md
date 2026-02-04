# K8s-Setup

Cloud-agnostic Kubernetes cluster deployment with Pulumi and TypeScript.

## Supported Cloud Providers

| Provider | Service | Documentation |
|----------|---------|---------------|
| **AWS** | Amazon EKS | [→ AWS EKS README](src/providers/aws-eks/README.md) |
| **GCP** | Google Kubernetes Engine | [→ GCP GKE README](src/providers/gcp-gke/README.md) |
| **Azure** | Azure Kubernetes Service | [→ Azure AKS README](src/providers/azure-aks/README.md) |

## Project Structure

```
k8s-setup/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config.ts             # Configuration loader
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   └── providers/
│       ├── aws-eks/          # AWS EKS module + README
│       ├── gcp-gke/          # GCP GKE module + README
│       └── azure-aks/        # Azure AKS module + README
├── scripts/
│   └── setup-kubeconfig.sh   # kubectl access helper
├── Pulumi.yaml               # Pulumi project configuration
├── Pulumi.*.yaml.example     # Example stack configurations
├── package.json
├── tsconfig.json
└── README.md
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18.x
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- Cloud provider CLI → see provider-specific README

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Initialize Pulumi stack
pulumi stack init dev

# 3. Configure provider (example: AWS)
pulumi config set cloudProvider aws
pulumi config set region eu-central-1
pulumi config set environment dev
pulumi config set projectName my-k8s

# 4. Deploy cluster
pulumi up

# 5. Connect with kubectl
./scripts/setup-kubeconfig.sh dev
kubectl get nodes
```

## Configuration

### Select Cloud Provider

```bash
# AWS EKS
pulumi config set cloudProvider aws
pulumi config set region eu-central-1

# GCP GKE
pulumi config set cloudProvider gcp
pulumi config set region europe-west1
pulumi config set gcp:project <your-project-id>

# Azure AKS
pulumi config set cloudProvider azure
pulumi config set region westeurope
pulumi config set azureResourceGroup <your-resource-group>
```

### Basic Configuration

```bash
pulumi config set environment dev
pulumi config set projectName my-k8s
pulumi config set kubernetesVersion 1.34
```

### Node Pools (Optional)

```bash
pulumi config set nodePools '[
  {
    "name": "default",
    "instanceSize": "small",
    "minSize": 1,
    "maxSize": 5,
    "desiredSize": 2,
    "diskSizeGb": 20,
    "labels": { "role": "worker" }
  }
]'
```

### Instance Sizes

| Size | AWS | GCP | Azure |
|------|-----|-----|-------|
| small | t3.small | e2-small | Standard_B2s |
| medium | t3.medium | e2-medium | Standard_B2ms |
| large | t3.large | e2-standard-2 | Standard_D2s_v3 |
| xlarge | t3.xlarge | e2-standard-4 | Standard_D4s_v3 |

## State Backend

Pulumi stores state in Pulumi Cloud by default. For self-hosted state, see provider-specific READMEs:

- [AWS S3 Backend](src/providers/aws-eks/README.md#state-backend-s3)
- [GCP GCS Backend](src/providers/gcp-gke/README.md#state-backend-gcs)
- [Azure Blob Backend](src/providers/azure-aks/README.md#state-backend-azure-blob-storage)

```bash
# Return to Pulumi Cloud
pulumi login
```

## Access Cluster with kubectl

After deploying, configure kubectl access:

### Option 1: Using the setup script (recommended)

```bash
# Configure kubectl access (works in all terminals)
./scripts/setup-kubeconfig.sh <stack-name>

# Test connection
kubectl get nodes
```

The script merges the cluster config into `~/.kube/config` and makes it available system-wide.

### Option 2: Manual export

```bash
# Export kubeconfig to file
pulumi stack output kubeconfig --show-secrets > kubeconfig.yaml
export KUBECONFIG=./kubeconfig.yaml

# Test connection
kubectl get nodes
```

### Option 3: Provider-specific CLI tools

See provider-specific READMEs for alternative methods:
- AWS: `aws eks update-kubeconfig --name <cluster-name> --region <region>`
- GCP: `gcloud container clusters get-credentials <cluster-name> --region <region>`
- Azure: `az aks get-credentials --resource-group <rg> --name <cluster-name>`

## Stack Management

```bash
# Create new stack
pulumi stack init staging

# Switch stack
pulumi stack select dev

# List all stacks
pulumi stack ls

# Delete cluster resources (keeps stack config)
pulumi destroy

# Delete stack completely
pulumi stack rm <stack-name>
```

## Architecture

Each cloud provider creates:

- **Network**: VPC/VNet with private and public subnets
- **NAT Gateway**: For outbound internet traffic from private nodes
- **Managed Kubernetes Cluster**: EKS/GKE/AKS with configurable version
- **Node Pools**: Auto-scaling worker nodes
- **IAM/Identity**: Service accounts and roles for the cluster

## Cost Comparison (Minimal Setup)

| Provider | Control Plane | 1 Node (small) | NAT | Total/Month |
|----------|---------------|----------------|-----|-------------|
| **GCP GKE** | $0 | ~$12 | ~$32 | **~$45** |
| **Azure AKS** | $0 | ~$33 | $0* | **~$56** |
| **AWS EKS** | $72 | ~$15 | ~$32 | **~$125** |

\* Azure uses Load Balancer for outbound traffic (included)

## Provider Documentation

Detailed setup guides for each provider:

- **[AWS EKS](src/providers/aws-eks/README.md)**: IAM setup, regions, costs
- **[GCP GKE](src/providers/gcp-gke/README.md)**: Enable APIs, Workload Identity, costs
- **[Azure AKS](src/providers/azure-aks/README.md)**: Resource providers, Azure AD, costs

## License

UNLICENSED
