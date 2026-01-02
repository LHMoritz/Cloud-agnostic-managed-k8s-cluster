# GCP GKE Provider

This module creates a Google Kubernetes Engine (GKE) cluster.

## Prerequisites

### Install gcloud CLI

```bash
# macOS
brew install google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Install gke-gcloud-auth-plugin (required for kubectl)
gcloud components install gke-gcloud-auth-plugin
```

### Authenticate

```bash
# Interactive login
gcloud auth login

# Application Default Credentials (for Pulumi)
gcloud auth application-default login

# Set project
gcloud config set project <your-project-id>
```

### Enable APIs

The following APIs must be enabled in your GCP project:

```bash
# Required
gcloud services enable compute.googleapis.com           # VPC, Subnets, NAT, Firewall
gcloud services enable container.googleapis.com         # GKE Cluster & Node Pools
gcloud services enable iam.googleapis.com               # Service Accounts, Workload Identity
gcloud services enable cloudresourcemanager.googleapis.com  # Project Resources

# Optional (recommended)
gcloud services enable logging.googleapis.com           # Cloud Logging
gcloud services enable monitoring.googleapis.com        # Cloud Monitoring
gcloud services enable artifactregistry.googleapis.com  # Container Registry
```

### Enable All APIs at Once

```bash
gcloud services enable \
  compute.googleapis.com \
  container.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  artifactregistry.googleapis.com
```

## Configuration

```bash
# Set provider and region
pulumi config set cloudProvider gcp
pulumi config set region europe-west1
pulumi config set gcp:project <your-project-id>

# Basic configuration
pulumi config set environment dev
pulumi config set projectName my-k8s
```

### Available Regions

| Region | Description |
|--------|-------------|
| `europe-west1` | Belgium |
| `europe-west3` | Frankfurt |
| `europe-west4` | Netherlands |
| `us-central1` | Iowa |
| `us-east1` | South Carolina |

### GCP-Specific Options

```bash
# Enable private cluster
pulumi config set gcpPrivateCluster true

# Enable Workload Identity (recommended)
pulumi config set gcpEnableWorkloadIdentity true

# Zonal cluster (default: true - reduces quota usage and costs)
# Regional clusters replicate nodes across all 3 zones (3x resources!)
pulumi config set gcpZonalCluster true

# Set specific zone (optional, default: region + "-b")
pulumi config set gcpZone europe-west1-b
```

## Instance Sizes

| Size | GCP Machine Type | vCPU | RAM |
|------|------------------|------|-----|
| small | e2-small | 0.5-2 | 2 GB |
| medium | e2-medium | 1-2 | 4 GB |
| large | e2-standard-2 | 2 | 8 GB |
| xlarge | e2-standard-4 | 4 | 16 GB |

## State Backend (GCS)

```bash
# Create GCS bucket
gsutil mb -l europe-west1 gs://my-pulumi-state-bucket

# Enable versioning (recommended)
gsutil versioning set on gs://my-pulumi-state-bucket

# Configure Pulumi backend
pulumi login gs://my-pulumi-state-bucket
```

## Example Configuration

```yaml
# Pulumi.dev.yaml
config:
  k8s-setup:cloudProvider: gcp
  k8s-setup:environment: dev
  k8s-setup:region: europe-west1
  k8s-setup:projectName: my-k8s
  k8s-setup:kubernetesVersion: "1.33"
  gcp:project: my-gcp-project
  k8s-setup:gcpEnableWorkloadIdentity: true
```

## Created Resources

- VPC Network
- Subnet with Secondary IP Ranges (Pods, Services)
- Cloud Router
- Cloud NAT
- GKE Cluster (Zonal by default)
- Node Pools with Autoscaling
- Workload Identity (optional)
- Network Policy (Calico)

## Connect with kubectl

```bash
# Export kubeconfig
pulumi stack output kubeconfig --show-secrets > kubeconfig.yaml
export KUBECONFIG=./kubeconfig.yaml

# Or via gcloud
gcloud container clusters get-credentials <cluster-name> --region europe-west1

# Test connection
kubectl get nodes
```

## Cost Estimate

Approximate monthly costs (europe-west1):

| Resource | Cost |
|----------|------|
| GKE Management Fee | $0 (Standard) / $73 (Autopilot) |
| Cloud NAT | ~$33 + traffic |
| e2-medium Node (x2) | ~$50 |
| **Total (minimal)** | **~$85/month** |

> **Note**: GKE Standard has no management fee for the control plane.
