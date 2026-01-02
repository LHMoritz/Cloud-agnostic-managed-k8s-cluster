# Azure AKS Provider

This module creates an Azure Kubernetes Service (AKS) cluster.

## Prerequisites

### Install Azure CLI

```bash
# macOS
brew install azure-cli

# Linux (Ubuntu/Debian)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Linux (RHEL/CentOS)
sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc
sudo dnf install azure-cli
```

### Authenticate

```bash
# Interactive login
az login

# Set subscription (if multiple)
az account set --subscription <subscription-id>

# Show current subscription
az account show
```

### Register Resource Providers

```bash
# Register required providers
az provider register --namespace Microsoft.ContainerService
az provider register --namespace Microsoft.Network
az provider register --namespace Microsoft.Compute
az provider register --namespace Microsoft.ManagedIdentity

# Check status
az provider show --namespace Microsoft.ContainerService --query "registrationState"
```

## Configuration

```bash
# Set provider and region
pulumi config set cloudProvider azure
pulumi config set region westeurope
pulumi config set azureResourceGroup my-resource-group

# Basic configuration
pulumi config set environment dev
pulumi config set projectName my-k8s
```

### Available Regions

| Region | Description |
|--------|-------------|
| `westeurope` | Netherlands |
| `northeurope` | Ireland |
| `germanywestcentral` | Frankfurt |
| `eastus` | Virginia |
| `westus2` | Washington |

### Azure-Specific Options

```bash
# Enable Azure AD integration
pulumi config set azureEnableAd true

# Subscription ID (if not from az login)
pulumi config set azure-native:subscriptionId <subscription-id>
```

## Instance Sizes

| Size | Azure VM Size | vCPU | RAM |
|------|---------------|------|-----|
| small | Standard_B2s | 2 | 4 GB |
| medium | Standard_B2ms | 2 | 8 GB |
| large | Standard_D2s_v3 | 2 | 8 GB |
| xlarge | Standard_D4s_v3 | 4 | 16 GB |

## State Backend (Azure Blob Storage)

```bash
# Create resource group
az group create --name pulumi-state-rg --location westeurope

# Create storage account
az storage account create \
  --name mypulumistate \
  --resource-group pulumi-state-rg \
  --location westeurope \
  --sku Standard_LRS

# Create container
az storage container create \
  --name pulumi \
  --account-name mypulumistate

# Configure Pulumi backend
pulumi login azblob://pulumi?storage_account=mypulumistate
```

## Example Configuration

```yaml
# Pulumi.dev.yaml
config:
  k8s-setup:cloudProvider: azure
  k8s-setup:environment: dev
  k8s-setup:region: westeurope
  k8s-setup:projectName: my-k8s
  k8s-setup:kubernetesVersion: "1.33.5"
  k8s-setup:azureResourceGroup: my-k8s-rg
```

## Created Resources

- Resource Group
- Virtual Network (VNet)
- Subnet for AKS
- User-Assigned Managed Identity
- AKS Cluster
- System Node Pool
- Optional User Node Pools
- Azure AD Integration (optional)

## Connect with kubectl

```bash
# Export kubeconfig
pulumi stack output kubeconfig --show-secrets > kubeconfig.yaml
export KUBECONFIG=./kubeconfig.yaml

# Or via Azure CLI
az aks get-credentials --resource-group my-k8s-rg --name my-k8s-dev

# Test connection
kubectl get nodes
```

## Cost Estimate

Approximate monthly costs (westeurope):

| Resource | Cost |
|----------|------|
| AKS Control Plane | $0 (Free Tier) |
| Standard_B2ms Node (x2) | ~$120 |
| Load Balancer | ~$20 |
| **Total (minimal)** | **~$140/month** |

> **Note**: AKS has no control plane fee in the Free Tier. For SLA guarantee, the Standard Tier ($73/month) is available.

## Azure-Specific Features

### Azure AD Integration

```bash
# Enable Azure AD for RBAC
pulumi config set azureEnableAd true
```

With Azure AD integration, Azure AD users and groups can be used for Kubernetes RBAC.

### Azure Container Registry (ACR)

```bash
# Create ACR
az acr create --resource-group my-k8s-rg --name myacr --sku Basic

# Attach ACR to AKS (after cluster creation)
az aks update --resource-group my-k8s-rg --name my-k8s-dev --attach-acr myacr
```
