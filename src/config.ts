import * as pulumi from "@pulumi/pulumi";
import { ClusterConfig, CloudProvider, NodePoolConfig } from "./types";

/**
 * Load configuration from Pulumi config
 */
export function loadConfig(): ClusterConfig {
  const config = new pulumi.Config();
  const awsConfig = new pulumi.Config("aws");
  const gcpConfig = new pulumi.Config("gcp");
  const azureConfig = new pulumi.Config("azure-native");

  const provider = config.require("cloudProvider") as CloudProvider;
  const environment = config.require("environment");
  const projectName = config.get("projectName") || "k8s-cluster";

  // Validate provider
  if (!["aws", "gcp", "azure"].includes(provider)) {
    throw new Error(`Invalid cloud provider: ${provider}. Must be one of: aws, gcp, azure`);
  }

  // Default node pool configuration
  // diskSizeGb: 20 GB minimum to reduce quota usage
  const defaultNodePools: NodePoolConfig[] = [
    {
      name: "default",
      instanceSize: "medium",
      minSize: 1,
      maxSize: 5,
      desiredSize: 2,
      diskSizeGb: 20,
      labels: {
        role: "worker",
      },
    },
  ];

  // Try to parse custom node pools from config
  const nodePoolsJson = config.get("nodePools");
  const nodePools: NodePoolConfig[] = nodePoolsJson 
    ? JSON.parse(nodePoolsJson) 
    : defaultNodePools;

  const clusterConfig: ClusterConfig = {
    provider,
    clusterName: `${projectName}-${environment}`,
    kubernetesVersion: config.get("kubernetesVersion") || "1.29",
    region: config.require("region"),
    network: {
      vpcCidr: config.get("vpcCidr") || "10.0.0.0/16",
      privateSubnetCidrs: config.getObject<string[]>("privateSubnetCidrs") || [
        "10.0.1.0/24",
        "10.0.2.0/24",
        "10.0.3.0/24",
      ],
      publicSubnetCidrs: config.getObject<string[]>("publicSubnetCidrs") || [
        "10.0.101.0/24",
        "10.0.102.0/24",
        "10.0.103.0/24",
      ],
    },
    nodePools,
    tags: {
      Project: projectName,
      Environment: environment,
      ManagedBy: "pulumi",
      ...config.getObject<Record<string, string>>("tags"),
    },
  };

  // Add provider-specific config
  if (provider === "aws") {
    clusterConfig.aws = {
      privateCluster: config.getBoolean("awsPrivateCluster") || false,
      enableAddons: {
        vpcCni: true,
        coreDns: true,
        kubeProxy: true,
        ebsCsiDriver: config.getBoolean("awsEnableEbsCsi") || true,
      },
    };
  }

  if (provider === "gcp") {
    clusterConfig.gcp = {
      projectId: gcpConfig.require("project"),
      privateCluster: config.getBoolean("gcpPrivateCluster") || false,
      enableWorkloadIdentity: config.getBoolean("gcpEnableWorkloadIdentity") || true,
      zonalCluster: config.getBoolean("gcpZonalCluster") !== false, // Default: true (zonal)
      zone: config.get("gcpZone"),
    };
  }

  if (provider === "azure") {
    clusterConfig.azure = {
      resourceGroupName: config.require("azureResourceGroup"),
      subscriptionId: azureConfig.get("subscriptionId"),
      enableAzureAd: config.getBoolean("azureEnableAd") || false,
    };
  }

  return clusterConfig;
}

