import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { ClusterConfig, ClusterOutput, instanceSizeMapping } from "../../types";

/**
 * Creates an Azure AKS cluster with VNet and node pools
 */
export function createAksCluster(config: ClusterConfig): ClusterOutput {
  if (!config.azure) {
    throw new Error("Azure configuration is required for AKS cluster");
  }

  // Create or reference resource group
  const resourceGroup = new azure.resources.ResourceGroup("rg", {
    resourceGroupName: config.azure.resourceGroupName,
    location: config.region,
    tags: config.tags,
  });

  // Create Virtual Network
  const vnet = new azure.network.VirtualNetwork("vnet", {
    virtualNetworkName: `${config.clusterName}-vnet`,
    resourceGroupName: resourceGroup.name,
    location: config.region,
    addressSpace: {
      addressPrefixes: [config.network.vpcCidr],
    },
    tags: config.tags,
  });

  // Create subnet for AKS
  const aksSubnet = new azure.network.Subnet("aks-subnet", {
    subnetName: `${config.clusterName}-aks-subnet`,
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: config.network.privateSubnetCidrs[0],
  });

  // Create user-assigned managed identity for AKS
  const identity = new azure.managedidentity.UserAssignedIdentity("aks-identity", {
    resourceName: `${config.clusterName}-identity`,
    resourceGroupName: resourceGroup.name,
    location: config.region,
    tags: config.tags,
  });

  // Create AKS cluster
  const cluster = new azure.containerservice.ManagedCluster("aks-cluster", {
    resourceName: config.clusterName,
    resourceGroupName: resourceGroup.name,
    location: config.region,

    // Kubernetes version
    kubernetesVersion: config.kubernetesVersion,

    // DNS prefix
    dnsPrefix: config.clusterName,

    // Identity
    identity: {
      type: azure.containerservice.ResourceIdentityType.UserAssigned,
      userAssignedIdentities: [identity.id],
    },

    // Network profile
    networkProfile: {
      networkPlugin: "azure",
      networkPolicy: "azure",
      serviceCidr: "10.96.0.0/16",
      dnsServiceIP: "10.96.0.10",
    },

    // Default node pool
    agentPoolProfiles: [
      {
        name: config.nodePools[0].name.substring(0, 12).toLowerCase().replace(/[^a-z0-9]/g, ""),
        mode: "System",
        count: config.nodePools[0].desiredSize,
        minCount: config.nodePools[0].minSize,
        maxCount: config.nodePools[0].maxSize,
        enableAutoScaling: true,
        vmSize: instanceSizeMapping.azure[config.nodePools[0].instanceSize],
        osDiskSizeGB: config.nodePools[0].diskSizeGb,
        osType: "Linux",
        vnetSubnetID: aksSubnet.id,
        nodeLabels: config.nodePools[0].labels,
        nodeTaints: config.nodePools[0].taints?.map(
          t => `${t.key}=${t.value}:${t.effect}`
        ),
      },
    ],

    // Enable RBAC
    enableRBAC: true,

    // Azure AD integration (optional)
    aadProfile: config.azure.enableAzureAd
      ? {
          managed: true,
          enableAzureRBAC: true,
        }
      : undefined,

    // Auto-upgrade channel
    autoUpgradeProfile: {
      upgradeChannel: "patch",
    },

    // SKU
    sku: {
      name: "Base",
      tier: "Free",
    },

    tags: config.tags,
  });

  // Create additional node pools
  config.nodePools.slice(1).forEach((nodePool) => {
    new azure.containerservice.AgentPool(`nodepool-${nodePool.name}`, {
      agentPoolName: nodePool.name.substring(0, 12).toLowerCase().replace(/[^a-z0-9]/g, ""),
      resourceGroupName: resourceGroup.name,
      resourceName: cluster.name,
      mode: "User",
      count: nodePool.desiredSize,
      minCount: nodePool.minSize,
      maxCount: nodePool.maxSize,
      enableAutoScaling: true,
      vmSize: instanceSizeMapping.azure[nodePool.instanceSize],
      osDiskSizeGB: nodePool.diskSizeGb,
      osType: "Linux",
      vnetSubnetID: aksSubnet.id,
      nodeLabels: nodePool.labels,
      nodeTaints: nodePool.taints?.map(
        t => `${t.key}=${t.value}:${t.effect}`
      ),
    });
  });

  // Get cluster credentials
  const credentials = azure.containerservice.listManagedClusterUserCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    resourceName: cluster.name,
  });

  const kubeconfig = credentials.kubeconfigs.apply(creds => {
    if (creds && creds.length > 0) {
      const encoded = creds[0].value;
      return Buffer.from(encoded, "base64").toString("utf-8");
    }
    return "";
  });

  return {
    clusterName: cluster.name,
    kubeconfig: kubeconfig,
    endpoint: cluster.fqdn.apply(fqdn => `https://${fqdn}`),
    clusterId: cluster.id,
  };
}

